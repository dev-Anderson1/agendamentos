import { query } from './db.js';

export async function ensurePagamentosSchema() {
  try {
    await query(`SELECT 1 FROM salao.pagamentos LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}

export async function criarPagamentoPendente(agendamentoId, servicoId) {
  const r = await query(
    `SELECT preco_centavos FROM salao.servicos WHERE id = $1`,
    [servicoId],
  );
  const previsto = Number(r.rows[0]?.preco_centavos || 0);
  const exists = await query(
    `SELECT 1 FROM salao.pagamentos WHERE agendamento_id = $1 LIMIT 1`,
    [agendamentoId],
  );
  if (exists.rows.length) return;
  await query(
    `INSERT INTO salao.pagamentos (agendamento_id, valor_centavos, valor_previsto_centavos, status)
     VALUES ($1, 0, $2, 'pendente')`,
    [agendamentoId, previsto],
  );
}

export async function cancelarPagamentoAgendamento(agendamentoId) {
  await query(
    `UPDATE salao.pagamentos
     SET status = 'cancelado', atualizado_em = NOW()
     WHERE agendamento_id = $1 AND status IN ('pendente', 'parcial')`,
    [agendamentoId],
  );
}

export async function marcarPagamentoPago({
  pagamentoId,
  valorCentavos,
  metodo = 'pix',
  observacoes = null,
}) {
  const r = await query(
    `UPDATE salao.pagamentos
     SET status = 'pago',
         valor_centavos = $2,
         metodo = $3,
         pago_em = NOW(),
         observacoes = COALESCE($4, observacoes),
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING *`,
    [pagamentoId, valorCentavos, metodo, observacoes],
  );
  return r.rows[0] || null;
}
