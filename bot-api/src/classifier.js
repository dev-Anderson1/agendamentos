/**
 * Classificador de intenções — Studio Erika Thebas.
 * Devolve só JSON estruturado; nunca inventa horários/preços.
 */

import { detectarServicoCatalogo } from './faq.js';

const INTENCOES = new Set([
  'ver_disponibilidade',
  'listar_servicos',
  'listar_profissionais',
  'agendar',
  'meus_horarios',
  'cancelar',
  'info',
  'equipe',
  'outro',
]);

export const CLASSIFIER_SYSTEM_PROMPT = `Você é um classificador de intenções para o WhatsApp do Studio Erika Thebas, um salão de beleza.

Sua única função é ler a mensagem do cliente e devolver um JSON estruturado com a intenção identificada. Você NUNCA responde diretamente ao cliente, NUNCA inventa horários, preços ou disponibilidade. Apenas classifica.

Responda SOMENTE com um JSON válido, sem texto antes ou depois, no formato exato:

{
  "intencao": "ver_disponibilidade" | "listar_servicos" | "listar_profissionais" | "agendar" | "meus_horarios" | "cancelar" | "info" | "equipe" | "outro",
  "servico": "nome do serviço mencionado, ou null",
  "data": "trecho de texto referente a dia/horário mencionado, ou null"
}

## Intenções

### ver_disponibilidade
Cliente pergunta se tem horário livre / vaga / encaixe, sem fechar o agendamento ainda.
Exemplos: "tem horário hoje?", "quais horários vocês tem amanhã pra escova", "que dia vcs tem livre essa semana", "tem vaga pra corte de cabelo sexta", "consigo fazer unha hoje ainda?", "vcs tem horário de manha ou só de tarde", "que horas sobra vaga pra hidratação", "tem algum horário livre pra sabado", "voces atendem hoje ainda?", "quero ver os horarios disponiveis", "que horário fica livre pra fazer luzes", "tem encaixe pra hoje?", "amanha de tarde?"

### agendar
Intenção clara de marcar / criar um horário novo.
Exemplos: "quero marcar um horário", "quero agendar uma escova pra amanha as 15h", "pode marcar corte pra mim sexta de manha", "quero fazer hidratação, da pra marcar hoje?", "vou querer agendar pra terça", "marca ai um horario pra mim", "quero fazer sobrancelha, tem como marcar agora", "bom dia, gostaria de agendar um horário", "quero remarcar... ah não, quero marcar um novo mesmo", "consegue me encaixar pra amanha?"

### listar_servicos
Catálogo, preços, se fazem determinado serviço, pacotes, diferenças.
Exemplos: "quanto custa uma escova", "quais servicos vcs fazem", "voces fazem progressiva?", "qual o preço do corte", "tem manicure ai?", "faz sobrancelha com henna?", "quanto ta a hidratação", "voces fazem unha em gel", "tem pacote de day spa", "qual a diferença entre escova e progressiva", "vcs fazem coloração", "tem desconto pra corte + escova"

### listar_profissionais
Cliente pergunta quem são as profissionais e o que fazem (NÃO é login da equipe).
Exemplos: "quais profissionais vcs tem", "quem faz escova?", "a equipe faz o quê?" — aceite typos ("emprofssionais").

### meus_horarios
Cliente quer ver/confirmar os próprios agendamentos já existentes.
Exemplos: "quais horarios eu tenho marcado", "quando é meu proximo horario", "eu marquei alguma coisa mesmo?", "confirma meu agendamento ai", "que dia era meu horario mesmo", "esqueci que dia marquei", "meu agendamento tá confirmado?"

### cancelar
Cancelar, desmarcar, remarcar ou mudar horário já existente.
Exemplos: "quero cancelar meu horario", "preciso desmarcar", "não vou conseguir ir amanha, cancela pra mim", "quero remarcar pra outro dia", "da pra mudar meu horario de sexta pra sabado", "cancela o corte que marquei", "não vou poder comparecer"

### info
Funcionamento, endereço, pagamento, estacionamento, almoço, feriado.
Exemplos: "que horas vcs abrem", "vcs atendem domingo?", "qual o endereço ai", "tem estacionamento", "vcs aceitam cartão", "qual o horario de funcionamento", "voces fecham pra almoço?", "tem atendimento em feriado", "aceita pix?", "qual o ponto de referencia"

### equipe
SOMENTE profissional do salão acessando a própria agenda (não cliente perguntando sobre a equipe).
Exemplos: "equipe", "sou profissional", "sou a Ana, quero ver minha agenda", "aqui é a Carla, manda minha agenda de hoje", "quero ver meus atendimentos de amanha", "acessar agenda profissional"

### outro
Saudações puras, agradecimentos, fora de escopo.
Exemplos: "oi", "bom dia", "obrigada", "tudo bem?", "vcs ainda existem?", "esse numero é do salão mesmo?", reclamações/elogios genéricos.

## Observações importantes
- Mensagens de voz transcritas vêm sem pontuação e com erros — use o sentido geral, não a grafia exata.
- Se combinar duas intenções (ex: "quanto custa a escova e vocês tem horário hoje?"), priorize a ação final (em geral ver_disponibilidade ou agendar).
- Tolere abreviações/typos: vc, vcs, pra, ta, naum, eh, sem acento.
- Se mencionar só dia/período sem verbo claro (ex: "amanha de tarde?"), use ver_disponibilidade.
- "encaixe" sozinho/com dia → ver_disponibilidade; "consegue me encaixar" / "marca" → agendar.
- "remarcar" / mudar horário existente → cancelar (fluxo de alteração).
- Extraia "servico" só se houver serviço específico; senão null.
- Extraia "data" como trecho literal de dia/horário; senão null.`;

