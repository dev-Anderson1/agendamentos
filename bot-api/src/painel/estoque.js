import { query } from '../db.js';

export async function listarProdutos() {
  const { rows } = await query(
    `SELECT id, nome, sku, categoria, unidade, estoque_atual, estoque_minimo,
            custo_centavos, preco_venda_centavos, ativo,
            (estoque_atual <= estoque_minimo) AS baixo
     FROM salao.produtos
     WHERE ativo
     ORDER BY nome`,
  );
  return rows;
}

export async function criarProduto(dados) {
  const r = await query(
    `INSERT INTO salao.produtos (nome, sku, categoria, unidade, estoque_atual, estoque_minimo, custo_centavos, preco_venda_centavos)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      dados.nome,
      dados.sku || null,
      dados.categoria || null,
      dados.unidade || 'un',
      dados.estoque_atual ?? 0,
      dados.estoque_minimo ?? 0,
      dados.custo_centavos ?? 0,
      dados.preco_venda_centavos ?? null,
    ],
  );
  return r.rows[0];
}

export async function registrarMovimento({ produtoId, tipo, quantidade, custoUnitarioCentavos, observacoes, agendamentoId }) {
  const qtd = Number(quantidade);
  if (!qtd || qtd <= 0) return { ok: false, erro: 'quantidade_invalida' };

  const delta = ['entrada', 'ajuste'].includes(tipo) ? qtd : -qtd;
  if (tipo === 'ajuste') {
    await query(`UPDATE salao.produtos SET estoque_atual = $2, atualizado_em = NOW() WHERE id = $1`, [
      produtoId,
      qtd,
    ]);
  } else {
    await query(
      `UPDATE salao.produtos SET estoque_atual = estoque_atual + $2, atualizado_em = NOW() WHERE id = $1`,
      [produtoId, delta],
    );
  }

  const r = await query(
    `INSERT INTO salao.estoque_movimentos (produto_id, tipo, quantidade, custo_unitario_centavos, agendamento_id, observacoes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [produtoId, tipo, qtd, custoUnitarioCentavos ?? null, agendamentoId ?? null, observacoes ?? null],
  );
  const prod = await query(`SELECT * FROM salao.produtos WHERE id = $1`, [produtoId]);
  return { ok: true, movimento: r.rows[0], produto: prod.rows[0] };
}

export async function listarMovimentos(produtoId, limite = 30) {
  const { rows } = await query(
    `SELECT m.*, p.nome AS produto_nome
     FROM salao.estoque_movimentos m
     JOIN salao.produtos p ON p.id = m.produto_id
     WHERE ($1::int IS NULL OR m.produto_id = $1)
     ORDER BY m.criado_em DESC
     LIMIT $2`,
    [produtoId || null, limite],
  );
  return rows;
}
