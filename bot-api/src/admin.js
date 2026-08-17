import { query } from './db.js';
import { sendWhatsAppText } from './evolution.js';
import { cancelarEventoGoogle } from './google-calendar.js';

export function ownerPin() {
  return String(process.env.OWNER_PIN || '1234');
}

export function ownerNotifyPhone() {
  return String(process.env.OWNER_NOTIFY_PHONE || '').replace(/\D/g, '');
}

export async function avisarDonoNovoAgendamento({
  id,
  cliente,
  telefoneCliente,
  servico,
  profissional,
  quando,
  instance = 'salao2',
}) {
  const dest = ownerNotifyPhone();
  if (!dest) return { skipped: true };
  const texto = [
    '*Novo agendamento no studio*',
    '',
    `Código: #${id}`,
    `Quando: *${quando}*`,
    `Serviço: ${servico}`,
    profissional ? `Profissional: ${profissional}` : null,
    `Cliente: ${cliente}`,
    telefoneCliente ? `WhatsApp: ${telefoneCliente}` : null,
    '',
    'Isso já está na agenda do sistema. Abra a agenda no computador: http://localhost:3001/admin',
  ]
    .filter(Boolean)
    .join('\n');
  try {
    await sendWhatsAppText({ instance, telefone: dest, texto });
    return { ok: true };
  } catch (err) {
    console.warn('[dono] falha ao avisar dono:', err.message);
    return { ok: false, erro: err.message };
  }
}

export function isDonoIntent(texto = '') {
  const t = String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;
  if (
    [
      'dono',
      'sou dono',
      'sou a dona',
      'agenda do salao',
      'agenda do studio',
      'avisos',
      'area do dono',
      'agendamentos',
      'ver agenda',
      'minha agenda',
      'horarios marcados',
    ].includes(t)
  ) {
    return true;
  }
  return /^(oi|ola|eai|hey)?\s*(dono|dona)\s*$/.test(t);
}

export function menuDono() {
  return [
    '*Área do dono* — Studio Erika Thebas',
    '',
    '*Ver agenda*',
    '1 - Hoje',
    '2 - Amanhã',
    '3 - Próximos 7 dias',
    '4 - Todos os horários futuros',
    '',
    '*Manipular*',
    '5 - Avisar *todas* as clientes',
    '6 - Avisar *uma* cliente',
    '7 - Cancelar, avisar e oferecer remarcação',
    '',
    '0 - Sair',
    '',
    'Digite o número. Depois da lista, escolha um horário para avisar ou cancelar.',
  ].join('\n');
}

export async function listarAgendaSalao(periodo = 'hoje') {
  let filtroData = `(a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;
  let titulo = 'Agenda de hoje (todas as profissionais)';

  if (periodo === 'amanha') {
    filtroData = `(a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date = ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + 1)`;
    titulo = 'Agenda de amanhã (todas as profissionais)';
  } else if (periodo === 'semana') {
    filtroData = `a.inicio_em >= NOW()
      AND a.inicio_em < ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + 7)`;
    titulo = 'Próximos 7 dias';
  } else if (periodo === 'futuros' || periodo === 'todos') {
    filtroData = `a.inicio_em >= NOW()`;
    titulo = 'Todos os horários futuros';
  }

  const { rows } = await query(
    `SELECT a.id,
            a.cliente_nome,
            a.cliente_telefone,
            a.servico_id,
            a.profissional_id,
            s.nome AS servico,
            s.duracao_minutos,
            COALESCE(p.nome, 'A definir') AS profissional,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS quando,
            to_char(a.fim_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS fim
     FROM salao.agendamentos a
     JOIN salao.servicos s ON s.id = a.servico_id
     LEFT JOIN salao.profissionais p ON p.id = a.profissional_id
     WHERE a.status IN ('confirmado', 'pendente')
       AND ${filtroData}
     ORDER BY a.inicio_em ASC
     LIMIT 40`,
  );
  return { titulo, itens: rows };
}

export function textoAgendaSalao(titulo, itens) {
  if (!itens.length) {
    return [`*${titulo}*`, '', 'Nenhum horário neste período.', '', 'Digite *0* para o menu do dono.'].join('\n');
  }
  const linhas = itens.map(
    (a, i) =>
      `*${i + 1}* · ${a.quando}–${a.fim}\n  ${a.servico} com ${a.profissional}\n  ${a.cliente_nome} (#${a.id})`,
  );
  return [
    `*${titulo}*`,
    '',
    ...linhas,
    '',
    'Para *manipular* um horário, digite o *número* da lista.',
    '0 - voltar ao menu do dono',
  ].join('\n');
}

