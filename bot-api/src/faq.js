const SERVICOS_CABELO = [
  'corte feminino',
  'corte masculino',
  'corte infantil',
  'escova',
  'escova progressiva',
  'hidratação capilar',
  'cauterização capilar',
  'botox capilar',
  'coloração',
  'mechas',
  'luzes',
  'ombré hair',
  'alisamento',
  'relaxamento capilar',
  'penteado para festa',
  'penteado para casamento',
  'tranças',
  'reconstrução capilar',
  'selagem capilar',
  'cronograma capilar',
  'corte com escova',
  'coloração com hidratação',
  'corte para cabelo cacheado',
  'manutenção de mechas',
  'matização',
];

const SERVICOS_UNHA = [
  'manicure',
  'pedicure',
  'manicure e pedicure',
  'unha em gel',
  'unha em fibra',
  'unha em acrigel',
  'esmaltação em gel',
  'spa dos pés',
  'nail art',
  'francesinha',
  'alongamento de unha',
  'manutenção de unha em gel',
  'remoção de unha em gel',
  'blindagem de unha',
  'cutilagem',
  'unha decorada',
  'banho de gel',
  'unha de fibra de vidro',
  'esmaltação simples',
  'pé e mão completo',
];

export const SERVICOS_FAQ = [...SERVICOS_CABELO, ...SERVICOS_UNHA];

export function normalizarFaq(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SERVICOS_NORMALIZADOS = SERVICOS_FAQ.map((nome) => ({
  nome,
  normalizado: normalizarFaq(nome),
})).sort((a, b) => b.normalizado.length - a.normalizado.length);

export function detectarServicoCatalogo(texto = '') {
  const t = normalizarFaq(texto);
  return SERVICOS_NORMALIZADOS.find(({ normalizado }) =>
    new RegExp(`(^| )${normalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(t),
  )?.nome || null;
}

const TOPICOS = [
  ['duracao_atendimento', /\bquanto tempo (demora|leva)\b/],
  ['preco_manutencao', /\bquanto custa (a )?manutencao\b/],
  ['preco', /\b(quanto custa|quanto ta|qual (o )?preco|qual (o )?valor|valor de)\b/],
  ['profissional', /\b(qual|quem).{0,20}(profissional|especialista|faz|atende)\b/],
  ['servico_oferecido', /\b(voces|vcs|voce|vc) (faz|fazem)|\btem (manicure|pedicure)\b/],
  ['preparo_lavagem', /\b(lavar o cabelo antes|preciso lavar|remover o esmalte antes)\b/],
  ['duracao_resultado', /\b(quanto tempo dura|quantas semanas dura|dura quanto)\b/],
  ['cabelo_cacheado', /\bcabelo (cacheado|crespo)\b/],
  ['quimica_anterior', /\b(com quimica|quimica anterior|esta com quimica)\b/],
  ['sessoes', /\bquantas sessoes\b/],
  ['contraindicacao', /\b(contraindicacao|contra indicado|pode causar alergia|alergia)\b/],
  ['desconto', /\b(desconto|primeira vez|promocao)\b/],
  ['antecedencia', /\b(antecedencia|quanto tempo antes)\b/],
  ['tamanho_cabelo', /\bcabelo (curto|longo)\b/],
  ['cuidados_depois', /\b(depois de|mesmo dia|lavar louca)\b/],
  ['parcelamento', /\b(parcelar|parcelamento)\b/],
  ['garantia', /\bgarantia\b/],
  ['fotos', /\b(fotos|foto|resultado|trabalhos)\b/],
  ['cheiro', /\bcheiro forte\b/],
  ['produtos', /\b(produtos naturais|qual produto|quais produtos)\b/],
  ['queda_cabelo', /\bqueda de cabelo\b/],
  ['combinar_servicos', /\b(combinar|mesmo dia|incluso)\b/],
  ['repeticao', /\b(quando repetir|tempo depois|posso repetir)\b/],
  ['unhas_fracas', /\bunhas? (fracas?|roidas?)\b/],
  ['manutencao', /\bmanutencao\b/],
  ['escolher_cor', /\bescolher a cor\b/],
  ['criancas', /\b(crianca|criancas|infantil)\b/],
  ['dor', /\b(doi|doer|dolorido)\b/],
  ['unha_natural', /\b(enfraquece|unha natural)\b/],
  ['diferenca', /\b(diferenca entre|para maos e para pes)\b/],
];

const TOPICOS_GERAIS = [
  ['politica_remarcacao', /\b(posso|como|da pra|da para) remarcar\b/],
  ['politica_cancelamento', /\b(multa|taxa|cobranca).{0,30}\b(cancelar|cancelamento|desmarcar)\b/],
  ['remarcacao', /\b(remarcar|mudar meu horario|trocar meu horario)\b/],
  ['cancelamento', /\b(multa|cancelar|cancelamento|desmarcar)\b/],
  ['formas_pagamento', /\b(pagamento|pix|cartao|dinheiro)\b/],
  ['sinal_agendamento', /\b(sinal|pagamento antecipado|pagar antes)\b/],
  ['atraso', /\b(atras|tolerancia)\b/],
  ['estacionamento', /\bestacionamento\b/],
  ['fidelidade', /\b(fidelidade|cartao fidelidade)\b/],
  ['endereco', /\b(endereco|onde fica|ponto de referencia)\b/],
];

export function detectarPerguntaFaq(texto = '') {
  const normalizado = normalizarFaq(texto);
  const servico = detectarServicoCatalogo(normalizado);

  for (const [topico, regex] of TOPICOS_GERAIS) {
    if (regex.test(normalizado)) {
      return { topico, servico, escopo: 'geral' };
    }
  }

  for (const [topico, regex] of TOPICOS) {
    if (regex.test(normalizado)) {
      return { topico, servico, escopo: servico ? 'servico' : 'geral' };
    }
  }

  return null;
}
