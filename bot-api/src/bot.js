import { isPedidoOperacional } from './intent-flags.js';
import { classifyIntent } from './classifier.js';
import { query } from './db.js';
import { detectarPerguntaFaq } from './faq.js';
import { buscarConhecimento } from './rag.js';
import { sincronizarNovoAgendamento, cancelarEventoGoogle } from './google-calendar.js';
import { criarPagamentoPendente } from './pagamentos.js';
import {
  avisarClientes,
  avisarDonoNovoAgendamento,
  cancelarHorarioEAvisar,
  isDonoIntent,
  listarAgendaSalao,
  listarClientesComAgenda,
  listarHorariosCancelaveis,
  menuDono,
  modeloAvisoCancelamento,
  ownerPin,
  textoAgendaSalao,
  textoAcoesHorario,
} from './admin.js';
import { ultimaRespostaComContexto } from './history.js';
import {
  encontrarSlotExato,
  formatDiaBr,
  listarHorariosLivres,
  nomeDiaDaData,
  parseDia,
  parseDiaHoraNatural,
} from './slots.js';
import {
  buscarSlotsRemarcacao,
  buscarSlotsRemarcacaoNoDia,
  enviarAvisoComRemarcacao,
  prepararRemarcacao,
  textoConfirmarRemarcacao,
} from './remarcar.js';

/** Saudação pura (só cumprimento). "bom dia, quero agendar" NÃO entra aqui. */
function detectarSaudacao(lower) {
  const t = String(lower || '')
    .trim()
    .replace(/[!?.,]+$/g, '')
    .trim();

  // cumprimento + pedido na mesma frase → deixa o classificador cuidar
  if (
    /\b(agendar|marcar|horario|servico|preco|cancel|desmarcar|profissional|escova|corte|quanto|tem vaga|tem horario)\b/.test(
      t,
    )
  ) {
    return null;
  }

  if (/^(boa\s*tarde)(\s+(tudo bem|td bem|beleza|como vai|oi))?$/.test(t) || t === 'tarde') {
    return 'Boa tarde';
  }
  if (/^(boa\s*noite)(\s+(tudo bem|td bem|beleza|como vai|oi))?$/.test(t) || t === 'noite') {
    return 'Boa noite';
  }
  if (/^(bom\s*dia)(\s+(tudo bem|td bem|beleza|como vai|oi))?$/.test(t) || t === 'dia') {
    return 'Bom dia';
  }
  if (/^(oi|ola|oie|eai|e ai|hey|hello)(\s+(tudo bem|td bem|beleza|como vai))?$/.test(t)) {
    return 'Olá';
  }
  if (/^(obrigad[oa]|valeu|vlw|thanks)(\s+(vi|hein|ein))?$/.test(t)) {
    return 'Olá';
  }
  return null;
}

function primeiroNome(pushName = '') {
  const n = String(pushName || '').trim().split(/\s+/)[0];
  return n || '';
}

/** Menu humanizado: responde a saudação e apresenta as opções como uma recepcionista. */
function menu({ saudacao = null, pushName = '' } = {}) {
  const nome = primeiroNome(pushName);
  const nomePart = nome ? `, ${nome}` : '';
  const titulo = saudacao ? `${saudacao}${nomePart}!` : `Olá${nomePart}!`;

  return [
    `${titulo} 😊`,
    '',
    'Aqui é do *Studio Erika Thebas*!',
    '',
    'Pra te atender rapidinho, é só escolher uma das opções abaixo digitando o número:',
    '',
    '1 - Ver serviços e preços',
    '2 - Agendar horário',
    '3 - Meus horários',
    '4 - Cancelar / remarcar',
    '5 - Horário e informações',
    '',
    'A qualquer momento, digite *menu* para voltar aqui.',
    '',
    'Se preferir, também pode só me contar o que você precisa (tipo "quero marcar uma escova" ou "tem horário amanhã de manhã?") que eu já te ajudo.',
  ].join('\n');
}