/** Detecta pergunta de cliente sobre profissionais (aceita typos tipo "emprofssionais"). */
function mencionaProfissionaisCliente(t) {
  if (isEquipeLogin(t)) return false;
  return (
    t.includes('profissional') ||
    t.includes('profissionais') ||
    /em?prof+s*i*o*n/.test(t) ||
    /prof+s*i*o*n/.test(t) ||
    t.includes('quem atende') ||
    t.includes('quem faz') ||
    t.includes('quem sao') ||
    t.includes('quais as meninas') ||
    t.includes('funcionaria') ||
    t.includes('cabeleireira') ||
    (t.includes('equipe') &&
      (t.includes('quais') ||
        t.includes('quem') ||
        t.includes('tem') ||
        t.includes('faz') ||
        t.includes('o que')))
  );
}

function isEquipeLogin(t) {
  if (
    /^(equipe|sou profissional|agenda profissional|acesso (da )?equipe|acessar agenda( profissional)?)$/.test(
      t,
    )
  ) {
    return true;
  }
  if (t.includes('sou da equipe') || t.includes('sou profissional')) return true;
  if (t.includes('agenda profissional') || t.includes('acessar agenda')) return true;
  // "sou a Ana, quero ver minha agenda" / "aqui é a Carla, manda minha agenda"
  if (
    (/^(sou a |sou o |aqui e a |aqui e o |aqui eh a |aqui eh o )/.test(t) ||
      t.includes('manda minha agenda') ||
      t.includes('ver minha agenda') ||
      t.includes('meus atendimentos')) &&
    (t.includes('agenda') || t.includes('atendimento'))
  ) {
    return true;
  }
  return false;
}

