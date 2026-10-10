import { query } from '../db.js';
import { marcarPagamentoPago } from '../pagamentos.js';

const METODO_LABEL = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export function labelMetodo(metodo) {
  const key = String(metodo || 'outro').toLowerCase();
  return METODO_LABEL[key] || metodo || 'Não informado';
}

export async function listarPagamentos({ status = null, metodo = null, limite = 50 } = {}) {
  let sql = `
    SELECT p.id, p.agendamento_id, p.valor_centavos, p.valor_previsto_centavos,
           p.status, p.metodo, p.pago_em, p.observacoes,
           a.cliente_nome, s.nome AS servico,
           to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
           to_char(p.pago_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS pago_em_br
    FROM salao.pagamentos p
    LEFT JOIN salao.agendamentos a ON a.id = p.agendamento_id
    LEFT JOIN salao.servicos s ON s.id = a.servico_id
    WHERE 1=1`;
  const params = [];
  if (status) {
    params.push(status);
    sql += ` AND p.status = $${params.length}`;
  }
  if (metodo) {
    params.push(metodo);
    sql += ` AND lower(COALESCE(p.metodo, 'outro')) = lower($${params.length})`;
  }
  params.push(limite);
  sql += ` ORDER BY COALESCE(p.pago_em, p.criado_em) DESC LIMIT $${params.length}`;
  const { rows } = await query(sql, params);
  return rows.map((r) => ({
    ...r,
    metodo_label: labelMetodo(r.metodo),
  }));
}

export async function registrarPagamento({ pagamentoId, valorCentavos, metodo, observacoes }) {
  const p = await query(`SELECT * FROM salao.pagamentos WHERE id = $1`, [pagamentoId]);
  const row = p.rows[0];
  if (!row) return { ok: false, erro: 'nao_encontrado' };
  const valor = valorCentavos ?? row.valor_previsto_centavos;
  const atualizado = await marcarPagamentoPago({
    pagamentoId,
    valorCentavos: valor,
    metodo: metodo || 'pix',
    observacoes,
  });
  return { ok: true, pagamento: atualizado };
}

/**
 * Histórico / resumo de pagamentos pagos por forma (PIX, dinheiro, cartão…).
 * mes opcional: 'YYYY-MM'
 */
export async function historicoPorMetodo({ mes = null } = {}) {
  const mesRef = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null;

  const { rows } = await query(
    `SELECT lower(COALESCE(NULLIF(trim(p.metodo), ''), 'outro')) AS metodo,
            COUNT(*)::int AS quantidade,
            COALESCE(SUM(p.valor_centavos), 0)::bigint AS total_centavos
     FROM salao.pagamentos p
     WHERE p.status = 'pago'
       AND (
         $1::text IS NULL
         OR to_char(p.pago_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $1
       )
     GROUP BY 1
     ORDER BY total_centavos DESC, quantidade DESC`,
    [mesRef],
  );

  const por_metodo = rows.map((r) => ({
    metodo: r.metodo,
    metodo_label: labelMetodo(r.metodo),
    quantidade: r.quantidade,
    total_reais: Number(r.total_centavos || 0) / 100,
  }));

  const total_qtd = por_metodo.reduce((s, x) => s + x.quantidade, 0);
  const total_reais = por_metodo.reduce((s, x) => s + x.total_reais, 0);

  const { rows: hist } = await query(
    `SELECT p.id, p.valor_centavos, p.metodo, p.observacoes,
            a.cliente_nome, s.nome AS servico,
            to_char(p.pago_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS pago_em_br,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando
     FROM salao.pagamentos p
     LEFT JOIN salao.agendamentos a ON a.id = p.agendamento_id
     LEFT JOIN salao.servicos s ON s.id = a.servico_id
     WHERE p.status = 'pago'
       AND (
         $1::text IS NULL
         OR to_char(p.pago_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $1
       )
     ORDER BY p.pago_em DESC NULLS LAST
     LIMIT 100`,
    [mesRef],
  );

  return {
    mes: mesRef,
    resumo: {
      total_pagamentos: total_qtd,
      total_reais,
    },
    por_metodo,
    historico: hist.map((r) => ({
      ...r,
      valor_reais: Number(r.valor_centavos || 0) / 100,
      metodo_label: labelMetodo(r.metodo),
    })),
  };
}