export function textoAcoesHorario(item) {
  return [
    `*Horário #${item.id}*`,
    `${item.quando} · ${item.servico}`,
    `${item.cliente_nome}`,
    item.profissional ? `Com: ${item.profissional}` : '',
    '',
    'O que você quer fazer?',
    '1 - Avisar no WhatsApp *com horários para remarcar*',
    '2 - Cancelar, avisar *e* oferecer remarcação',
    '3 - Voltar à lista',
    '0 - Menu do dono',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function buscarAgendamento(id) {
  const { rows } = await query(
    `SELECT a.id,
            a.cliente_nome,
            a.cliente_telefone,
            a.servico_id,
            a.profissional_id,
            s.nome AS servico,
            s.duracao_minutos,
            COALESCE(p.nome, 'A definir') AS profissional,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
            to_char(a.fim_em AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS fim
     FROM salao.agendamentos a
     JOIN salao.servicos s ON s.id = a.servico_id
     LEFT JOIN salao.profissionais p ON p.id = a.profissional_id
     WHERE a.id = $1
     LIMIT 1`,
    [id],
  );
  return rows[0] || null;
}

export async function listarClientesComAgenda() {
  const { rows } = await query(
    `SELECT DISTINCT ON (RIGHT(regexp_replace(a.cliente_telefone, '\\D', '', 'g'), 8))
            a.id,
            a.cliente_nome,
            a.cliente_telefone,
            a.servico_id,
            a.profissional_id,
            s.nome AS servico,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS quando
     FROM salao.agendamentos a
     JOIN salao.servicos s ON s.id = a.servico_id
     WHERE a.status IN ('confirmado', 'pendente')
       AND a.inicio_em >= NOW()
     ORDER BY RIGHT(regexp_replace(a.cliente_telefone, '\\D', '', 'g'), 8), a.inicio_em ASC
     LIMIT 30`,
  );
  return rows;
}

export async function listarHorariosCancelaveis() {
  const { rows } = await query(
    `SELECT a.id,
            a.cliente_nome,
            a.cliente_telefone,
            a.servico_id,
            a.profissional_id,
            a.google_event_id,
            s.nome AS servico,
            s.duracao_minutos,
            COALESCE(p.nome, 'A definir') AS profissional,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS quando
     FROM salao.agendamentos a
     JOIN salao.servicos s ON s.id = a.servico_id
     LEFT JOIN salao.profissionais p ON p.id = a.profissional_id
     WHERE a.status IN ('confirmado', 'pendente')
       AND a.inicio_em >= NOW()
     ORDER BY a.inicio_em ASC
     LIMIT 30`,
  );
  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function avisarClientes({ destinatarios, texto, instance = 'salao2' }) {
  const msg = String(texto || '').trim();
  const lista = (destinatarios || []).filter((d) => d.telefone && msg);
  let ok = 0;
  const falhas = [];
  for (const dest of lista) {
    try {
      await sendWhatsAppText({
        instance,
        telefone: dest.telefone,
        texto: msg,
      });
      ok += 1;
      await sleep(700);
    } catch (err) {
      falhas.push({ telefone: dest.telefone, erro: err.message });
    }
  }
  return { ok, total: lista.length, falhas };
}

export async function cancelarHorarioEAvisar({ id, instance = 'salao2', textoAviso, enviarAviso = true }) {
  const r = await query(
    `UPDATE salao.agendamentos
     SET status = 'cancelado', atualizado_em = NOW()
     WHERE id = $1 AND status IN ('confirmado', 'pendente')
     RETURNING id, cliente_nome, cliente_telefone, google_event_id, servico_id, profissional_id,
       to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, erro: 'nao_encontrado' };
  await cancelarEventoGoogle(row.google_event_id);
  if (!enviarAviso) {
    return { ok: true, avisado: false, horario: row };
  }
  const aviso =
    textoAviso ||
    `Olá, ${row.cliente_nome}! Infelizmente precisamos cancelar seu horário de *${row.quando}* no Studio Erika Thebas. Qualquer dúvida, responda esta mensagem.`;
  try {
    await sendWhatsAppText({ instance, telefone: row.cliente_telefone, texto: aviso });
  } catch (err) {
    return { ok: true, avisado: false, horario: row, erro_envio: err.message };
  }
  return { ok: true, avisado: true, horario: row };
}

export function modeloAvisoCancelamento(motivo = '') {
  const extra = motivo ? `\n\nMotivo: ${motivo}` : '';
  return `Olá! Aqui é do *Studio Erika Thebas*.\n\nPrecisamos cancelar / remarcar o seu horário. Por favor, fale com a gente para combinarmos um novo dia.${extra}\n\nObrigada!`;
}