function formatPreco(servico) {
  const valor = (Number(servico.preco_centavos) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return servico.preco_apartir ? `a partir de ${valor}` : valor;
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

// Converte número por extenso em dígito (voz transcrita: "um" → 1, "dois" → 2...)
const NUMEROS_EXTENSO = {
  um: 1, uma: 1, primeiro: 1, primeira: 1, 'numero um': 1, 'opcao um': 1, 'opcao 1': 1,
  dois: 2, duas: 2, segundo: 2, segunda: 2, 'numero dois': 2, 'opcao dois': 2, 'opcao 2': 2,
  tres: 3, terceiro: 3, terceira: 3, 'numero tres': 3, 'opcao tres': 3, 'opcao 3': 3,
  quatro: 4, quarto: 4, quarta: 4, 'opcao 4': 4,
  cinco: 5, quinto: 5, quinta: 5, 'opcao 5': 5,
  seis: 6, sexto: 6, 'opcao 6': 6,
  sete: 7, setimo: 7, 'opcao 7': 7,
  oito: 8, 'opcao 8': 8,
  nove: 9, 'opcao 9': 9,
  dez: 10, 'opcao 10': 10,
};

function parseNumeroOpcao(texto) {
  const t = normalizeTxtVoz(texto);
  // dígito direto: "1", "2", " 1 "
  const digito = t.match(/^\s*(\d+)\s*$/);
  if (digito) return Number(digito[1]);
  // número extraído de frase: "quero a 2", "opção 1", "número 2"
  const emFrase = t.match(/\b(?:opcao|numero|opc[aã]o|n[uú]mero)\s+(\d+)\b/);
  if (emFrase) return Number(emFrase[1]);
  const digEx = t.match(/\b(\d+)\b/);
  if (digEx) return Number(digEx[1]);
  // extenso
  for (const [palavra, num] of Object.entries(NUMEROS_EXTENSO)) {
    if (t === palavra || t.startsWith(palavra + ' ') || t.endsWith(' ' + palavra) || t.includes(' ' + palavra + ' ')) {
      return num;
    }
  }
  return NaN;
}

// Tenta achar um item numa lista pelo nome (para voz: "Ana Paula" → índice 0)
function matchNome(lista, textoVoz, campoNome = 'nome') {
  const t = normalizeTxt(textoVoz);
  if (!t) return -1;
  // match exato
  let idx = lista.findIndex((item) => normalizeTxt(item[campoNome]) === t);
  if (idx >= 0) return idx;
  // match parcial
  idx = lista.findIndex((item) => {
    const nome = normalizeTxt(item[campoNome]);
    return nome.includes(t) || t.includes(nome.split(' ')[0]);
  });
  return idx;
}

function phoneTail(telefone) {
  const d = onlyDigits(telefone);
  return d.slice(-8);
}

async function getSession(telefone) {
  const r = await query(
    `SELECT estado, dados FROM salao.conversas WHERE telefone = $1`,
    [telefone],
  );
  if (!r.rows.length) {
    return { estado: 'idle', dados: {} };
  }
  return {
    estado: r.rows[0].estado,
    dados: r.rows[0].dados || {},
  };
}

async function setSession(telefone, estado, dados = {}) {
  // preserva aceite LGPD se existir na sessão atual
  const atual = await query(
    `SELECT dados FROM salao.conversas WHERE telefone = $1`,
    [telefone],
  );
  const prev = atual.rows[0]?.dados || {};
  const merged = { ...dados };
  if (prev.lgpd_aviso_em && !merged.lgpd_aviso_em) {
    merged.lgpd_aviso_em = prev.lgpd_aviso_em;
  }
  await query(
    `INSERT INTO salao.conversas (telefone, estado, dados, atualizado_em)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (telefone) DO UPDATE
       SET estado = EXCLUDED.estado,
           dados = EXCLUDED.dados,
           atualizado_em = NOW()`,
    [telefone, estado, JSON.stringify(merged)],
  );
}

async function clearSession(telefone) {
  await setSession(telefone, 'idle', {});
}

async function listarServicos() {
  const r = await query(
    `SELECT id, nome, duracao_minutos, preco_centavos, COALESCE(preco_apartir, FALSE) AS preco_apartir, categoria
     FROM salao.servicos
     WHERE ativo
     ORDER BY
       CASE categoria
         WHEN 'cabelo' THEN 1
         WHEN 'capilar' THEN 2
         WHEN 'maquiagem' THEN 3
         WHEN 'unhas' THEN 4
         ELSE 9
       END,
       id`,
  );
  return r.rows;
}

async function profissionaisDoServico(servicoId) {
  const r = await query(
    `SELECT p.id, p.nome, COALESCE(p.cargo, '') AS cargo
     FROM salao.profissionais p
     JOIN salao.profissional_servicos ps ON ps.profissional_id = p.id
     WHERE p.ativo AND ps.servico_id = $1
     ORDER BY p.nome`,
    [servicoId],
  );
  return r.rows;
}

async function textoEquipeCliente() {
  const r = await query(
    `SELECT p.id, p.nome, COALESCE(p.cargo, '') AS cargo,
            COALESCE(
              string_agg(s.nome, ', ' ORDER BY s.nome),
              ''
            ) AS servicos
     FROM salao.profissionais p
     LEFT JOIN salao.profissional_servicos ps ON ps.profissional_id = p.id
     LEFT JOIN salao.servicos s ON s.id = ps.servico_id AND s.ativo
     WHERE p.ativo
     GROUP BY p.id, p.nome, p.cargo
     ORDER BY p.nome`,
  );
  if (!r.rows.length) {
    return 'No momento não encontrei profissionais ativas no cadastro.\nDigite *menu* para voltar.';
  }
  const blocos = r.rows.map((p) => {
    const cargo = p.cargo ? ` — ${p.cargo}` : '';
    const faz = p.servicos
      ? `Faz: ${p.servicos}`
      : 'Serviços sob consulta';
    return `• *${p.nome}*${cargo}\n  ${faz}`;
  });
  return [
    '*Nossa equipe*',
    '',
    ...blocos,
    '',
    'Quer marcar com alguma delas? É só dizer o serviço (ex: *quero marcar escova*) ou digitar *2*.',
    'Digite *menu* para voltar.',
  ].join('\n');
}

async function textoProfissionaisDoServico(servico) {
  const profissionais = await profissionaisDoServico(servico.id);
  if (!profissionais.length) {
    return `No momento não há profissional vinculada ao serviço *${servico.nome}* no cadastro.`;
  }
  return [
    `*Profissionais que fazem ${servico.nome}:*`,
    '',
    ...profissionais.map((p) => `• ${p.nome}${p.cargo ? ` — ${p.cargo}` : ''}`),
    '',
    'Quer que eu veja os horários disponíveis? Responda *quero*.',
  ].join('\n');
}

const ROTULOS_FAQ = {
  preparo_lavagem: 'preparo antes do serviço',
  duracao_resultado: 'duração do resultado',
  cabelo_cacheado: 'compatibilidade com o tipo de cabelo',
  quimica_anterior: 'compatibilidade com química anterior',
  sessoes: 'quantidade de sessões',
  contraindicacao: 'contraindicações e alergias',
  desconto: 'descontos e promoções',
  antecedencia: 'antecedência para agendar',
  tamanho_cabelo: 'indicação por comprimento do cabelo',
  cuidados_depois: 'cuidados depois do serviço',
  parcelamento: 'parcelamento',
  garantia: 'garantia',
  fotos: 'fotos de resultados',
  cheiro: 'odor dos produtos',
  produtos: 'produtos utilizados',
  queda_cabelo: 'indicação para queda de cabelo',
  combinar_servicos: 'combinação de serviços',
  repeticao: 'intervalo para repetir o serviço',
  unhas_fracas: 'aplicação em unhas frágeis ou roídas',
  manutencao: 'manutenção',
  preco_manutencao: 'preço da manutenção',
  escolher_cor: 'escolha de cor',
  criancas: 'atendimento infantil',
  dor: 'desconforto durante o serviço',
  unha_natural: 'efeito na unha natural',
  diferenca: 'diferenças do serviço',
  politica_remarcacao: 'processo de remarcação',
  politica_cancelamento: 'política de cancelamento',
  formas_pagamento: 'formas de pagamento',
  sinal_agendamento: 'sinal para agendamento',
  atraso: 'tolerância de atraso',
  estacionamento: 'estacionamento',
  fidelidade: 'programa de fidelidade',
  endereco: 'endereço e localização',
};

async function responderPerguntaFaq({ faq, telefone, instance }) {
  // Estes dois tópicos já possuem fluxos operacionais próprios.
  if (faq.topico === 'remarcacao' || faq.topico === 'cancelamento') return null;

  const servicos = await listarServicos();
  const servico = matchServico(servicos, faq.servico);

  if (faq.servico && !servico) {
    return {
      resposta: textoServicoNaoOferecido(faq.servico),
      instance,
      telefone,
    };
  }

  if (['preco', 'duracao_atendimento', 'servico_oferecido'].includes(faq.topico)) {
    if (!servico) {
      return {
        resposta: 'Claro! De qual serviço você quer saber?',
        instance,
        telefone,
      };
    }
    await setSession(telefone, 'confirmar_ver_horarios', { servico });
    return {
      resposta: [
        `Sim, fazemos *${servico.nome}*.`,
        `Valor: ${formatPreco(servico)}`,
        `Duração do atendimento: cerca de ${servico.duracao_minutos} min`,
        '',
        'Quer que eu veja os horários disponíveis? Responda *quero*.',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  if (faq.topico === 'profissional') {
    if (!servico) {
      await setSession(telefone, 'confirmar_agendar_equipe', {});
      return {
        resposta: await textoEquipeCliente(),
        instance,
        telefone,
      };
    }
    await setSession(telefone, 'confirmar_ver_horarios', { servico });
    return {
      resposta: await textoProfissionaisDoServico(servico),
      instance,
      telefone,
    };
  }

  if (servico) {
    const { rows } = await query(
      `SELECT resposta
       FROM salao.faq_servicos
       WHERE servico_id = $1 AND topico = $2`,
      [servico.id, faq.topico],
    );
    if (rows[0]?.resposta) {
      return { resposta: rows[0].resposta, instance, telefone, modo: 'faq' };
    }
  } else {
    const { rows } = await query(
      `SELECT resposta FROM salao.faq_geral WHERE topico = $1`,
      [faq.topico],
    );
    if (rows[0]?.resposta) {
      return { resposta: rows[0].resposta, instance, telefone, modo: 'faq' };
    }
  }

  // RAG: base de conhecimento (políticas / situações importantes)
  const consultaRag = [faq.topico, faq.servico, ROTULOS_FAQ[faq.topico] || '']
    .filter(Boolean)
    .join(' ');
  const ragHits = await buscarConhecimento(consultaRag || faq.topico, { topK: 3 });
  if (ragHits.length) {
    const melhor = ragHits[0];
    return {
      resposta: [
        melhor.conteudo,
        '',
        'Quer que eu veja horários ou preços de algum serviço?',
      ].join('\n'),
      instance,
      telefone,
      modo: 'rag',
      rag: ragHits.map((h) => ({ id: h.id, topico: h.topico, titulo: h.titulo })),
    };
  }

  const assunto = ROTULOS_FAQ[faq.topico] || 'essa dúvida';
  return {
    resposta: [
      faq.servico
        ? `Entendi sua dúvida sobre *${assunto}* em *${faq.servico}*.`
        : `Entendi sua dúvida sobre *${assunto}*.`,
      '',
      'Essa orientação ainda não está cadastrada no sistema.',
      'Para não te passar uma informação errada, vou deixar essa confirmação para a recepção do studio.',
      '',
      'Enquanto isso, posso consultar preço, duração, profissionais e horários disponíveis.',
    ].join('\n'),
    instance,
    telefone,
  };
}

function studioEndereco() {
  return process.env.STUDIO_ADDRESS || '';
}

function studioMapsUrl() {
  return process.env.STUDIO_MAPS_URL || '';
}

async function textoInfos() {
  const equipe = await query(
    `SELECT nome, COALESCE(cargo, '') AS cargo
     FROM salao.profissionais
     WHERE ativo
     ORDER BY nome`,
  );
  const linhasEquipe = equipe.rows.map((p) =>
    p.cargo ? `• ${p.nome} — ${p.cargo}` : `• ${p.nome}`,
  );

  const endereco = studioEndereco();
  const mapsUrl = studioMapsUrl();
  const linhasEndereco = [];
  if (endereco) {
    linhasEndereco.push(`📍 *${endereco}*`);
  }
  if (mapsUrl) {
    linhasEndereco.push(`🗺️ Como chegar: ${mapsUrl}`);
  }
  if (!linhasEndereco.length) {
    linhasEndereco.push('Endereço: me pergunte e te passo!');
  }

  return [
    '*Horário e informações*',
    '',
    '*Funcionamento:*',
    '• Domingo — Fechado',
    '• Segunda — Fechado',
    '• Terça a Sábado — 09:00 às 18:00',
    '',
    '*Almoço:* 12:00 às 12:20',
    '',
    '*Feriados:* atendemos sujeito à disponibilidade.',
    '',
    '*Fora do horário:* acréscimo de *30%* no valor do serviço.',
    '',
    '*Equipe:*',
    ...(linhasEquipe.length ? linhasEquipe : ['• Consulte pelo WhatsApp']),
    '',
    '*Endereço:*',
    ...linhasEndereco,
    '',
    '*Formas de pagamento:* PIX, débito e crédito.',
    '',
    'Digite *2* para agendar ou *menu* para voltar.',
  ].join('\n');
}

async function meusAgendamentos(telefone) {
  const r = await query(
    `SELECT a.id,
            a.servico_id,
            a.profissional_id,
            a.cliente_nome,
            a.cliente_telefone,
            s.nome AS servico,
            s.duracao_minutos,
            COALESCE(p.nome, 'A definir') AS profissional,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando
     FROM salao.agendamentos a
     JOIN salao.servicos s ON s.id = a.servico_id
     LEFT JOIN salao.profissionais p ON p.id = a.profissional_id
     WHERE a.status IN ('confirmado', 'pendente')
       AND a.inicio_em >= NOW()
       AND RIGHT(regexp_replace(a.cliente_telefone, '\\D', '', 'g'), 8) = $1
     ORDER BY a.inicio_em ASC
     LIMIT 10`,
    [phoneTail(telefone)],
  );
  return r.rows;
}

async function findProfissionalByTelefone(telefone) {
  const r = await query(
    `SELECT id, nome, cargo, pin_acesso
     FROM salao.profissionais
     WHERE ativo = TRUE
       AND telefone_whatsapp IS NOT NULL
       AND telefone_whatsapp <> ''
       AND RIGHT(regexp_replace(telefone_whatsapp, '\\D', '', 'g'), 8) = $1
     LIMIT 1`,
    [phoneTail(telefone)],
  );
  return r.rows[0] || null;
}

async function listarProfissionaisAtivos() {
  const r = await query(
    `SELECT id, nome, cargo, pin_acesso
     FROM salao.profissionais
     WHERE ativo = TRUE
     ORDER BY nome`,
  );
  return r.rows;
}

async function agendaProfissional(profissionalId, periodo = 'hoje') {
  let filtroData = `(a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;
  let titulo = 'Agenda de hoje';

  if (periodo === 'amanha') {
    filtroData = `(a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date = ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + 1)`;
    titulo = 'Agenda de amanhã';
  } else if (periodo === 'semana') {
    filtroData = `a.inicio_em >= (NOW() AT TIME ZONE 'America/Sao_Paulo')
      AND a.inicio_em < ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + 7)`;
    titulo = 'Próximos 7 dias';
  }

  const r = await query(
    `SELECT a.id,
            a.cliente_nome,
            s.nome AS servico,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS quando,
            to_char(a.fim_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS fim,
            a.status
     FROM salao.agendamentos a
     JOIN salao.servicos s ON s.id = a.servico_id
     WHERE a.profissional_id = $1
       AND a.status IN ('confirmado', 'pendente')
       AND ${filtroData}
     ORDER BY a.inicio_em ASC
     LIMIT 20`,
    [profissionalId],
  );
  return { titulo, itens: r.rows };
}

function menuProfissional(prof) {
  const cargo = prof.cargo ? ` (${prof.cargo})` : '';
  return [
    `*Área da profissional*`,
    `Olá, *${prof.nome}*${cargo}!`,
    '',
    '1 - Agenda de hoje',
    '2 - Agenda de amanhã',
    '3 - Próximos 7 dias',
    '4 - Voltar ao menu do cliente',
    '',
    'Digite o número da opção.',
  ].join('\n');
}

function textoAgendaProfissional(prof, titulo, itens) {
  if (!itens.length) {
    return [
      `*${titulo}* — ${prof.nome}`,
      '',
      'Nenhum horário neste período.',
      '',
      'Digite *1*, *2* ou *3* para outra agenda,',
      'ou *menu* para sair.',
    ].join('\n');
  }
  const linhas = itens.map(
    (a) =>
      `• ${a.quando}–${a.fim}\n  ${a.servico}\n  Cliente: ${a.cliente_nome} (#${a.id})`,
  );
  return [
    `*${titulo}* — ${prof.nome}`,
    '',
    ...linhas,
    '',
    'Digite *1* (hoje), *2* (amanhã), *3* (7 dias)',
    'ou *menu* para sair.',
  ].join('\n');
}

function textoServicos(servicos) {
  const linhas = servicos.map((s, i) => `${i + 1} - ${s.nome} — ${formatPreco(s)}`);
  return [
    '*Serviços e preços:*',
    '',
    ...linhas,
    '',
    '_Valores “a partir de” podem variar conforme o trabalho._',
    '',
    'Quer marcar um horário? Diga o serviço (ex: *escova*) ou digite *2*.',
    'Para ver a equipe, é só perguntar *quem atende*.',
  ].join('\n');
}

function textoServicoNaoOferecido(nome) {
  return [
    `Entendi! Você procura *${nome}*.`,
    '',
    `No momento, esse serviço não está disponível no *Studio Erika Thebas*.`,
    '',
    'Se quiser, digite *1* para conferir os serviços que oferecemos ou me diga outro serviço que você procura.',
  ].join('\n');
}

function normalizeTxt(v = '') {
  return String(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

// Versão para voz: remove pontuação que o Whisper injeta ("Sim." → "sim")
function normalizeTxtVoz(v = '') {
  return String(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function respostaPositiva(texto) {
  const t = normalizeTxtVoz(texto);
  // match exato
  if (/^(quero|sim|quero sim|pode|pode sim|pode ser|mostra|mostrar|vamos|por favor|confirmo|confirmar|correto|certo|isso|ok|claro|combinado)$/.test(t)) return true;
  // palavra-chave dentro de frase longa (ex: "Confirma pra mim? Sim")
  return /\b(sim|confirmo|pode confirmar|isso mesmo|correto|certo|pode ser|quero sim)\b/.test(t);
}

function respostaNegativa(texto) {
  const t = normalizeTxtVoz(texto);
  if (/^(nao|agora nao|so queria saber|cancelar|desistir|nao quero)$/.test(t)) return true;
  return /\b(nao quero|cancelar|desistir)\b/.test(t);
}

function pedidoCorteGenerico(texto, servicoNome) {
  const t = normalizeTxt(texto);
  const nome = normalizeTxt(servicoNome);
  if (eCorteMasculino(t) || eCorteFeminino(t)) return false;
  if (nome === 'corte' || nome === 'corte de cabelo') return true;
  if (!nome && /\bcorte(\s+de\s+cabelo)?\b/.test(t) && !/\b(fem\w*|masc\w*|homem|mulher)\b/.test(t)) {
    return true;
  }
  return false;
}

function eCorteMasculino(texto) {
  const t = normalizeTxt(texto);
  return (
    /\b(?:corte|cortar|cabelo).{0,30}\b(?:masc\w*|homem|homens|menino|meninos)\b/.test(t) ||
    /\b(?:masc\w*|homem|homens|menino).{0,20}\b(?:corte|cabelo)\b/.test(t) ||
    /^(masculino|homem|de homem|pra homem|para homem|corte masculino)$/.test(t) ||
    /\b(degrade|fade|navalhado|barbearia)\b/.test(t)
  );
}

function eCorteFeminino(texto) {
  const t = normalizeTxt(texto);
  return (
    /\b(?:corte|cabelo).{0,30}\b(?:fem\w*|mulher|mulheres)\b/.test(t) ||
    /^(feminino|mulher|de mulher|pra mulher|corte feminino)$/.test(t)
  );
}

function textoCorteGenerico(servicos) {
  const cortes = servicos.filter((s) => normalizeTxt(s.nome).includes('corte'));
  if (!cortes.length) {
    return textoServicoNaoOferecido('corte de cabelo');
  }

  const nomes = cortes.map((s) => `• ${s.nome}`).join('\n');
  const temMasculino = cortes.some((s) => normalizeTxt(s.nome).includes('masculino'));

  return [
    'Claro! Qual tipo de corte você procura?',
    '',
    '*No nosso catálogo temos:*',
    nomes,
    '',
    ...(temMasculino
      ? ['Me diga qual deles você quer e eu continuo o atendimento.']
      : [
          'Se você procura *corte masculino*, no momento esse serviço não está disponível.',
          'Se for *corte feminino*, me confirma que eu continuo.',
        ]),
  ].join('\n');
}

function matchServico(servicos, termo) {
  if (!termo) return null;
  const t = normalizeTxt(termo);
  if (t === 'corte' || t === 'corte de cabelo') return null;
  const aliases = {
    'selagem capilar': 'selagem',
    penteado: 'penteados',
    'penteado para festa': 'penteados',
    'penteado para casamento': 'penteados',
    'alongamento de unha': 'alongamento de unhas',
    'blindagem de unha': 'blindagem de unhas',
    'esmaltação simples': 'esmaltação',
  };
  const nomeBuscado = aliases[t] || t;
  return (
    servicos.find((s) => normalizeTxt(s.nome) === nomeBuscado) ||
    servicos.find((s) => normalizeTxt(s.nome).includes(nomeBuscado)) ||
    null
  );
}

function textoContinuarAgendamento(estado, dados = {}) {
  const servico = dados.servico?.nome;
  if (estado === 'agendar_tipo_corte') {
    return 'Ainda preciso saber se o corte é *feminino* ou *masculino* para continuar.';
  }
  if (estado === 'agendar_profissional' && servico) {
    return `Continuamos o agendamento de *${servico}*. Escolha o profissional pelo *número* da lista.`;
  }
  if (estado === 'agendar_dia' && servico) {
    return `Continuamos *${servico}*. Me diga o dia (ex: *amanhã*).`;
  }
  if (estado === 'agendar_hora' && servico) {
    return `Continuamos *${servico}*. Escolha o *horário* pelo número.`;
  }
  if (estado === 'remarcar_escolher_slot') {
    return 'Seu horário foi cancelado. Escolha o *número* de um horário livre da lista para remarcar.';
  }
  if (estado === 'remarcar_confirmar') {
    return 'Falta confirmar a remarcação: *1* sim ou *2* para outro horário.';
  }
  if (estado === 'agendar_servico') {
    return 'Ainda estamos agendando. Digite o *número* do serviço, ou me diga o nome.';
  }
  if (estado?.startsWith('agendar_')) {
    return servico
      ? `Continuamos o agendamento de *${servico}*. Pode seguir de onde paramos.`
      : 'Continuamos o agendamento de onde paramos.';
  }
  return null;
}

async function iniciarAgendamento(
  telefone,
  instance,
  { servico = null, servicoNome = null, dataTexto = null, textoOriginal = '' } = {},
) {
  const sess = await getSession(telefone);
  const dataHint = dataTexto || sess.dados?.dataTextoHint || sess.dados?.last_data || null;
  const servicos = await listarServicos();

  if (eCorteMasculino(textoOriginal) || normalizeTxt(servicoNome) === 'corte masculino') {
    await setSession(telefone, 'idle', { last_data: dataHint });
    return {
      resposta: textoServicoNaoOferecido('corte masculino'),
      instance,
      telefone,
    };
  }

  if (!servico && (pedidoCorteGenerico(textoOriginal || servicoNome || '', servicoNome) || normalizeTxt(servicoNome) === 'corte')) {
    await setSession(telefone, 'agendar_tipo_corte', {
      dataTextoHint: dataHint,
      last_data: dataHint,
    });
    return {
      resposta: textoCorteGenerico(servicos),
      instance,
      telefone,
    };
  }

  if (!servico && servicoNome) {
    return {
      resposta: textoServicoNaoOferecido(servicoNome),
      instance,
      telefone,
    };
  }
  if (!servico) {
    const dados = { servicos, dataTextoHint: dataHint, last_data: dataHint };
    await setSession(telefone, 'agendar_servico', dados);
    const linhas = servicos.map((s, i) => `${i + 1} - ${s.nome}`);
    return {
      resposta: [
        '*Agendar horário*',
        '',
        'Qual serviço você quer marcar?',
        'Digite só o *número*:',
        '',
        ...linhas,
        '',
        'Ou digite *menu* para voltar.',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  const profissionais = await profissionaisDoServico(servico.id);
  if (!profissionais.length) {
    await clearSession(telefone);
    return {
      resposta: `O serviço *${servico.nome}* não tem profissional disponível agora.\nDigite *menu* para ver outras opções.`,
      instance,
      telefone,
    };
  }

  // se já veio dia/hora, pede confirmação depois de escolher profissional; senão segue fluxo
  const dados = {
    servico,
    profissionais,
    dataTextoHint: dataHint,
    last_data: dataHint,
    last_servico: servico.nome,
  };
  await setSession(telefone, 'agendar_profissional', dados);
  const linhas = profissionais.map((p, i) =>
    p.cargo ? `${i + 1} - ${p.nome} (${p.cargo})` : `${i + 1} - ${p.nome}`,
  );
  return {
    resposta: [
      `Perfeito! Vamos marcar *${servico.nome}* (${formatPreco(servico)}).`,
      '',
      'Escolha o *profissional*:',
      '',
      ...linhas,
      `${profissionais.length + 1} - Qualquer profissional`,
      '',
      'Digite o número.',
    ].join('\n'),
    instance,
    telefone,
  };
}

async function responderDisponibilidade(telefone, instance, { servicoNome = null, dataTexto = null, textoOriginal = '' } = {}) {
  const servicos = await listarServicos();
  if (eCorteMasculino(textoOriginal) || normalizeTxt(servicoNome) === 'corte masculino') {
    return {
      resposta: textoServicoNaoOferecido('corte masculino'),
      instance,
      telefone,
    };
  }
  if (pedidoCorteGenerico(textoOriginal || servicoNome || '', servicoNome) || normalizeTxt(servicoNome) === 'corte') {
    const sess = await getSession(telefone);
    await setSession(telefone, 'agendar_tipo_corte', {
      dataTextoHint: dataTexto || sess.dados?.last_data || null,
      last_data: dataTexto || sess.dados?.last_data || null,
      origem: 'disponibilidade',
    });
    return {
      resposta: textoCorteGenerico(servicos),
      instance,
      telefone,
    };
  }
  const servico = matchServico(servicos, servicoNome);

  if (!servico && servicoNome) {
    return {
      resposta: textoServicoNaoOferecido(servicoNome),
      instance,
      telefone,
    };
  }

  if (!servico) {
    const dados = { servicos, intentDisponibilidade: true, dataTextoHint: dataTexto || null };
    await setSession(telefone, 'agendar_servico', dados);
    const linhas = servicos.map((s, i) => `${i + 1} - ${s.nome}`);
    return {
      resposta: [
        'Claro! Pra eu ver os horários livres, me diz qual serviço:',
        '',
        ...linhas,
        '',
        'Digite o *número* (ou *menu* pra voltar).',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  const dataIso = dataTexto ? parseDia(dataTexto) : parseDia('hoje') || parseDia('amanha');
  if (!dataIso) {
    const profissionais = await profissionaisDoServico(servico.id);
    const dados = {
      servico,
      profissionais,
      profissional: null,
      profissionalId: null,
    };
    await setSession(telefone, 'agendar_dia', dados);
    return {
      resposta: [
        `Serviço: *${servico.nome}*`,
        '',
        'Pra qual *dia* você quer ver horários?',
        'Pode digitar *hoje*, *amanhã*, *terça*, *12/08*...',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  const diaNome = nomeDiaDaData(dataIso);
  const slots = await listarHorariosLivres({
    dataIso,
    servicoId: servico.id,
    duracaoMinutos: servico.duracao_minutos,
    profissionalId: null,
  });

  if (!slots.length) {
    const dow = new Date(`${dataIso}T12:00:00`).getDay();
    const fechado = dow === 0 || dow === 1;
    return {
      resposta: fechado
        ? [
            `Em *${diaNome}, ${formatDiaBr(dataIso)}* estamos fechados.`,
            'Funcionamos de *terça a sábado*, 09:00 às 18:00.',
            '',
            'Quer que eu veja outro dia? É só digitar (ex: *terça*).',
          ].join('\n')
        : [
            `Não achei horário livre de *${servico.nome}* em *${diaNome}, ${formatDiaBr(dataIso)}*.`,
            '',
            'Quer tentar outro dia? Digite a data, ou *2* pra agendar.',
          ].join('\n'),
      instance,
      telefone,
    };
  }

  const profissionais = await profissionaisDoServico(servico.id);
  const dados = {
    servico,
    profissionais,
    profissional: null,
    profissionalId: null,
    dataIso,
    diaNome,
    slots,
  };
  await setSession(telefone, 'agendar_hora', dados);
  const linhas = slots.slice(0, 12).map((s, i) => `${i + 1} - ${s.label}`);
  return {
    resposta: [
      `Horários livres pra *${servico.nome}* em *${diaNome}, ${formatDiaBr(dataIso)}*:`,
      '',
      ...linhas,
      '',
      'Digite o *número* do horário pra já seguir com o agendamento,',
      'ou me diga outro dia.',
    ].join('\n'),
    instance,
    telefone,
  };
}

async function handleNaturalIntent({ telefone, texto, pushName = '', instance = 'salao2' }) {
  if (isPedidoOperacional(texto)) {
    const intent = await classifyIntent(texto);
    const servicos = await listarServicos();
    const servico = matchServico(servicos, intent.servico);
    if (intent.intencao === 'cancelar') {
      // deixa o classificador/fluxo de cancelar abaixo
    } else if (intent.intencao === 'meus_horarios') {
      // segue fluxo abaixo
    } else {
      const r = await iniciarAgendamento(telefone, instance, {
        servico,
        servicoNome: intent.servico,
        dataTexto: intent.data,
        textoOriginal: texto,
      });
      return { ...r, intent: { ...intent, intencao: intent.intencao || 'agendar' } };
    }
  }

  const faq = detectarPerguntaFaq(texto);
  if (faq) {
    const respostaFaq = await responderPerguntaFaq({
      faq,
      telefone,
      instance,
    });
    if (respostaFaq) return { ...respostaFaq, faq };
  }

  const intent = await classifyIntent(texto);
  const servicos = await listarServicos();
  const servico = matchServico(servicos, intent.servico);

  // "Corte" sozinho é ambíguo. Não assumimos feminino nem masculino:
  // mostramos apenas os tipos realmente cadastrados no banco.
  if (pedidoCorteGenerico(texto, intent.servico)) {
    await setSession(telefone, 'agendar_tipo_corte', {
      dataTextoHint: intent.data,
      last_data: intent.data,
    });
    return {
      resposta: textoCorteGenerico(servicos),
      instance,
      telefone,
      intent,
    };
  }

  if (intent.intencao === 'equipe') {
    const lista = await listarProfissionaisAtivos();
    await setSession(telefone, 'equipe_escolher', { profissionais: lista });
    const linhas = lista.map((p, i) => `${i + 1} - ${p.nome}${p.cargo ? ` (${p.cargo})` : ''}`);
    return {
      resposta: [
        '*Acesso da equipe*',
        '',
        'Quem é você? Digite o número:',
        '',
        ...linhas,
        '',
        'Ou digite *menu* para voltar.',
      ].join('\n'),
      instance,
      telefone,
      intent,
    };
  }

  if (intent.intencao === 'listar_servicos') {
    if (servico) {
      await setSession(telefone, 'confirmar_ver_horarios', {
        servico,
      });
      return {
        resposta: [
          `*${servico.nome}*`,
          `Valor: ${formatPreco(servico)}`,
          `Duração: cerca de ${servico.duracao_minutos} min`,
          '',
          'Quer que eu veja os horários disponíveis?',
          'Pode responder *quero*, *sim* ou já me dizer o dia (ex: *amanhã*).',
        ].join('\n'),
        instance,
        telefone,
        intent,
      };
    }
    if (intent.servico) {
      return {
        resposta: textoServicoNaoOferecido(intent.servico),
        instance,
        telefone,
        intent,
      };
    }
    await setSession(telefone, 'confirmar_ver_profissionais', {});
    return { resposta: textoServicos(servicos), instance, telefone, intent };
  }

  if (intent.intencao === 'listar_profissionais') {
    await setSession(telefone, 'confirmar_agendar_equipe', {});
    return {
      resposta: await textoEquipeCliente(),
      instance,
      telefone,
      intent,
    };
  }

  if (intent.intencao === 'info') {
    return { resposta: await textoInfos(), instance, telefone, intent };
  }

  if (intent.intencao === 'meus_horarios') {
    const lista = await meusAgendamentos(telefone);
    if (!lista.length) {
      return {
        resposta:
          '*Seus horários*\n\nVocê não tem agendamentos.\n\nPode digitar *quero marcar* ou *2* para agendar.',
        instance,
        telefone,
        intent,
      };
    }
    const linhas = lista.map(
      (a, i) => `${i + 1} - ${a.quando}\n${a.servico} com ${a.profissional}`,
    );
    return {
      resposta: ['*Seus horários*', '', ...linhas, '', 'Digite *menu* para voltar.'].join('\n'),
      instance,
      telefone,
      intent,
    };
  }

  if (intent.intencao === 'cancelar') {
    return {
      ...(await listaParaCancelarOuRemarcar(telefone, instance, 'Cancelar ou remarcar')),
      intent,
    };
  }

  if (intent.intencao === 'ver_disponibilidade') {
    const r = await responderDisponibilidade(telefone, instance, {
      servicoNome: intent.servico,
      dataTexto: intent.data,
      textoOriginal: texto,
    });
    return { ...r, intent };
  }

  if (intent.intencao === 'agendar') {
    const r = await iniciarAgendamento(telefone, instance, {
      servico,
      servicoNome: intent.servico,
      dataTexto: intent.data,
      textoOriginal: texto,
    });
    return { ...r, intent };
  }

  // outro → ajuda leve + menu
  return {
    resposta: menu({ pushName }),
    instance,
    telefone,
    intent,
  };
}

async function retomarUltimaOferta(telefone, instance) {
  const ultima = await ultimaRespostaComContexto(telefone);
  const contexto = ultima?.metadados || {};

  if (contexto.acaoPendente === 'confirmar_ver_profissionais') {
    await setSession(telefone, 'confirmar_agendar_equipe', {});
    return {
      resposta: await textoEquipeCliente(),
      instance,
      telefone,
    };
  }

  if (contexto.acaoPendente === 'confirmar_agendar_equipe') {
    return iniciarAgendamento(telefone, instance);
  }

  if (contexto.acaoPendente === 'confirmar_ver_horarios' && contexto.servico) {
    return responderDisponibilidade(telefone, instance, {
      servicoNome: contexto.servico,
      dataTexto: null,
    });
  }

  return null;
}

function ok(resposta, instance, telefone) {
  return { resposta, instance, telefone };
}

function normalizeHoraAvulsa(texto) {
  const t = String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  let m = t.match(/^(\d{1,2})[:h](\d{2})$/);
  if (m) {
    return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
  }
  m = t.match(/^(\d{1,2})\s*h(?:oras)?$/);
  if (m) {
    return `${String(Number(m[1])).padStart(2, '0')}:00`;
  }
  m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
  }
  return null;
}

async function seguirParaNome(telefone, dados, pushName, instance) {
  const slot = dados.slot;
  const nomeSugestao = (pushName || '').trim();
  if (nomeSugestao) {
    dados.nomeSugestao = nomeSugestao;
    await setSession(telefone, 'agendar_nome', dados);
    return {
      resposta: [
        `Horário: *${nomeDiaDaData(dados.dataIso)}, ${formatDiaBr(dados.dataIso)} às ${slot.hora}*`,
        `Com: *${slot.profissionalNome}*`,
        '',
        `Seu nome é *${nomeSugestao}*?`,
        '',
        '1 - Sim',
        '2 - Quero informar outro nome',
      ].join('\n'),
      instance,
      telefone,
    };
  }
  await setSession(telefone, 'agendar_nome_texto', dados);
  return {
    resposta: [
      `Horário: *${nomeDiaDaData(dados.dataIso)}, ${formatDiaBr(dados.dataIso)} às ${slot.hora}*`,
      `Com: *${slot.profissionalNome}*`,
      '',
      'Por favor, digite seu *nome*:',
    ].join('\n'),
    instance,
    telefone,
  };
}

async function tratarCorrecaoServico({ telefone, texto, instance, dados = {} }) {
  const intent = await classifyIntent(texto);
  const dataHint = intent.data || dados.dataTextoHint || dados.last_data || null;

  if (eCorteMasculino(texto) || intent.servico === 'corte masculino') {
    await setSession(telefone, 'idle', { last_data: dataHint });
    return {
      resposta: textoServicoNaoOferecido('corte masculino'),
      instance,
      telefone,
    };
  }

  if (eCorteFeminino(texto) || normalizeTxt(intent.servico) === 'corte feminino') {
    const servicos = await listarServicos();
    const servico = matchServico(servicos, 'corte feminino');
    return iniciarAgendamento(telefone, instance, {
      servico,
      servicoNome: 'corte feminino',
      dataTexto: dataHint,
      textoOriginal: 'corte feminino',
    });
  }

  if (pedidoCorteGenerico(texto, intent.servico)) {
    await setSession(telefone, 'agendar_tipo_corte', {
      dataTextoHint: dataHint,
      last_data: dataHint,
    });
    return {
      resposta: textoCorteGenerico(await listarServicos()),
      instance,
      telefone,
    };
  }

  if (intent.servico) {
    const servicos = await listarServicos();
    const servico = matchServico(servicos, intent.servico);
    return iniciarAgendamento(telefone, instance, {
      servico,
      servicoNome: intent.servico,
      dataTexto: dataHint,
      textoOriginal: texto,
    });
  }
  return null;
}

/** Atalhos que devem ir ao fluxo clássico mesmo com agente IA ligado. */
export function isShortcutClassic(texto = '') {
  const lower = String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
  if (!lower) return true;
  if (detectarSaudacao(lower)) return true;
  if (['menu', 'inicio', '0', 'opcoes', 'opções'].includes(lower)) return true;
  if (/^[1-5]$/.test(lower)) return true;
  if (['equipe', 'profissional', 'agenda profissional', 'sou profissional'].includes(lower)) {
    return true;
  }
  if (isDonoIntent(lower)) return true;
  if (['remarcar', 'quero remarcar', 'mudar horario', 'trocar horario'].includes(lower)) {
    return true;
  }
  return false;
}

async function listaParaCancelarOuRemarcar(telefone, instance, titulo) {
  const lista = await meusAgendamentos(telefone);
  if (!lista.length) {
    return {
      resposta: `*${titulo}*\n\nVocê não tem horários futuros.\n\nDigite *2* para marcar um novo ou *menu* para voltar.`,
      instance,
      telefone,
    };
  }
  await setSession(telefone, 'cancelar_escolher', { cancelaveis: lista });
  const linhas = lista.map(
    (a, i) => `${i + 1} - ${a.quando}\n${a.servico} com ${a.profissional}`,
  );
  return {
    resposta: [
      `*${titulo}*`,
      '',
      'Digite o *número* do horário:',
      '',
      ...linhas,
      '',
      'Depois do cancelamento, mostro horários *livres no sistema* para remarcar.',
      'Ou digite *menu* para voltar.',
    ].join('\n'),
    instance,
    telefone,
  };
}

async function donoCancelarComRemarcacao({ item, instance, telefoneDono }) {
  const r = await cancelarHorarioEAvisar({ id: item.id, instance, enviarAviso: false });
  await setSession(telefoneDono, 'dono_menu', {});
  if (!r.ok) {
    return { resposta: 'Não encontrei esse horário.\n' + menuDono(), instance, telefone: telefoneDono };
  }
    const oferta = await prepararRemarcacao({
    telefoneCliente: r.horario.cliente_telefone,
    clienteNome: r.horario.cliente_nome,
    servicoId: r.horario.servico_id || item.servico_id,
    profissionalId: r.horario.profissional_id || item.profissional_id,
    quandoCancelado: r.horario.quando,
    agendamentoId: r.horario.id,
    instance,
    origem: 'dono',
    enviarWhatsApp: true,
  });
  if (!oferta.ok || oferta.erro_envio) {
    if (!oferta.ok) {
      await avisarClientes({
        destinatarios: [{ telefone: r.horario.cliente_telefone }],
        texto: `Olá, ${r.horario.cliente_nome}! Precisamos cancelar seu horário de *${r.horario.quando}* no Studio Erika Thebas. Responda esta mensagem para combinarmos outro dia.`,
        instance,
      });
    }
  }
  return {
    resposta: [
      `Horário #${r.horario.id} (*${r.horario.quando}*) cancelado.`,
      oferta.slots?.length
        ? `Enviei para *${r.horario.cliente_nome}* os horários livres do sistema para ela remarcar pelo número.`
        : `Avisei *${r.horario.cliente_nome}*. Não há horário livre nos próximos 14 dias no sistema.`,
      oferta.erro_envio ? `WhatsApp da cliente falhou: ${oferta.erro_envio}` : null,
      '',
      menuDono(),
    ]
      .filter(Boolean)
      .join('\n'),
    instance,
    telefone: telefoneDono,
  };
}

export async function handleMessage({ telefone, texto, pushName = '', instance = 'salao2' }) {
  const raw = String(texto || '').trim();
  const lower = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

  // LGPD: aviso na primeira conversa (clientes; não dono/profissional)
  const profGate = await findProfissionalByTelefone(telefone);
  if (!isDonoIntent(raw) && !profGate) {
    const {
      precisaAvisoPrivacidade,
      mensagemAvisoPrivacidade,
      marcarAvisoPrivacidadeAceito,
    } = await import('./lgpd/titular.js');
    if (await precisaAvisoPrivacidade(telefone)) {
      const aceitou = [
        'ok',
        'okay',
        'aceito',
        'aceitar',
        'sim',
        'concordo',
        'beleza',
        'pode',
        'li e aceito',
      ].includes(lower);
      if (!aceitou) {
        return { resposta: mensagemAvisoPrivacidade(), instance, telefone };
      }
      await marcarAvisoPrivacidadeAceito(telefone, { resposta: raw || 'aceito' });
      return {
        resposta: ['Perfeito, obrigada!', '', menu({ pushName })].join('\n'),
        instance,
        telefone,
      };
    }
  }

  if (!raw) {
    const profAuto = await findProfissionalByTelefone(telefone);
    if (profAuto) {
      await setSession(telefone, 'profissional_menu', { profissional: profAuto });
      return { resposta: menuProfissional(profAuto), instance, telefone };
    }
    return { resposta: menu({ pushName }), instance, telefone };
  }

  // atalhos globais: menu zera; saudação NÃO apaga agendamento em andamento
  const saudacao = detectarSaudacao(lower);
  const pediuMenu = ['menu', 'inicio', '0', 'opcoes', 'opções'].includes(lower);
  if (pediuMenu) {
    await clearSession(telefone);
    const profAuto = await findProfissionalByTelefone(telefone);
    if (profAuto) {
      await setSession(telefone, 'profissional_menu', { profissional: profAuto });
      return { resposta: menuProfissional(profAuto), instance, telefone };
    }
    return {
      resposta: menu({ saudacao: saudacao || null, pushName }),
      instance,
      telefone,
    };
  }
  if (saudacao) {
    const sessAtual = await getSession(telefone);
    const lembrete = textoContinuarAgendamento(sessAtual.estado, sessAtual.dados);
    if (lembrete) {
      return {
        resposta: [`${saudacao}! 😊`, '', lembrete].join('\n'),
        instance,
        telefone,
      };
    }
    await clearSession(telefone);
    const profAuto = await findProfissionalByTelefone(telefone);
    if (profAuto) {
      await setSession(telefone, 'profissional_menu', { profissional: profAuto });
      return { resposta: menuProfissional(profAuto), instance, telefone };
    }
    return {
      resposta: menu({ saudacao, pushName }),
      instance,
      telefone,
    };
  }

  // área do dono (agenda da casa + avisos)
  if (isDonoIntent(lower)) {
    await setSession(telefone, 'dono_pin', {});
    return {
      resposta: 'Área do *dono*. Digite o *PIN* de acesso:',
      instance,
      telefone,
    };
  }

  // entrada rápida da equipe
  if (['equipe', 'profissional', 'agenda profissional', 'sou profissional'].includes(lower)) {
    const lista = await listarProfissionaisAtivos();
    await setSession(telefone, 'equipe_escolher', { profissionais: lista });
    const linhas = lista.map((p, i) => `${i + 1} - ${p.nome}${p.cargo ? ` (${p.cargo})` : ''}`);
    return {
      resposta: [
        '*Acesso da equipe*',
        '',
        'Quem é você? Digite o número:',
        '',
        ...linhas,
        '',
        'Ou digite *menu* para voltar.',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  if (['remarcar', 'quero remarcar', 'mudar horario', 'trocar horario'].includes(lower)) {
    return listaParaCancelarOuRemarcar(telefone, instance, 'Remarcar horário');
  }

  let { estado, dados } = await getSession(telefone);

  if (estado === 'dono_pin') {
    if (String(raw) !== ownerPin()) {
      return {
        resposta: 'PIN incorreto. Tente de novo, ou digite *menu* para sair.',
        instance,
        telefone,
      };
    }
    await setSession(telefone, 'dono_menu', {});
    return { resposta: menuDono(), instance, telefone };
  }

  if (estado === 'dono_menu') {
    if (lower === '0' || lower === 'sair' || lower === 'menu') {
      await clearSession(telefone);
      return { resposta: 'Saiu da área do dono.\nDigite *menu* quando quiser o atendimento de cliente.', instance, telefone };
    }
    if (lower === '1' || lower === '2' || lower === '3' || lower === '4') {
      const periodo = { 1: 'hoje', 2: 'amanha', 3: 'semana', 4: 'futuros' }[lower];
      const { titulo, itens } = await listarAgendaSalao(periodo);
      await setSession(telefone, 'dono_agenda_lista', { itens, titulo, periodo });
      return { resposta: textoAgendaSalao(titulo, itens), instance, telefone };
    }
    if (lower === '5') {
      await setSession(telefone, 'dono_aviso_todos_texto', {});
      return {
        resposta: [
          '*Avisar todas as clientes* com horário futuro.',
          '',
          'Digite o texto do aviso (vai no WhatsApp de cada uma).',
          '',
          'Exemplo:',
          modeloAvisoCancelamento('o studio estará fechado amanhã'),
        ].join('\n'),
        instance,
        telefone,
      };
    }
    if (lower === '6') {
      const clientes = await listarClientesComAgenda();
      if (!clientes.length) {
        return { resposta: 'Não há clientes com horário futuro.\n' + menuDono(), instance, telefone };
      }
      await setSession(telefone, 'dono_aviso_um_escolher', { clientes });
      const linhas = clientes.map(
        (c, i) => `${i + 1} - ${c.cliente_nome} (${c.quando} · ${c.servico})`,
      );
      return {
        resposta: ['*Avisar uma cliente*', '', ...linhas, '', 'Digite o *número*.'].join('\n'),
        instance,
        telefone,
      };
    }
    if (lower === '7') {
      const horarios = await listarHorariosCancelaveis();
      if (!horarios.length) {
        return { resposta: 'Não há horários futuros para cancelar.\n' + menuDono(), instance, telefone };
      }
      await setSession(telefone, 'dono_cancelar_escolher', { horarios });
      const linhas = horarios.map(
        (h, i) => `${i + 1} - ${h.quando} · ${h.servico}\n   ${h.cliente_nome} (#${h.id})`,
      );
      return {
        resposta: [
          '*Cancelar e avisar*',
          '',
          ...linhas,
          '',
          'Digite o *número* do horário. A cliente recebe o aviso no WhatsApp.',
        ].join('\n'),
        instance,
        telefone,
      };
    }
    return { resposta: menuDono(), instance, telefone };
  }

  if (estado === 'dono_agenda_lista') {
    if (lower === '0' || lower === 'menu' || lower === 'voltar') {
      await setSession(telefone, 'dono_menu', {});
      return { resposta: menuDono(), instance, telefone };
    }
    const n = Number(lower);
    const itens = dados.itens || [];
    if (!Number.isInteger(n) || n < 1 || n > itens.length) {
      return {
        resposta: 'Digite o *número* do horário na lista para avisar ou cancelar.\nOu *0* para o menu do dono.',
        instance,
        telefone,
      };
    }
    const item = itens[n - 1];
    await setSession(telefone, 'dono_item_acoes', { item, itens: dados.itens, titulo: dados.titulo, periodo: dados.periodo });
    return { resposta: textoAcoesHorario(item), instance, telefone };
  }

  if (estado === 'dono_item_acoes') {
    const item = dados.item;
    if (!item) {
      await setSession(telefone, 'dono_menu', {});
      return { resposta: menuDono(), instance, telefone };
    }
    if (lower === '0') {
      await setSession(telefone, 'dono_menu', {});
      return { resposta: menuDono(), instance, telefone };
    }
    if (lower === '3' || lower === 'voltar') {
      await setSession(telefone, 'dono_agenda_lista', {
        itens: dados.itens,
        titulo: dados.titulo,
        periodo: dados.periodo,
      });
      return { resposta: textoAgendaSalao(dados.titulo || 'Agenda', dados.itens || []), instance, telefone };
    }
    if (lower === '1') {
      await setSession(telefone, 'dono_item_aviso_texto', { item, itens: dados.itens, titulo: dados.titulo, periodo: dados.periodo });
      return {
        resposta: `Digite o aviso de cancelamento para *${item.cliente_nome}*.\nOs horários livres do sistema para remarcar vão juntos no WhatsApp.`,
        instance,
        telefone,
      };
    }
    if (lower === '2') {
      return donoCancelarComRemarcacao({ item, instance, telefoneDono: telefone });
    }
    return { resposta: textoAcoesHorario(item), instance, telefone };
  }

  if (estado === 'dono_item_aviso_texto') {
    const item = dados.item;
    if (!item) {
      await setSession(telefone, 'dono_menu', {});
      return { resposta: menuDono(), instance, telefone };
    }
    const r = await enviarAvisoComRemarcacao({
      telefoneCliente: item.cliente_telefone,
      clienteNome: item.cliente_nome,
      servicoId: item.servico_id,
      profissionalId: item.profissional_id,
      quando: item.quando,
      servicoNome: item.servico,
      agendamentoId: item.id,
      textoAviso: raw,
      instance,
    });
    await setSession(telefone, 'dono_menu', {});
    return {
      resposta: r.erro_envio
        ? `Não consegui enviar. ${r.erro_envio}\n\n${menuDono()}`
        : `Aviso enviado para *${item.cliente_nome}* com ${r.slots?.length || 0} horário(s) para remarcar.\n\n${menuDono()}`,
      instance,
      telefone,
    };
  }

  if (estado === 'dono_aviso_todos_texto') {
    const textoAviso = raw;
    await setSession(telefone, 'dono_aviso_todos_confirmar', { textoAviso });
    const clientes = await listarClientesComAgenda();
    return {
      resposta: [
        `Vou enviar para *${clientes.length}* cliente(s):`,
        '',
        textoAviso,
        '',
        'Confirma?',
        '1 - Sim, enviar',
        '2 - Não',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  if (estado === 'dono_aviso_todos_confirmar') {
    if (lower === '2' || respostaNegativa(raw)) {
      await setSession(telefone, 'dono_menu', {});
      return { resposta: 'Envio cancelado.\n' + menuDono(), instance, telefone };
    }
    if (lower === '1' || respostaPositiva(raw)) {
      const clientes = await listarClientesComAgenda();
      let ok = 0;
      let falhas = 0;
      for (const c of clientes) {
        const r = await enviarAvisoComRemarcacao({
          telefoneCliente: c.cliente_telefone,
          clienteNome: c.cliente_nome,
          servicoId: c.servico_id,
          profissionalId: c.profissional_id,
          quando: c.quando,
          servicoNome: c.servico,
          agendamentoId: c.id,
          textoAviso: dados.textoAviso,
          instance,
        });
        if (r.erro_envio || !r.ok) falhas += 1;
        else ok += 1;
      }
      await setSession(telefone, 'dono_menu', {});
      return {
        resposta: `Aviso enviado: *${ok}/${clientes.length}* (com horários de remarcação).${falhas ? `\nFalhas: ${falhas}` : ''}\n\n${menuDono()}`,
        instance,
        telefone,
      };
    }
    return { resposta: 'Digite *1* para enviar ou *2* para desistir.', instance, telefone };
  }

  if (estado === 'dono_aviso_um_escolher') {
    const n = Number(lower);
    const clientes = dados.clientes || [];
    if (!Number.isInteger(n) || n < 1 || n > clientes.length) {
      return { resposta: 'Digite o *número* da cliente, ou *menu* para sair.', instance, telefone };
    }
    const escolhida = clientes[n - 1];
    await setSession(telefone, 'dono_aviso_um_texto', { escolhida });
    return {
      resposta: [
        `Cliente: *${escolhida.cliente_nome}*`,
        `Próximo horário: ${escolhida.quando} · ${escolhida.servico}`,
        '',
        'Digite o aviso de cancelamento. Os horários livres para remarcar vão juntos.',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  if (estado === 'dono_aviso_um_texto') {
    const escolhida = dados.escolhida;
    if (!escolhida) {
      await setSession(telefone, 'dono_menu', {});
      return { resposta: menuDono(), instance, telefone };
    }
    const r = await enviarAvisoComRemarcacao({
      telefoneCliente: escolhida.cliente_telefone,
      clienteNome: escolhida.cliente_nome,
      servicoId: escolhida.servico_id,
      profissionalId: escolhida.profissional_id,
      quando: escolhida.quando,
      servicoNome: escolhida.servico,
      agendamentoId: escolhida.id,
      textoAviso: raw,
      instance,
    });
    await setSession(telefone, 'dono_menu', {});
    return {
      resposta: r.erro_envio
        ? `Não consegui enviar. ${r.erro_envio}\n\n${menuDono()}`
        : `Aviso enviado para *${escolhida.cliente_nome}* com ${r.slots?.length || 0} horário(s) para remarcar.\n\n${menuDono()}`,
      instance,
      telefone,
    };
  }

  if (estado === 'dono_cancelar_escolher') {
    const n = Number(lower);
    const horarios = dados.horarios || [];
    if (!Number.isInteger(n) || n < 1 || n > horarios.length) {
      return { resposta: 'Digite o *número* do horário, ou *menu* para sair.', instance, telefone };
    }
    const item = horarios[n - 1];
    return donoCancelarComRemarcacao({ item, instance, telefoneDono: telefone });
  }

  if (estado === 'agendar_tipo_corte') {
    const dataHint = dados.dataTextoHint || dados.last_data || null;
    if (eCorteMasculino(raw)) {
      await setSession(telefone, 'idle', { last_data: dataHint });
      return {
        resposta: textoServicoNaoOferecido('corte masculino'),
        instance,
        telefone,
      };
    }
    if (eCorteFeminino(raw) || respostaPositiva(raw)) {
      const servicos = await listarServicos();
      const servico = matchServico(servicos, 'corte feminino');
      return iniciarAgendamento(telefone, instance, {
        servico,
        servicoNome: 'corte feminino',
        dataTexto: dataHint,
        textoOriginal: 'corte feminino',
      });
    }
    return {
      resposta: textoCorteGenerico(await listarServicos()),
      instance,
      telefone,
    };
  }

  // A última pergunta foi "Quer ver os profissionais?"
  if (estado === 'confirmar_ver_profissionais') {
    if (respostaPositiva(raw)) {
      await setSession(telefone, 'confirmar_agendar_equipe', {});
      return {
        resposta: await textoEquipeCliente(),
        instance,
        telefone,
      };
    }
    if (respostaNegativa(raw)) {
      await clearSession(telefone);
      return {
        resposta: 'Tudo bem! Quando precisar, é só me chamar 😊',
        instance,
        telefone,
      };
    }
    // Pergunta nova (ex: "quais profissionais?") — não insiste em "quero"
    estado = 'idle';
  }

  // A última pergunta foi "Quer marcar com alguma delas?"
  if (estado === 'confirmar_agendar_equipe') {
    if (respostaPositiva(raw)) {
      return iniciarAgendamento(telefone, instance);
    }
    if (respostaNegativa(raw)) {
      await clearSession(telefone);
      return {
        resposta: 'Tudo bem! Quando quiser marcar, é só me chamar 😊',
        instance,
        telefone,
      };
    }
    estado = 'idle';
  }

  // Continuação contextual após "Quer que eu veja os horários disponíveis?"
  if (estado === 'confirmar_ver_horarios') {
    const servico = dados.servico;
    if (!servico) {
      await clearSession(telefone);
      return { resposta: menu({ pushName }), instance, telefone };
    }

    const recusou = respostaNegativa(raw);
    if (recusou) {
      await clearSession(telefone);
      return {
        resposta: 'Tudo bem! Se precisar de mais alguma coisa, é só me chamar 😊',
        instance,
        telefone,
      };
    }

    const confirmou = respostaPositiva(raw);
    const informouData = Boolean(parseDia(raw));

    if (confirmou || informouData) {
      return responderDisponibilidade(telefone, instance, {
        servicoNome: servico.nome,
        dataTexto: informouData ? raw : null,
      });
    }

    estado = 'idle';
  }

  // ===== área da profissional =====
  if (estado === 'equipe_escolher') {
    const n = Number(lower);
    const lista = dados.profissionais || (await listarProfissionaisAtivos());
    if (!Number.isInteger(n) || n < 1 || n > lista.length) {
      return {
        resposta: 'Digite o *número* do seu nome na lista.\nOu *menu* para voltar.',
        instance,
        telefone,
      };
    }
    const prof = lista[n - 1];
    await setSession(telefone, 'equipe_pin', { profissional: prof });
    return {
      resposta: `Olá, *${prof.nome}*!\nDigite seu *PIN* de acesso (4 dígitos):`,
      instance,
      telefone,
    };
  }

  if (estado === 'equipe_pin') {
    const prof = dados.profissional;
    if (!prof) {
      await clearSession(telefone);
      return { resposta: menu(), instance, telefone };
    }
    if (String(raw) !== String(prof.pin_acesso || '1234')) {
      return {
        resposta: 'PIN incorreto. Tente de novo, ou digite *menu* para sair.',
        instance,
        telefone,
      };
    }
    await setSession(telefone, 'profissional_menu', { profissional: prof });
    return { resposta: menuProfissional(prof), instance, telefone };
  }

  if (estado === 'profissional_menu') {
    const prof = dados.profissional;
    if (!prof) {
      await clearSession(telefone);
      return { resposta: menu(), instance, telefone };
    }
    if (lower === '4' || lower === 'cliente') {
      await clearSession(telefone);
      return { resposta: menu(), instance, telefone };
    }
    const mapa = { '1': 'hoje', '2': 'amanha', '3': 'semana' };
    if (!mapa[lower]) {
      return { resposta: menuProfissional(prof), instance, telefone };
    }
    const { titulo, itens } = await agendaProfissional(prof.id, mapa[lower]);
    await setSession(telefone, 'profissional_menu', { profissional: prof });
    return {
      resposta: textoAgendaProfissional(prof, titulo, itens),
      instance,
      telefone,
    };
  }

  // menu numérico quando idle
  if (estado === 'idle' || estado === 'menu' || estado === 'agent') {
    // Recuperação pelo histórico: mesmo que o estado transitório tenha sido
    // perdido, "quero/sim" executa a última oferta feita pelo bot.
    if (respostaPositiva(raw)) {
      const retomada = await retomarUltimaOferta(telefone, instance);
      if (retomada) return retomada;
    }

    if (lower === '1') {
      const servicos = await listarServicos();
      await setSession(telefone, 'confirmar_ver_profissionais', {});
      return { resposta: textoServicos(servicos), instance, telefone };
    }
    if (lower === '5') {
      return { resposta: await textoInfos(), instance, telefone };
    }
    if (lower === '2') {
      const servicos = await listarServicos();
      dados = { servicos };
      await setSession(telefone, 'agendar_servico', dados);
      const linhas = servicos.map((s, i) => `${i + 1} - ${s.nome}`);
      return {
        resposta: [
          '*Agendar horário*',
          '',
          'Qual serviço você quer marcar?',
          'Digite só o *número*:',
          '',
          ...linhas,
          '',
          'Para ver preços, digite *menu* e depois *1*.',
          'Ou digite *menu* para voltar.',
        ].join('\n'),
        instance,
        telefone,
      };
    }
    if (lower === '3') {
      const lista = await meusAgendamentos(telefone);
      if (!lista.length) {
        return {
          resposta:
            '*Seus horários*\n\nVocê não tem agendamentos.\n\nDigite *2* para marcar ou *menu* para voltar.',
          instance,
        };
      }
      const linhas = lista.map(
        (a, i) => `${i + 1} - ${a.quando}\n${a.servico} com ${a.profissional}`,
      );
      return {
        resposta: ['*Seus horários*', '', ...linhas, '', 'Digite *menu* para voltar.'].join('\n'),
        instance,
      };
    }
    if (lower === '4') {
      return listaParaCancelarOuRemarcar(telefone, instance, 'Cancelar ou remarcar');
    }

    // linguagem natural → classificador de intenções
    return handleNaturalIntent({ telefone, texto: raw, pushName, instance });
  }

  // ===== fluxo agendar =====
  if (estado === 'agendar_servico') {
    const n = Number(lower);
    const servicos = dados.servicos || (await listarServicos());
    if (!Number.isInteger(n) || n < 1 || n > servicos.length) {
      const desvio = await tratarCorrecaoServico({
        telefone,
        texto: raw,
        instance,
        dados,
      });
      if (desvio) return desvio;
      return {
        resposta: 'Digite só o *número* do serviço da lista, ou o nome do serviço.\nOu *menu* para voltar.',
        instance,
      };
    }
    const servico = servicos[n - 1];
    const profissionais = await profissionaisDoServico(servico.id);
    if (!profissionais.length) {
      await clearSession(telefone);
      return {
        resposta: 'Esse serviço não tem profissional disponível agora.\nDigite *menu* para voltar.',
        instance,
      };
    }
    dados = { servico, profissionais };
    await setSession(telefone, 'agendar_profissional', dados);
    const linhas = profissionais.map((p, i) =>
      p.cargo ? `${i + 1} - ${p.nome} (${p.cargo})` : `${i + 1} - ${p.nome}`,
    );
    return {
      resposta: [
        `Serviço: *${servico.nome}*`,
        `Valor: ${formatPreco(servico)}`,
        '',
        'Escolha o *profissional*:',
        '',
        ...linhas,
        `${profissionais.length + 1} - Qualquer profissional`,
        '',
        'Digite o número.',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  if (estado === 'agendar_profissional') {
    const profissionais = dados.profissionais || [];
    const qualquer = profissionais.length + 1;
    let n = parseNumeroOpcao(raw);
    // tenta match por nome se não veio número
    if (isNaN(n) || n < 1 || n > qualquer) {
      const idxNome = matchNome(profissionais, raw);
      if (idxNome >= 0) n = idxNome + 1;
    }
    // "qualquer", "tanto faz", "qualquer um", "pode ser qualquer"
    if (isNaN(n) && /qualquer|tanto faz|pode ser|nao importa|nao tenho preferencia/.test(normalizeTxt(raw))) {
      n = qualquer;
    }
    if (isNaN(n) || n < 1 || n > qualquer) {
      const desvio = await tratarCorrecaoServico({
        telefone,
        texto: raw,
        instance,
        dados,
      });
      if (desvio) return desvio;
      const linhas = profissionais.map((p, i) =>
        p.cargo ? `${i + 1} - ${p.nome} (${p.cargo})` : `${i + 1} - ${p.nome}`,
      );
      return {
        resposta: [
          dados.servico?.nome
            ? `Ainda estamos no *${dados.servico.nome}*.`
            : 'Ainda estamos no agendamento.',
          'Pode dizer o *nome* ou o *número* da profissional:',
          '',
          ...linhas,
          `${qualquer} - Qualquer profissional`,
          '',
          'Ou *menu* para voltar.',
        ].join('\n'),
        instance,
      };
    }
    const profissional = n === qualquer ? null : profissionais[n - 1];
    dados = {
      ...dados,
      profissional,
      profissionalId: profissional?.id || null,
    };

    // se a cliente já tinha dito o dia na mensagem original, avança
    if (dados.dataTextoHint) {
      const natural = parseDiaHoraNatural(dados.dataTextoHint);
      if (natural?.dataIso && natural?.hora) {
        dados = {
          ...dados,
          dataIso: natural.dataIso,
          horaPedida: natural.hora,
          diaNome: natural.diaNome,
          labelNatural: natural.label,
        };
        await setSession(telefone, 'agendar_confirmar_datahora', dados);
        return {
          resposta: [
            'Entendi assim:',
            `*${natural.diaNome} dia ${formatDiaBr(natural.dataIso)} às ${natural.hora}*`,
            '',
            `Serviço: ${dados.servico.nome}`,
            profissional?.nome
              ? `Com: ${profissional.nome}`
              : 'Com: profissional disponível',
            '',
            'Está certo?',
            '1 - Sim',
            '2 - Não',
          ].join('\n'),
          instance,
          telefone,
        };
      }
      const dataIso = parseDia(dados.dataTextoHint);
      if (dataIso) {
        const diaNome = nomeDiaDaData(dataIso);
        const slots = await listarHorariosLivres({
          dataIso,
          servicoId: dados.servico.id,
          duracaoMinutos: dados.servico.duracao_minutos,
          profissionalId: dados.profissionalId,
        });
        if (slots.length) {
          dados = { ...dados, dataIso, diaNome, slots };
          await setSession(telefone, 'agendar_hora', dados);
          const linhas = slots.map((s, i) => `${i + 1} - ${s.label}`);
          return {
            resposta: [
              profissional
                ? `Profissional: *${profissional.nome}*`
                : 'Profissional: *qualquer um disponível*',
              `Dia: *${diaNome}, ${formatDiaBr(dataIso)}*`,
              '',
              'Escolha o *horário*:',
              '',
              ...linhas,
              '',
              'Digite o número.',
            ].join('\n'),
            instance,
            telefone,
          };
        }
      }
    }

    await setSession(telefone, 'agendar_dia', dados);
    return {
      resposta: [
        profissional
          ? `Profissional: *${profissional.nome}*`
          : 'Profissional: *qualquer um disponível*',
        '',
        'Qual o *dia e horário*?',
        '',
        'Pode digitar assim:',
        '• *terça às 10h*',
        '• *quarta as 14:30*',
        '• *hoje*',
        '• *amanha*',
        '• *12/08*',
        '',
        'Se digitar só o dia, eu mostro os horários livres.',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  if (estado === 'agendar_dia') {
    // "terça às 10h" → confirma data/hora
    const natural = parseDiaHoraNatural(raw);
    if (natural?.dataIso && natural?.hora) {
      const dow = new Date(`${natural.dataIso}T12:00:00`).getDay();
      if (dow === 0 || dow === 1) {
        return {
          resposta: [
            `Entendi: *${natural.label}*`,
            '',
            'Mas nesse dia estamos *fechados*.',
            'Funcionamos de *terça a sábado*, 09:00 às 18:00.',
            '',
            'Digite outro dia/horário (ex: *terça às 10h*).',
          ].join('\n'),
          instance,
          telefone,
        };
      }

      dados = {
        ...dados,
        dataIso: natural.dataIso,
        horaPedida: natural.hora,
        diaNome: natural.diaNome,
        labelNatural: natural.label,
      };
      await setSession(telefone, 'agendar_confirmar_datahora', dados);
      return {
        resposta: [
          'Entendi assim:',
          `*${natural.diaNome} dia ${formatDiaBr(natural.dataIso)} às ${natural.hora}*`,
          '',
          `Serviço: ${dados.servico.nome}`,
          dados.profissional?.nome
            ? `Com: ${dados.profissional.nome}`
            : 'Com: profissional disponível',
          '',
          'Está certo?',
          '1 - Sim',
          '2 - Não',
        ].join('\n'),
        instance,
        telefone,
      };
    }

    const dataIso = parseDia(raw);
    if (!dataIso) {
      return {
        resposta: [
          'Não entendi a data.',
          '',
          'Exemplos:',
          '• *terça às 10h*',
          '• *quarta as 14h*',
          '• *hoje* / *amanha*',
          '• *12/08*',
          '',
          'Ou digite *menu* para voltar.',
        ].join('\n'),
        instance,
        telefone,
      };
    }

    const diaNome = nomeDiaDaData(dataIso);
    const slots = await listarHorariosLivres({
      dataIso,
      servicoId: dados.servico.id,
      duracaoMinutos: dados.servico.duracao_minutos,
      profissionalId: dados.profissionalId,
    });
    if (!slots.length) {
      const dow = new Date(`${dataIso}T12:00:00`).getDay();
      const fechado = dow === 0 || dow === 1;
      return {
        resposta: fechado
          ? [
              `*${diaNome}, ${formatDiaBr(dataIso)}* estamos fechados.`,
              '',
              'Funcionamos de *terça a sábado*, das 09:00 às 18:00.',
              'Digite outro dia (ex: *terça às 10h*), ou *menu*.',
            ].join('\n')
          : [
              `Não há horários livres em *${diaNome}, ${formatDiaBr(dataIso)}*.`,
              '',
              'Digite outro dia, ou *menu* para voltar.',
            ].join('\n'),
        instance,
        telefone,
      };
    }
    dados = { ...dados, dataIso, diaNome, slots };
    await setSession(telefone, 'agendar_hora', dados);
    const linhas = slots.map((s, i) => `${i + 1} - ${s.label}`);
    return {
      resposta: [
        `Dia: *${diaNome}, ${formatDiaBr(dataIso)}*`,
        '',
        'Escolha o *horário* digitando o número:',
        '',
        ...linhas,
        '',
        'Ou digite tipo *10h* / *14:30*.',
        'Ou *menu* para voltar.',
      ].join('\n'),
      instance,
      telefone,
    };
  }

  if (estado === 'agendar_confirmar_datahora') {
    if (parseNumeroOpcao(raw) === 1 || respostaPositiva(raw)) {
      const slot = await encontrarSlotExato({
        dataIso: dados.dataIso,
        hora: dados.horaPedida,
        servicoId: dados.servico.id,
        duracaoMinutos: dados.servico.duracao_minutos,
        profissionalId: dados.profissionalId,
      });

      if (!slot) {
        const slots = await listarHorariosLivres({
          dataIso: dados.dataIso,
          servicoId: dados.servico.id,
          duracaoMinutos: dados.servico.duracao_minutos,
          profissionalId: dados.profissionalId,
        });
        if (!slots.length) {
          await setSession(telefone, 'agendar_dia', {
            servico: dados.servico,
            profissionais: dados.profissionais,
            profissional: dados.profissional,
            profissionalId: dados.profissionalId,
          });
          return {
            resposta: [
              `*${dados.diaNome} dia ${formatDiaBr(dados.dataIso)} às ${dados.horaPedida}* não está disponível.`,
              '',
              'Digite outro dia/horário (ex: *quarta às 11h*).',
            ].join('\n'),
            instance,
            telefone,
          };
        }
        dados = { ...dados, slots };
        await setSession(telefone, 'agendar_hora', dados);
        const linhas = slots.map((s, i) => `${i + 1} - ${s.label}`);
        return {
          resposta: [
            `*${dados.horaPedida}* não está livre nesse dia.`,
            '',
            `Horários em *${dados.diaNome}, ${formatDiaBr(dados.dataIso)}*:`,
            '',
            ...linhas,
            '',
            'Digite o *número* do horário.',
          ].join('\n'),
          instance,
          telefone,
        };
      }

      dados = {
        ...dados,
        slot,
        profissionalId: slot.profissionalId,
        profissionalNome: slot.profissionalNome,
      };
      return await seguirParaNome(telefone, dados, pushName, instance);
    }

    if (lower === '2' || lower === 'nao' || lower === 'não') {
      await setSession(telefone, 'agendar_dia', {
        servico: dados.servico,
        profissionais: dados.profissionais,
        profissional: dados.profissional,
        profissionalId: dados.profissionalId,
      });
      return {
        resposta: [
          'Sem problema.',
          'Digite outro dia/horário:',
          '• *terça às 10h*',
          '• *quarta as 14:30*',
          '• *12/08*',
        ].join('\n'),
        instance,
        telefone,
      };
    }

    return {
      resposta: 'Digite *1* para confirmar ou *2* para escolher outro horário.',
      instance,
      telefone,
    };
  }

  if (estado === 'agendar_hora') {
    const slots = dados.slots || [];

    // aceita "10h", "14:30" além do número
    const horaDig = parseDiaHoraNatural(raw)?.hora || (normalizeHoraAvulsa(raw));
    if (horaDig) {
      const slot = slots.find((s) => s.hora === horaDig);
      if (!slot) {
        return {
          resposta: [
            `Horário *${horaDig}* não está na lista.`,
            'Digite o *número* de um horário livre, ou *menu*.',
          ].join('\n'),
          instance,
          telefone,
        };
      }
      dados = {
        ...dados,
        slot,
        profissionalId: slot.profissionalId,
        profissionalNome: slot.profissionalNome,
      };
      return await seguirParaNome(telefone, dados, pushName, instance);
    }

    const n = parseNumeroOpcao(raw);
    if (isNaN(n) || n < 1 || n > slots.length) {
      const linhas = slots.slice(0, 12).map((s, i) => `${i + 1} - ${s.label}`);
      return {
        resposta: [
          'Pode falar o *número* ou o *horário* (ex: "dez horas", "14h30"):',
          '',
          ...linhas,
          '',
          'Ou *menu* para voltar.',
        ].join('\n'),
        instance,
        telefone,
      };
    }
    const slot = slots[n - 1];
    dados = {
      ...dados,
      slot,
      profissionalId: slot.profissionalId,
      profissionalNome: slot.profissionalNome,
    };
    return await seguirParaNome(telefone, dados, pushName, instance);
  }

  if (estado === 'agendar_nome') {
    const nOpcao = parseNumeroOpcao(raw);
    if (nOpcao === 1 || respostaPositiva(raw)) {
      dados.clienteNome = dados.nomeSugestao;
      await setSession(telefone, 'agendar_confirmar', dados);
      return {
        resposta: textoConfirmacao(dados),
        instance,
      };
    }
    if (nOpcao === 2 || respostaNegativa(raw) || /outro nome|meu nome e|me chamo/.test(normalizeTxt(raw))) {
      await setSession(telefone, 'agendar_nome_texto', dados);
      return { resposta: 'Digite seu *nome*:', instance };
    }
    return {
      resposta: 'Digite *1* para confirmar o nome ou *2* para outro.\nOu *menu* para voltar.',
      instance,
    };
  }

  if (estado === 'agendar_nome_texto') {
    if (raw.length < 2) {
      return { resposta: 'Digite um nome válido, por favor.', instance };
    }
    dados.clienteNome = raw;
    await setSession(telefone, 'agendar_confirmar', dados);
    return { resposta: textoConfirmacao(dados), instance };
  }

  if (estado === 'agendar_confirmar') {
    if (parseNumeroOpcao(raw) === 1 || respostaPositiva(raw)) {
      try {
        const criado = await criarAgendamento({
          telefone,
          nome: dados.clienteNome,
          servicoId: dados.servico.id,
          profissionalId: dados.profissionalId,
          dataIso: dados.dataIso,
          hora: dados.slot.hora,
          duracao: dados.servico.duracao_minutos,
        });
        await clearSession(telefone);
        return {
          resposta: [
            '*Horário confirmado!* ✅',
            '',
            `Código: *#${criado.id}*`,
            `Nome: ${dados.clienteNome}`,
            `Serviço: ${dados.servico.nome}`,
            `Com: ${dados.profissionalNome}`,
            `Quando: ${formatDiaBr(dados.dataIso)} às ${dados.slot.hora}`,
            '',
            'Digite *menu* para voltar.',
          ].join('\n'),
          instance,
        };
      } catch (err) {
        await setSession(telefone, 'agendar_dia', {
          servico: dados.servico,
          profissionais: dados.profissionais,
          profissional: dados.profissional,
          profissionalId: dados.profissionalId,
        });
        return {
          resposta: [
            'Esse horário acabou de ficar indisponível.',
            'Vamos escolher outro dia.',
            '',
            'Digite a data (*hoje*, *amanha* ou *10/08*).',
          ].join('\n'),
          instance,
        };
      }
    }
    if (parseNumeroOpcao(raw) === 2 || respostaNegativa(raw)) {
      await clearSession(telefone);
      return {
        resposta: 'Agendamento cancelado.\nDigite *2* para tentar de novo ou *menu*.',
        instance,
      };
    }
    return {
      resposta: 'Pode falar *sim* para confirmar ou *não* para desistir.',
      instance,
    };
  }

  // ===== remarcar (só slots reais do banco) =====
  if (estado === 'remarcar_escolher_slot') {
    const slots = dados.slots || [];
    const servico = dados.servico;
    if (lower === 'nao' || lower === 'não') {
      await clearSession(telefone);
      return {
        resposta: 'Sem problema. Quando quiser remarcar, digite *2* ou *remarcar*.',
        instance,
        telefone,
      };
    }
    const dataIso = parseDia(raw);
    if (dataIso && servico && !/^\d+$/.test(lower)) {
      const novos = await buscarSlotsRemarcacaoNoDia({
        dataIso,
        servicoId: servico.id,
        duracaoMinutos: servico.duracao_minutos,
      });
      if (!novos.length) {
        return {
          resposta: [
            `Não há horário livre de *${servico.nome}* em *${formatDiaBr(dataIso)}* no sistema.`,
            'Escolha um *número* da lista ou outro dia (ex: *amanhã*).',
          ].join('\n'),
          instance,
          telefone,
        };
      }
      await setSession(telefone, 'remarcar_escolher_slot', { ...dados, slots: novos });
      const linhas = novos.map((s, i) => `${i + 1} - ${s.label}`);
      return {
        resposta: [
          `Horários livres de *${servico.nome}* em *${formatDiaBr(dataIso)}* (conferidos no sistema):`,
          '',
          ...linhas,
          '',
          'Digite o *número*.',
        ].join('\n'),
        instance,
        telefone,
      };
    }
    const n = Number(lower);
    if (!Number.isInteger(n) || n < 1 || n > slots.length) {
      return {
        resposta:
          'Digite o *número* de um horário da lista (são os livres no sistema).\nOu *menu* para sair.',
        instance,
        telefone,
      };
    }
    const slot = slots[n - 1];
    await setSession(telefone, 'remarcar_confirmar', { ...dados, slot });
    return {
      resposta: textoConfirmarRemarcacao({ servicoNome: servico?.nome || 'Serviço', slot }),
      instance,
      telefone,
    };
  }

  if (estado === 'remarcar_confirmar') {
    const slot = dados.slot;
    const servico = dados.servico;
    if (lower === '2' || lower === 'nao' || lower === 'não') {
      await setSession(telefone, 'remarcar_escolher_slot', { ...dados, slot: undefined });
      const linhas = (dados.slots || []).map((s, i) => `${i + 1} - ${s.label}`);
      return {
        resposta: ['Escolha outro horário livre do sistema:', '', ...linhas].join('\n'),
        instance,
        telefone,
      };
    }
    if (lower === '1' || lower === 'sim') {
      if (!slot || !servico) {
        await clearSession(telefone);
        return {
          resposta: 'Não consegui remarcar. Digite *remarcar* para começar de novo.',
          instance,
          telefone,
        };
      }
      try {
        if (dados.agendamentoId) {
          const antigo = await query(
            `UPDATE salao.agendamentos
             SET status = 'cancelado', atualizado_em = NOW()
             WHERE id = $1 AND status IN ('confirmado', 'pendente')
             RETURNING google_event_id`,
            [dados.agendamentoId],
          );
          if (antigo.rows[0]?.google_event_id) {
            await cancelarEventoGoogle(antigo.rows[0].google_event_id);
          }
        }
        const row = await criarAgendamento({
          telefone,
          nome: dados.clienteNome || pushName || 'Cliente',
          servicoId: servico.id,
          profissionalId: slot.profissionalId,
          dataIso: slot.dataIso,
          hora: slot.hora,
          duracao: servico.duracao_minutos,
        });
        await clearSession(telefone);
        return {
          resposta: [
            '*Remarcado*',
            '',
            `Código #${row.id}`,
            `${servico.nome} com ${slot.profissionalNome}`,
            row.quando,
            '',
            'Horário gravado no sistema. Digite *menu* se precisar de mais alguma coisa.',
          ].join('\n'),
          instance,
          telefone,
        };
      } catch {
        const novos = await buscarSlotsRemarcacao({
          servicoId: servico.id,
          duracaoMinutos: servico.duracao_minutos,
          profissionalId: slot.profissionalId,
        });
        if (!novos.length) {
          await clearSession(telefone);
          return {
            resposta:
              'Esse horário acabou de ser ocupado e não achei outro livre no sistema agora. Digite *2* para tentar de novo.',
            instance,
            telefone,
          };
        }
        await setSession(telefone, 'remarcar_escolher_slot', { ...dados, slots: novos, slot: undefined });
        const linhas = novos.map((s, i) => `${i + 1} - ${s.label}`);
        return {
          resposta: [
            'Esse horário acabou de ficar indisponível no sistema.',
            'Escolha outro da lista atualizada:',
            '',
            ...linhas,
          ].join('\n'),
          instance,
          telefone,
        };
      }
    }
    return {
      resposta: 'Digite *1* para confirmar ou *2* para escolher outro horário da lista.',
      instance,
      telefone,
    };
  }

  // ===== cancelar =====
  if (estado === 'cancelar_escolher') {
    const n = Number(lower);
    const lista = dados.cancelaveis || [];
    if (!Number.isInteger(n) || n < 1 || n > lista.length) {
      return {
        resposta: 'Digite o *número* do horário para cancelar.\nOu *menu* para voltar.',
        instance,
      };
    }
    const item = lista[n - 1];
    const r = await query(
      `UPDATE salao.agendamentos
       SET status = 'cancelado', atualizado_em = NOW()
       WHERE id = $1
         AND status IN ('confirmado', 'pendente')
         AND RIGHT(regexp_replace(cliente_telefone, '\\D', '', 'g'), 8) = $2
       RETURNING id, google_event_id, servico_id, profissional_id, cliente_nome,
         to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando`,
      [item.id, phoneTail(telefone)],
    );
    if (!r.rows.length) {
      await clearSession(telefone);
      return {
        resposta: 'Não consegui cancelar. Digite *3* para ver seus horários.',
        instance,
      };
    }
    await cancelarEventoGoogle(r.rows[0].google_event_id);
    const oferta = await prepararRemarcacao({
      telefoneCliente: telefone,
      clienteNome: r.rows[0].cliente_nome || item.cliente_nome || pushName,
      servicoId: r.rows[0].servico_id || item.servico_id,
      profissionalId: r.rows[0].profissional_id || item.profissional_id,
      quandoCancelado: r.rows[0].quando || item.quando,
      agendamentoId: r.rows[0].id,
      instance,
      origem: 'cliente',
      enviarWhatsApp: false,
    });
    return { resposta: oferta.texto, instance, telefone };
  }

  await clearSession(telefone);
  return { resposta: menu(), instance };
}

function textoConfirmacao(dados) {
  return [
    '*Confira seu agendamento:*',
    '',
    `Nome: ${dados.clienteNome}`,
    `Serviço: ${dados.servico.nome}`,
    `Com: ${dados.profissionalNome}`,
    `Quando: ${formatDiaBr(dados.dataIso)} às ${dados.slot.hora}`,
    '',
    'Está certo?',
    '1 - Sim, confirmar',
    '2 - Não, cancelar',
  ].join('\n');
}

async function criarAgendamento({
  telefone,
  nome,
  servicoId,
  profissionalId,
  dataIso,
  hora,
  duracao,
}) {
  const livre = await query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM salao.agendamentos a
       WHERE a.status IN ('confirmado', 'pendente')
         AND a.profissional_id = $1
         AND tstzrange(a.inicio_em, a.fim_em, '[)') &&
             tstzrange(
               ($2::date + $3::time) AT TIME ZONE 'America/Sao_Paulo',
               (($2::date + $3::time) AT TIME ZONE 'America/Sao_Paulo')
                 + make_interval(mins => $4::int),
               '[)'
             )
     ) AS livre`,
    [profissionalId, dataIso, hora, duracao],
  );
  if (!livre.rows[0]?.livre) {
    throw new Error('horario_ocupado');
  }

  const r = await query(
    `INSERT INTO salao.agendamentos (
       cliente_nome, cliente_telefone, servico_id, profissional_id,
       inicio_em, fim_em, status, origem
     ) VALUES (
       $1, $2, $3, $4,
       ($5::date + $6::time) AT TIME ZONE 'America/Sao_Paulo',
       (($5::date + $6::time) AT TIME ZONE 'America/Sao_Paulo')
         + make_interval(mins => $7::int),
       'confirmado', 'whatsapp'
     )
     RETURNING id,
       to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
       to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS inicio_local,
       to_char(fim_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS fim_local`,
    [nome, telefone, servicoId, profissionalId, dataIso, hora, duracao],
  );
  const row = r.rows[0];
  const servicoNome = (
    await query(`SELECT nome FROM salao.servicos WHERE id = $1`, [servicoId])
  ).rows[0]?.nome;
  const profNome = profissionalId
    ? (await query(`SELECT nome FROM salao.profissionais WHERE id = $1`, [profissionalId])).rows[0]?.nome
    : null;
  await sincronizarNovoAgendamento({
    id: row.id,
    cliente: nome,
    telefone,
    servico: servicoNome || 'Serviço',
    profissional: profNome,
    inicioLocal: row.inicio_local,
    fimLocal: row.fim_local,
  });
  await criarPagamentoPendente(row.id, servicoId);
  await avisarDonoNovoAgendamento({
    id: row.id,
    cliente: nome,
    telefoneCliente: telefone,
    servico: servicoNome || 'Serviço',
    profissional: profNome,
    quando: row.quando,
  });
  return row;
}