function normalize(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extrairServico(t) {
  // Variações de corte masculino. O valor normalizado ainda será conferido
  // contra o catálogo real do banco antes de qualquer resposta.
  const corteMasculino =
    /\b(?:corte|cortar)\b.{0,25}\b(?:masc\w*|homem|homens|menino|meninos)\b/.test(t) ||
    /\bcorte\s+(?:de\s+cabelo\s+)?m\b/.test(t) ||
    /\bcorte\s+(?:para|pra|de)\s+(?:o\s+)?homem\b/.test(t) ||
    /\b(?:degrade|fade|navalhado)\b/.test(t) ||
    /\bcorte\b.{0,15}\b(?:maquina|barbearia)\b/.test(t);

  if (corteMasculino) return 'corte masculino';

  const servicoCatalogo = detectarServicoCatalogo(t);
  if (servicoCatalogo) return servicoCatalogo;

  const mapa = [
    ['progressiva', 'progressiva'],
    ['hidratacao', 'hidratação'],
    ['coloracao', 'coloração'],
    ['morena iluminada', 'morena iluminada'],
    ['banho de gel', 'banho de gel'],
    ['alongamento', 'alongamento de unhas'],
    ['nail art', 'nail art'],
    ['day spa', 'day spa'],
    ['spa capilar', 'spa capilar'],
    ['terapia capilar', 'terapia capilar'],
    ['sobrancelha', 'sobrancelha'],
    ['henna', 'sobrancelha'],
    ['manicure', 'manicure'],
    ['pedicure', 'pedicure'],
    ['unha em gel', 'banho de gel'],
    ['unha', 'manicure'],
    ['escova', 'escova'],
    ['luzes', 'luzes'],
    ['mechas', 'mechas'],
    ['penteado', 'penteados'],
    ['maquiagem', 'maquiagem'],
    ['selagem', 'selagem'],
    ['botox', 'botox'],
    ['corte', 'corte'],
    ['barba', 'barba'],
  ];
  for (const [chave, nome] of mapa) {
    if (t.includes(chave)) return nome;
  }
  return null;
}

function extrairData(raw, t) {
  const patterns = [
    /\b(hoje|amanha|amanhã)\b(?:\s+(?:ainda|as|às|a|de)?\s*(?:\d{1,2}(?::\d{2})?\s*h?|(?:de\s+)?(?:manha|manhã|tarde|noite))?)?/i,
    /\b(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)\b(?:\s+(?:de\s+)?(?:manha|manhã|tarde|noite))?(?:\s+(?:as|às|a)?\s*\d{1,2}(?::\d{2})?\s*h?)?/i,
    /\bessa\s+semana\b/i,
    /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b(?:\s+(?:as|às|a)?\s*\d{1,2}(?::\d{2})?\s*h?)?/i,
    /\b(?:as|às)\s*\d{1,2}(?::\d{2})?\s*h?\b/i,
    /\b\d{1,2}(?::\d{2})?\s*h\b/i,
    /\b(?:de\s+)?(?:manha|manhã|tarde|noite)\b/i,
  ];
  for (const re of patterns) {
    const m = String(raw).match(re);
    if (m) return m[0].trim();
  }
  for (const re of patterns) {
    const m = t.match(re);
    if (m) return m[0].trim();
  }
  return null;
}

function emptyResult(intencao = 'outro') {
  return { intencao, servico: null, data: null };
}

function hasAny(t, parts) {
  return parts.some((p) => t.includes(p));
}

/** Classificação por regras (funciona sem API key). */
export function classifyIntentRules(texto = '') {
  const raw = String(texto || '').trim();
  const t = normalize(raw);
  if (!t) return emptyResult('outro');

  const servico = extrairServico(t);
  const data = extrairData(raw, t);

  // --- equipe (login profissional) — bem restrito ---
  if (isEquipeLogin(t)) {
    return { intencao: 'equipe', servico: null, data: null };
  }

  // --- profissionais (visão do cliente) ---
  if (mencionaProfissionaisCliente(t)) {
    return { intencao: 'listar_profissionais', servico, data: null };
  }

  // --- cancelar / remarcar / não comparecer ---
  if (
    hasAny(t, [
      'cancel',
      'desmarcar',
      'desmarca',
      'remarcar',
      'remarca',
      'nao vou conseguir',
      'nao vou poder',
      'nao vou comparecer',
      'nao poderei',
      'mudar meu horario',
      'trocar meu horario',
      'mudar o horario',
    ]) ||
    (t.includes('cancela') && (t.includes('pra mim') || servico || data || t.includes('marquei')))
  ) {
    return { intencao: 'cancelar', servico, data };
  }

  // --- meus horários / confirmar agendamento existente ---
  if (
    hasAny(t, [
      'meu horario',
      'meus horarios',
      'minha agenda',
      'tenho marcado',
      'proximo horario',
      'quando e meu',
      'quando e o meu',
      'que dia era meu',
      'que dia eu marquei',
      'esqueci que dia',
      'marquei alguma',
      'meu agendamento',
      'confirma meu',
      'esta confirmado',
      'ta confirmado',
      'eu marquei',
    ])
  ) {
    return { intencao: 'meus_horarios', servico: null, data: null };
  }

  // --- info do salão ---
  if (
    hasAny(t, [
      'que horas abrem',
      'horario de funcionamento',
      'funcionamento',
      'atendem domingo',
      'abre domingo',
      'endereco',
      'onde fica',
      'ponto de referencia',
      'estacionamento',
      'aceitam cartao',
      'aceita cartao',
      'aceitam pix',
      'aceita pix',
      'feriado',
      'almoco',
      'fecham pra almoco',
      'fecha almoco',
    ]) ||
    (t.includes('abre') && (t.includes('hora') || t.includes('quando'))) ||
    (t.includes('atendem') && (t.includes('domingo') || t.includes('segunda') || t.includes('feriado')))
  ) {
    return { intencao: 'info', servico: null, data: null };
  }

  // --- listar serviços / preços / "vocês fazem X?" ---
  if (
    hasAny(t, [
      'quanto custa',
      'quanto ta',
      'quanto esta',
      'preco',
      'preços',
      'valores',
      'valor da',
      'valor do',
      'quais servicos',
      'que servicos',
      'servicos voces',
      'o que voces fazem',
      'catalogo',
      'lista de servico',
      'tem desconto',
      'diferenca entre',
      'pacote',
      'day spa',
    ]) ||
    /\b(voces|vcs|voce|vc)\s+faz(em)?\b/.test(t) ||
    /\bfaz(em)?\s+\w+/.test(t) &&
      (servico || t.includes('henna') || t.includes('gel') || t.includes('progressiva')) ||
    (t.startsWith('tem ') &&
      servico &&
      !t.includes('horario') &&
      !t.includes('vaga') &&
      !t.includes('encaixe')) ||
    (t.includes('tem manicure') || t.includes('tem pedicure'))
  ) {
    // se também pergunta horário na mesma frase → prioriza disponibilidade
    if (
      hasAny(t, ['horario', 'vaga', 'encaixe', 'livre', 'disponivel']) &&
      (data || t.includes('hoje') || t.includes('amanha') || t.includes('tem horario'))
    ) {
      return { intencao: 'ver_disponibilidade', servico, data };
    }
    return { intencao: 'listar_servicos', servico, data: null };
  }

  // --- agendar (intenção de marcar) ---
  if (
    hasAny(t, [
      'quero marcar',
      'quero agendar',
      'gostaria de agendar',
      'gostaria de marcar',
      'gostaria de fazer',
      'pode marcar',
      'da pra marcar',
      'da para marcar',
      'tem como marcar',
      'marcar um',
      'marcar uma',
      'agendar',
      'agendamento',
      'faz um horario',
      'faz um agendamento',
      'fazer um agendamento',
      'fazer o agendamento',
      'fazer agendamento',
      'marca ai',
      'marca aí',
      'marca um horario',
      'marca um horário',
      'consegue me encaixar',
      'me encaixa',
      'me encaixar',
      'vou querer agendar',
      'quero fazer',
    ]) ||
    /^marca(r)?\b/.test(t)
  ) {
    return { intencao: 'agendar', servico, data };
  }

  // --- ver disponibilidade ---
  if (
    hasAny(t, [
      'tem horario',
      'tem vaga',
      'tem hora',
      'tem encaixe',
      'horarios livres',
      'horario livre',
      'horarios disponiveis',
      'horario disponivel',
      'que dia tem',
      'quais horarios',
      'que horas tem',
      'que horas sobra',
      'que horario fica',
      'disponivel',
      'disponibilidade',
      'esta livre',
      'ta livre',
      'sobra vaga',
      'consigo fazer',
      'atendem hoje',
      'atende hoje',
      'ainda da tempo',
      'hoje ainda',
    ]) ||
    (t.includes('horario') && (servico || data || t.includes('pra ') || t.includes('para ') || t.includes('manha') || t.includes('tarde'))) ||
    // só dia/período: "amanha de tarde?", "sexta de manha?"
    (!!data &&
      !hasAny(t, ['marcar', 'agendar', 'cancel', 'custa', 'preco', 'obrigad']) &&
      (t.endsWith('?') ||
        /^(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/.test(t) ||
        t.length < 40))
  ) {
    return { intencao: 'ver_disponibilidade', servico, data };
  }

  // "quero fazer X" genérico restante → agendar
  if (t.includes('quero fazer') && servico) {
    return { intencao: 'agendar', servico, data };
  }

  // Nome de serviço isolado (inclusive um que o salão não oferece):
  // o fluxo consulta o catálogo e informa com clareza se está disponível.
  if (servico) {
    return { intencao: 'listar_servicos', servico, data: null };
  }

  return { intencao: 'outro', servico, data };
}

function parseClassifierJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/\{[\s\S]*\}/);
  const jsonStr = fenced ? fenced[0] : raw;
  const parsed = JSON.parse(jsonStr);
  const intencao = INTENCOES.has(parsed.intencao) ? parsed.intencao : 'outro';
  return {
    intencao,
    servico: parsed.servico ? String(parsed.servico) : null,
    data: parsed.data ? String(parsed.data) : null,
  };
}

