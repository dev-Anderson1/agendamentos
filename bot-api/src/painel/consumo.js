import { query } from '../db.js';

/** Preços de referência (USD) — gpt-4o-mini e Meta WhatsApp BR (estimativa). */
export const PRECOS = {
  openai: {
    modelo: 'gpt-4o-mini',
    input_usd_por_1m: Number(process.env.AI_PRICE_INPUT_USD_PER_1M || 0.15),
    output_usd_por_1m: Number(process.env.AI_PRICE_OUTPUT_USD_PER_1M || 0.6),
  },
  meta: {
    // conversa utility BR — valor aproximado para projeção
    conversa_usd: Number(process.env.META_PRICE_CONVERSA_USD || 0.03),
    mensagem_usd: Number(process.env.META_PRICE_MSG_USD || 0.005),
  },
  usd_brl: Number(process.env.USD_BRL || 5.5),
};

function usdToCentavosBrl(usd) {
  return Math.round(Number(usd || 0) * PRECOS.usd_brl * 100);
}

export async function registrarUsoOpenai({
  promptTokens = 0,
  completionTokens = 0,
  modelo = PRECOS.openai.modelo,
  metadados = {},
  usuarioId = null,
} = {}) {
  const prompt = Number(promptTokens) || 0;
  const completion = Number(completionTokens) || 0;
  if (prompt <= 0 && completion <= 0) return;

  const custoUsd =
    (prompt / 1_000_000) * PRECOS.openai.input_usd_por_1m +
    (completion / 1_000_000) * PRECOS.openai.output_usd_por_1m;
  const custoCentavos = usdToCentavosBrl(custoUsd);

  if (prompt > 0) {
    await query(
      `INSERT INTO salao.uso_plataforma
         (provedor, metrica, quantidade, custo_centavos, modelo, usuario_id, metadados)
       VALUES ('openai', 'prompt_tokens', $1, $2, $3, $4, $5::jsonb)`,
      [
        prompt,
        Math.round(custoCentavos * (prompt / (prompt + completion || 1))),
        modelo,
        usuarioId,
        JSON.stringify(metadados),
      ],
    );
  }
  if (completion > 0) {
    await query(
      `INSERT INTO salao.uso_plataforma
         (provedor, metrica, quantidade, custo_centavos, modelo, usuario_id, metadados)
       VALUES ('openai', 'completion_tokens', $1, $2, $3, $4, $5::jsonb)`,
      [
        completion,
        Math.round(custoCentavos * (completion / (prompt + completion || 1))),
        modelo,
        usuarioId,
        JSON.stringify(metadados),
      ],
    );
  }

  await query(
    `INSERT INTO salao.uso_plataforma
       (provedor, metrica, quantidade, custo_centavos, modelo, usuario_id, metadados)
     VALUES ('openai', 'requests', 1, $1, $2, $3, $4::jsonb)`,
    [custoCentavos, modelo, usuarioId, JSON.stringify({ ...metadados, prompt, completion })],
  );
}

export async function registrarUsoMeta({
  mensagens = 1,
  conversas = 0,
  metadados = {},
  usuarioId = null,
} = {}) {
  const msgs = Number(mensagens) || 0;
  const convs = Number(conversas) || 0;

  if (msgs > 0) {
    const custo = usdToCentavosBrl(msgs * PRECOS.meta.mensagem_usd);
    await query(
      `INSERT INTO salao.uso_plataforma
         (provedor, metrica, quantidade, custo_centavos, modelo, usuario_id, metadados)
       VALUES ('meta', 'mensagens', $1, $2, 'whatsapp', $3, $4::jsonb)`,
      [msgs, custo, usuarioId, JSON.stringify(metadados)],
    );
  }
  if (convs > 0) {
    const custo = usdToCentavosBrl(convs * PRECOS.meta.conversa_usd);
    await query(
      `INSERT INTO salao.uso_plataforma
         (provedor, metrica, quantidade, custo_centavos, modelo, usuario_id, metadados)
       VALUES ('meta', 'conversas', $1, $2, 'whatsapp', $3, $4::jsonb)`,
      [convs, custo, usuarioId, JSON.stringify(metadados)],
    );
  }
}

