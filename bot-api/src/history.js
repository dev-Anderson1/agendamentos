import { query } from './db.js';

export async function registrarMensagem({
  telefone,
  papel,
  conteudo,
  metadados = {},
}) {
  const texto = String(conteudo || '').trim();
  if (!telefone || !texto) return;

  await query(
    `INSERT INTO salao.mensagens_conversa
       (telefone, papel, conteudo, metadados)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [telefone, papel, texto, JSON.stringify(metadados)],
  );
}

export async function listarHistorico(telefone, limite = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limite) || 20, 50));
  const { rows } = await query(
    `SELECT papel, conteudo, metadados, criado_em
     FROM salao.mensagens_conversa
     WHERE telefone = $1
     ORDER BY criado_em DESC, id DESC
     LIMIT $2`,
    [telefone, safeLimit],
  );
  return rows.reverse();
}

export async function ultimaRespostaComContexto(telefone) {
  const { rows } = await query(
    `SELECT conteudo, metadados
     FROM salao.mensagens_conversa
     WHERE telefone = $1
       AND papel = 'assistant'
     ORDER BY criado_em DESC, id DESC
     LIMIT 1`,
    [telefone],
  );
  return rows[0] || null;
}