function aiConfig() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  return { apiKey, baseUrl, model, enabled: Boolean(apiKey) };
}

/** Classificação via LLM (JSON only). Fallback para regras se falhar. */
export async function classifyIntentLLM(texto = '') {
  const { apiKey, baseUrl, model } = aiConfig();
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: String(texto || '') },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!resp.ok) {
    throw new Error(`classifier API ${resp.status}`);
  }
  const data = await resp.json();
  return parseClassifierJson(data.choices?.[0]?.message?.content || '{}');
}

/**
 * Classifica a mensagem.
 * Com AI_API_KEY usa LLM; senão (ou se falhar) usa regras locais.
 */
export async function classifyIntent(texto = '') {
  const fallback = classifyIntentRules(texto);
  const confiavel = fallback.intencao !== 'outro';
  if (!aiConfig().enabled || confiavel) return { ...fallback, fonte: 'rules' };
  try {
    const llm = await classifyIntentLLM(texto);
    if (llm.intencao === 'outro' && fallback.intencao !== 'outro') {
      return { ...fallback, fonte: 'rules+llm' };
    }
    return {
      intencao: llm.intencao,
      servico: llm.servico || fallback.servico,
      data: llm.data || fallback.data,
      fonte: 'llm',
    };
  } catch {
    return { ...fallback, fonte: 'rules' };
  }
}
