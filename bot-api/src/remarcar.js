import { query } from './db.js';
import { sendWhatsAppText } from './evolution.js';
import { listarProximosSlotsLivres, parseDia, listarHorariosLivres, formatDiaBr, nomeDiaDaData } from './slots.js';

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

function phoneTail(telefone) {
  return onlyDigits(telefone).slice(-8);
}

async function chaveSessaoCliente(telefone) {
  const digits = onlyDigits(telefone);
  const tail = phoneTail(digits);
  if (!tail) return digits;
  const r = await query(
    `SELECT telefone
     FROM salao.conversas
     WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 8) = $1
     LIMIT 1`,
    [tail],
  );
  return r.rows[0]?.telefone || digits;
}

async function setSession(telefone, estado, dados = {}) {
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

export async function carregarServico(servicoId) {
  const r = await query(
    `SELECT id, nome, duracao_minutos, preco_centavos, COALESCE(preco_apartir, FALSE) AS preco_apartir, categoria, ativo
     FROM salao.servicos
     WHERE id = $1
     LIMIT 1`,
    [servicoId],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.ativo) return row;
  const alt = await query(
    `SELECT id, nome, duracao_minutos, preco_centavos, COALESCE(preco_apartir, FALSE) AS preco_apartir, categoria, ativo
     FROM salao.servicos
     WHERE ativo AND LOWER(nome) = LOWER($1)
     ORDER BY id DESC
     LIMIT 1`,
    [row.nome],
  );
  return alt.rows[0] || row;
}

export async function buscarSlotsRemarcacao({
  servicoId,
  duracaoMinutos,
  profissionalId = null,
}) {
  let slots = await listarProximosSlotsLivres({
    servicoId,
    duracaoMinutos,
    profissionalId,
    dias: 14,
    maxSlots: 8,
    maxPorDia: 3,
  });
  if (!slots.length && profissionalId) {
    slots = await listarProximosSlotsLivres({
      servicoId,
      duracaoMinutos,
      profissionalId: null,
      dias: 14,
      maxSlots: 8,
      maxPorDia: 3,
    });
  }
  return slots;
}

export async function buscarSlotsRemarcacaoNoDia({
  dataIso,
  servicoId,
  duracaoMinutos,
  profissionalId = null,
}) {
  const slotsDia = await listarHorariosLivres({
    dataIso,
    servicoId,
    duracaoMinutos,
    profissionalId,
    limite: 8,
  });
  const diaNome = nomeDiaDaData(dataIso);
  return slotsDia.map((s) => ({
    dataIso,
    hora: s.hora,
    profissionalId: s.profissionalId,
    profissionalNome: s.profissionalNome,
    diaNome,
    label: `${diaNome}, ${formatDiaBr(dataIso)} às ${s.hora} — ${s.profissionalNome}`,
  }));
}

export function textoOfertaRemarcacao({
  clienteNome,
  servicoNome,
  quandoCancelado,
  slots,
  origem = 'cliente',
}) {
  const nome = clienteNome ? ` ${clienteNome}` : '';
  if (!slots.length) {
    return [
      origem === 'dono'
        ? `Olá${nome ? `,${nome}` : ''}! Infelizmente precisamos cancelar seu horário de *${quandoCancelado}* (*${servicoNome}*) no Studio Erika Thebas.`
        : `*Horário cancelado*${quandoCancelado ? `\n${quandoCancelado} — ${servicoNome}` : ''}`,
      '',
      'Consultei a agenda do sistema e *não há horário livre* nos próximos 14 dias para este serviço.',
      '',
      'Quando quiser tentar de novo, digite *2* para agendar. Não marcamos data que não esteja no sistema.',
    ].join('\n');
  }

  const linhas = slots.map((s, i) => `${i + 1} - ${s.label}`);
  const cabeca =
    origem === 'dono'
      ? [
          `Olá${nome ? `,${nome}` : ''}! Precisamos cancelar seu horário de *${quandoCancelado}* (*${servicoNome}*) no Studio Erika Thebas.`,
          '',
          'Quer *remarcar*? Estes são os próximos horários *livres no sistema* (já conferidos na agenda, sem conflito):',
        ]
      : [
          '*Horário cancelado*',
          quandoCancelado ? `${quandoCancelado} — ${servicoNome}` : `Serviço: *${servicoNome}*`,
          '',
          'Quer *remarcar*? Horários livres no sistema (sem conflito com o que já está marcado):',
        ];

  return [
    ...cabeca,
    '',
    ...linhas,
    '',
    'Digite o *número* do horário para remarcar.',
    'Ou *0* / *menu* se não quiser agora.',
  ].join('\n');
}

export function textoSlotsRemarcacao(slots) {
  if (!slots.length) {
    return [
      'Consultei a agenda do sistema e *não há horário livre* nos próximos 14 dias para este serviço.',
      'Quando quiser remarcar, responda esta mensagem.',
    ].join('\n');
  }
  const linhas = slots.map((s, i) => `${i + 1} - ${s.label}`);
  return [
    'Para *remarcar*, estes são os próximos horários *livres no sistema* (já conferidos, sem conflito):',
    '',
    ...linhas,
    '',
    'Responda com o *número* do horário que preferir.',
    'Ou *0* se não quiser remarcar agora.',
  ].join('\n');
}

export function textoConfirmarRemarcacao({ servicoNome, slot }) {
  return [
    '*Confira a remarcação:*',
    '',
    `Serviço: ${servicoNome}`,
    `Com: ${slot.profissionalNome}`,
    `Quando: ${slot.label}`,
    '',
    'Este horário veio da agenda do sistema.',
    '1 - Sim, confirmar',
    '2 - Quero outro horário da lista',
  ].join('\n');
}

/**
 * Grava sessão da cliente no fluxo clássico (números = slots reais do banco).
 * Opcionalmente envia o WhatsApp (quando quem cancelou foi o dono).
 */
export async function prepararRemarcacao({
  telefoneCliente,
  clienteNome,
  servicoId,
  profissionalId = null,
  quandoCancelado,
  agendamentoId = null,
  instance = 'salao2',
  origem = 'cliente',
  enviarWhatsApp = false,
  textoAviso = null,
}) {
  const servico = await carregarServico(servicoId);
  if (!servico) {
    return { ok: false, erro: 'servico_nao_encontrado', slots: [], texto: null };
  }

  const slots = await buscarSlotsRemarcacao({
    servicoId: servico.id,
    duracaoMinutos: servico.duracao_minutos,
    profissionalId,
  });

  const textoBase = textoAviso
    ? [String(textoAviso).trim(), '', textoSlotsRemarcacao(slots)].join('\n')
    : textoOfertaRemarcacao({
        clienteNome,
        servicoNome: servico.nome,
        quandoCancelado,
        slots,
        origem,
      });

  const texto = textoBase;

  const telefoneSessao = await chaveSessaoCliente(telefoneCliente);
  if (slots.length) {
    await setSession(telefoneSessao, 'remarcar_escolher_slot', {
      servico,
      clienteNome: clienteNome || '',
      slots,
      origem,
      quandoCancelado: quandoCancelado || null,
      agendamentoId: agendamentoId || null,
    });
  } else {
    await setSession(telefoneSessao, 'idle', {});
  }

  if (enviarWhatsApp && telefoneSessao) {
    try {
      await sendWhatsAppText({
        instance,
        telefone: onlyDigits(telefoneCliente) || telefoneSessao,
        texto,
      });
    } catch (err) {
      return {
        ok: true,
        avisado: false,
        slots,
        texto,
        telefoneSessao,
        servico,
        erro_envio: err.message,
      };
    }
  }

  return { ok: true, avisado: enviarWhatsApp, slots, texto, telefoneSessao, servico };
}

/** Aviso da dona (cancelamento) + horários reais para remarcar. */
export async function enviarAvisoComRemarcacao({
  telefoneCliente,
  clienteNome,
  servicoId,
  profissionalId = null,
  quando,
  servicoNome,
  agendamentoId = null,
  textoAviso,
  instance = 'salao2',
}) {
  const intro =
    String(textoAviso || '').trim() ||
    `Olá, ${clienteNome}! Precisamos cancelar seu horário de *${quando}* (${servicoNome || 'serviço'}) no Studio Erika Thebas.`;

  return prepararRemarcacao({
    telefoneCliente,
    clienteNome,
    servicoId,
    profissionalId,
    quandoCancelado: quando,
    agendamentoId,
    instance,
    origem: 'dono',
    enviarWhatsApp: true,
    textoAviso: intro,
  });
}

export { parseDia };
