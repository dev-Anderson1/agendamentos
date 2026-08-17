import { query } from './db.js';
import { isContinuacaoCurta, isPedidoCatalogo, isPedidoOperacional } from './intent-flags.js';

const TOP_K_DEFAULT = 5;
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://ollama:11434').replace(/\/$/, '');

/** Situações / perguntas que devem sempre passar pelo RAG. */
const RAG_HINTS = [
  /\?/,
  /\b(quanto|qual|quais|como|onde|quando|por que|porque|posso|precisa|preciso|tem|voces|vcs)\b/i,
  /\b(preco|preço|valor|custa|dura|duracao|duração|horario|horário|abre|fecha)\b/i,
  /\b(pagamento|pix|cartao|cartão|dinheiro|sinal|desconto|promocao|promoção)\b/i,
  /\b(endereco|endereço|estacionamento|chegar|fica)\b/i,
  /\b(remarcar|cancelar|atraso|antecedencia|antecedência|feriado|almoco|almoço)\b/i,
  /\b(alergia|contraindicacao|contraindicação|preparo|cuidado|depois|manutencao|manutenção)\b/i,
  /\b(garantia|reclamacao|reclamação|problema|fidelidade|parcelar|produto|foto)\b/i,
  /\b(crianca|criança|dor|quimica|química|cacheado|crespo)\b/i,
];

export function precisaRag(texto = '') {
  const t = String(texto || '').trim();
  if (!t || t.length < 3) return false;
  if (/^(oi|ola|olá|bom dia|boa tarde|boa noite|hey|eai|e aí)[\s!.]*$/i.test(t)) return false;
  if (/^(menu|0|[1-5])$/i.test(t)) return false;
  if (isPedidoOperacional(t) || isPedidoCatalogo(t) || isContinuacaoCurta(t)) return false;
  return RAG_HINTS.some((re) => re.test(t));
}

function tokenize(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function cosine(a = [], b = []) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedText(texto) {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: texto }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const emb = data.embedding;
    return Array.isArray(emb) && emb.length ? emb : null;
  } catch {
    return null;
  }
}

/**
 * Busca lexical (full-text + overlap de tokens) + opcional embedding.
 * @returns {Promise<Array<{id, topico, titulo, conteudo, score, fonte}>>}
 */
export async function buscarConhecimento(pergunta, { topK = TOP_K_DEFAULT } = {}) {
  const q = String(pergunta || '').trim();
  if (!q) return [];

  const tokens = tokenize(q);
  let rows = [];
  try {
    const tsQuery = tokens.map((t) => `${t}:*`).join(' | ') || q;
    const r = await query(
      `SELECT id, topico, titulo, conteudo, tags, servico_ref, embedding,
              ts_rank(busca, to_tsquery('portuguese', $1)) AS rank_ft
       FROM salao.conhecimento
       WHERE ativo = TRUE
         AND (busca @@ to_tsquery('portuguese', $1)
              OR titulo ILIKE $2
              OR conteudo ILIKE $2
              OR topico ILIKE $2)
       ORDER BY rank_ft DESC, id
       LIMIT 40`,
      [tsQuery, `%${tokens[0] || q}%`],
    );
    rows = r.rows;
  } catch {
    const r = await query(
      `SELECT id, topico, titulo, conteudo, tags, servico_ref, embedding,
              ts_rank(busca, plainto_tsquery('portuguese', $1)) AS rank_ft
       FROM salao.conhecimento
       WHERE ativo = TRUE
       ORDER BY rank_ft DESC, id
       LIMIT 40`,
      [q],
    );
    rows = r.rows;
  }

  // Se FTS veio fraco, amplia com amostra geral para scoring lexical
  if (rows.length < 8) {
    const extra = await query(
      `SELECT id, topico, titulo, conteudo, tags, servico_ref, embedding, 0::float AS rank_ft
       FROM salao.conhecimento WHERE ativo = TRUE ORDER BY id LIMIT 40`,
    );
    const seen = new Set(rows.map((x) => x.id));
    for (const row of extra.rows) {
      if (!seen.has(row.id)) rows.push(row);
    }
  }

  const queryEmb = await embedText(q);

  const scored = rows.map((r) => {
    const blob = `${r.titulo} ${r.conteudo} ${(r.tags || []).join(' ')} ${r.topico} ${r.servico_ref || ''}`;
    const docTokens = tokenize(blob);
    const docSet = new Set(docTokens);
    let overlapHits = 0;
    for (const t of tokens) {
      if (docSet.has(t) || docTokens.some((d) => d.startsWith(t) || t.startsWith(d))) {
        overlapHits += 1;
      }
    }
    const overlap = tokens.length ? overlapHits / tokens.length : 0;
    const emb = Array.isArray(r.embedding) ? r.embedding : null;
    const embScore = queryEmb && emb ? cosine(queryEmb, emb) : 0;
    const ft = Number(r.rank_ft) || 0;
    const score = ft * 2 + overlap * 1.5 + embScore * 3;
    return {
      id: r.id,
      topico: r.topico,
      titulo: r.titulo,
      conteudo: r.conteudo,
      servico_ref: r.servico_ref,
      score,
      fonte: embScore > 0.2 ? 'hibrido' : ft > 0 || overlap > 0 ? 'lexical' : 'baixo',
    };
  });

  return scored
    .filter((x) => x.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function formatarContextoRag(hits = []) {
  if (!hits.length) {
    return 'Nenhum trecho relevante encontrado na base de conhecimento.';
  }
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] (${h.topico}${h.servico_ref ? ` / ${h.servico_ref}` : ''}) ${h.titulo}\n${h.conteudo}`,
    )
    .join('\n\n');
}

/** Indexa embeddings faltantes (best-effort; não quebra se Ollama estiver sem o modelo). */
export async function indexarEmbeddingsPendentes({ limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT id, titulo, conteudo, topico
     FROM salao.conhecimento
     WHERE ativo AND embedding IS NULL
     ORDER BY id
     LIMIT $1`,
    [limit],
  );
  let ok = 0;
  for (const row of rows) {
    const emb = await embedText(`${row.titulo}. ${row.conteudo}`);
    if (!emb) break;
    await query(`UPDATE salao.conhecimento SET embedding = $2::jsonb, atualizado_em = NOW() WHERE id = $1`, [
      row.id,
      JSON.stringify(emb),
    ]);
    ok += 1;
  }
  return { pendentes: rows.length, indexados: ok, modelo: EMBED_MODEL };
}

export async function ensureRagReady() {
  try {
    await query(`SELECT 1 FROM salao.conhecimento LIMIT 1`);
  } catch (err) {
    console.warn('[rag] tabela conhecimento indisponível:', err.message);
    return { ok: false };
  }
  // indexação em background — não bloqueia o boot
  indexarEmbeddingsPendentes().then((r) => {
    if (r.indexados) console.log(`[rag] embeddings indexados: ${r.indexados}/${r.pendentes}`);
  }).catch((e) => console.warn('[rag] indexação:', e.message));
  return { ok: true };
}
