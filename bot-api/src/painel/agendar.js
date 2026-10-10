import { query } from '../db.js';
import { listarHorariosLivres } from '../slots.js';
import { sincronizarNovoAgendamento } from '../google-calendar.js';
import { avisarDonoNovoAgendamento } from '../admin.js';
import { criarPagamentoPendente } from '../pagamentos.js';

export async function listarServicosAtivos() {
  const { rows } = await query(
    `SELECT id, nome, categoria, duracao_minutos, preco_centavos, preco_apartir
     FROM salao.servicos WHERE ativo ORDER BY categoria, nome`,
  );
  return rows;
}

export async function listarProfissionaisDoServico(servicoId) {
  const { rows } = await query(
    `SELECT p.id, p.nome
     FROM salao.profissionais p
     JOIN salao.profissional_servicos ps ON ps.profissional_id = p.id
     WHERE p.ativo AND ps.servico_id = $1
     ORDER BY p.nome`,
    [servicoId],
  );
  return rows;
}

export async function listarSlotsPainel({ dataIso, servicoId, profissionalId = null }) {
  const s = await query(
    `SELECT id, duracao_minutos, nome FROM salao.servicos WHERE id = $1 AND ativo`,
    [servicoId],
  );
  const servico = s.rows[0];
  if (!servico) return { erro: 'servico_nao_encontrado' };

  const slots = await listarHorariosLivres({
    dataIso,
    servicoId,
    duracaoMinutos: servico.duracao_minutos,
    profissionalId: profissionalId || null,
    limite: 40,
  });

  return {
    servico: servico.nome,
    duracao_minutos: servico.duracao_minutos,
    data: dataIso,
    slots,
  };
}

export async function criarAgendamentoPainel({
  clienteNome,
  clienteTelefone,
  servicoId,
  profissionalId,
  dataIso,
  hora,
  avisarCliente = false,
  instance = 'salao2',
}) {
  const nome = String(clienteNome || '').trim();
  const tel = String(clienteTelefone || '').replace(/\D/g, '');
  if (!nome || nome.length < 2) return { ok: false, erro: 'informe_nome' };
  if (!tel || tel.length < 10) return { ok: false, erro: 'informe_telefone' };
  if (!servicoId || !dataIso || !hora) return { ok: false, erro: 'dados_incompletos' };

  const s = await query(
    `SELECT id, nome, duracao_minutos, preco_centavos FROM salao.servicos WHERE id = $1 AND ativo`,
    [servicoId],
  );
  const servico = s.rows[0];
  if (!servico) return { ok: false, erro: 'servico_nao_encontrado' };

  const slots = await listarHorariosLivres({
    dataIso,
    servicoId: servico.id,
    duracaoMinutos: servico.duracao_minutos,
    profissionalId: profissionalId || null,
    limite: 40,
  });

  const slot = slots.find((x) => {
    if (x.hora !== hora) return false;
    if (profissionalId && x.profissionalId !== Number(profissionalId)) return false;
    return true;
  });
  if (!slot) return { ok: false, erro: 'horario_indisponivel', slots: slots.slice(0, 8) };

  const r = await query(
    `INSERT INTO salao.agendamentos (
       cliente_nome, cliente_telefone, servico_id, profissional_id,
       inicio_em, fim_em, status, origem
     ) VALUES (
       $1, $2, $3, $4,
       ($5::date + $6::time) AT TIME ZONE 'America/Sao_Paulo',
       (($5::date + $6::time) AT TIME ZONE 'America/Sao_Paulo')
         + make_interval(mins => $7::int),
       'confirmado', 'painel'
     )
     RETURNING id,
       to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
       to_char(inicio_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS inicio_local,
       to_char(fim_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') AS fim_local`,
    [nome, tel, servico.id, slot.profissionalId, dataIso, slot.hora, servico.duracao_minutos],
  );

  const row = r.rows[0];
  await sincronizarNovoAgendamento({
    id: row.id,
    cliente: nome,
    telefone: tel,
    servico: servico.nome,
    profissional: slot.profissionalNome,
    inicioLocal: row.inicio_local,
    fimLocal: row.fim_local,
  });
  await criarPagamentoPendente(row.id, servico.id);
  await avisarDonoNovoAgendamento({
    id: row.id,
    cliente: nome,
    telefoneCliente: tel,
    servico: servico.nome,
    profissional: slot.profissionalNome,
    quando: row.quando,
    instance,
  });

  let avisoCliente = null;
  if (avisarCliente) {
    try {
      const { sendWhatsAppText } = await import('../evolution.js');
      const texto = [
        `Olá, ${nome}! Seu horário no *Studio Erika Thebas* está confirmado.`,
        '',
        `Código: #${row.id}`,
        `Quando: *${row.quando}*`,
        `Serviço: ${servico.nome}`,
        `Com: ${slot.profissionalNome}`,
        '',
        'Qualquer dúvida, responda esta mensagem.',
      ].join('\n');
      await sendWhatsAppText({ instance, telefone: tel, texto });
      avisoCliente = { ok: true };
    } catch (err) {
      avisoCliente = { ok: false, erro: err.message };
    }
  }

  return {
    ok: true,
    id: row.id,
    quando: row.quando,
    cliente: nome,
    telefone: tel,
    servico: servico.nome,
    profissional: slot.profissionalNome,
    aviso_cliente: avisoCliente,
  };
}