export async function resumoConsumo({ dias = 30 } = {}) {
  const { rows } = await query(
    `SELECT provedor, metrica,
            SUM(quantidade)::float AS quantidade,
            SUM(custo_centavos)::bigint AS custo_centavos
     FROM salao.uso_plataforma
     WHERE periodo >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int || ' days')::interval
     GROUP BY provedor, metrica
     ORDER BY provedor, metrica`,
    [dias],
  );

  const { rows: diario } = await query(
    `SELECT periodo::text AS dia, provedor,
            SUM(quantidade)::float AS quantidade,
            SUM(custo_centavos)::bigint AS custo_centavos
     FROM salao.uso_plataforma
     WHERE periodo >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - ($1::int || ' days')::interval
     GROUP BY periodo, provedor
     ORDER BY periodo ASC`,
    [dias],
  );

  const porProvedor = {};
  for (const r of rows) {
    if (!porProvedor[r.provedor]) {
      porProvedor[r.provedor] = { custo_centavos: 0, custo_reais: 0, metricas: {} };
    }
    porProvedor[r.provedor].metricas[r.metrica] = {
      quantidade: Number(r.quantidade || 0),
      custo_centavos: Number(r.custo_centavos || 0),
      custo_reais: Number(r.custo_centavos || 0) / 100,
    };
    porProvedor[r.provedor].custo_centavos += Number(r.custo_centavos || 0);
  }
  for (const k of Object.keys(porProvedor)) {
    porProvedor[k].custo_reais = porProvedor[k].custo_centavos / 100;
  }

  const totalCentavos = Object.values(porProvedor).reduce((s, p) => s + p.custo_centavos, 0);

  // projeção mensal simples (média diária * 30)
  const diasEfetivos = Math.max(1, Number(dias) || 30);
  const projecaoMesCentavos = Math.round((totalCentavos / diasEfetivos) * 30);

  return {
    dias,
    precos_referencia: {
      openai: {
        modelo: PRECOS.openai.modelo,
        input_usd_por_1m: PRECOS.openai.input_usd_por_1m,
        output_usd_por_1m: PRECOS.openai.output_usd_por_1m,
        nota: 'Preço de referência gpt-4o-mini (OpenAI). Ajuste via AI_PRICE_* no .env.',
      },
      meta: {
        conversa_usd: PRECOS.meta.conversa_usd,
        mensagem_usd: PRECOS.meta.mensagem_usd,
        nota: 'Estimativa WhatsApp Cloud API (BR). Ajuste via META_PRICE_* e USD_BRL.',
      },
      usd_brl: PRECOS.usd_brl,
    },
    total: {
      custo_centavos: totalCentavos,
      custo_reais: totalCentavos / 100,
      projecao_mes_reais: projecaoMesCentavos / 100,
    },
    por_provedor: porProvedor,
    diario: diario.map((d) => ({
      dia: d.dia,
      provedor: d.provedor,
      quantidade: Number(d.quantidade || 0),
      custo_reais: Number(d.custo_centavos || 0) / 100,
    })),
  };
}

/** Sincroniza contagem aproximada de mensagens WhatsApp do banco → Meta (idempotente por dia). */
export async function sincronizarMetaDoHistorico() {
  try {
    const { rows } = await query(
      `SELECT (criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
              COUNT(*)::int AS n
       FROM salao.mensagens_conversa
       WHERE criado_em >= NOW() - INTERVAL '2 days'
       GROUP BY 1`,
    );
    for (const r of rows) {
      const { rows: existe } = await query(
        `SELECT 1 FROM salao.uso_plataforma
         WHERE provedor = 'meta' AND metrica = 'mensagens_sync'
           AND periodo = $1::date
         LIMIT 1`,
        [r.dia],
      );
      if (existe.length) continue;
      const custo = usdToCentavosBrl(Number(r.n) * PRECOS.meta.mensagem_usd);
      await query(
        `INSERT INTO salao.uso_plataforma
           (provedor, metrica, quantidade, custo_centavos, modelo, periodo, metadados)
         VALUES ('meta', 'mensagens_sync', $1, $2, 'whatsapp', $3::date,
                 '{"fonte":"mensagens_conversa"}'::jsonb)`,
        [r.n, custo, r.dia],
      );
    }
  } catch (err) {
    // tabela pode não existir em ambientes antigos
    console.warn('[consumo] sync meta:', err.message);
  }
}
