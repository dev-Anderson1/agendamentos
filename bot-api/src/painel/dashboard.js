import { query } from '../db.js';

function centsToReais(c) {
  return Number(c || 0) / 100;
}

export async function resumoDashboard() {
  const hoje = await query(
    `SELECT
       COUNT(*) FILTER (WHERE a.status IN ('confirmado','pendente'))::int AS agendamentos_hoje,
       COALESCE(SUM(p.valor_previsto_centavos) FILTER (
         WHERE a.status IN ('confirmado','pendente') AND p.status = 'pendente'
       ), 0)::bigint AS previsto_hoje_centavos,
       COALESCE(SUM(p.valor_centavos) FILTER (
         WHERE p.status = 'pago' AND (p.pago_em AT TIME ZONE 'America/Sao_Paulo')::date =
           (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
       ), 0)::bigint AS recebido_hoje_centavos
     FROM salao.agendamentos a
     LEFT JOIN salao.pagamentos p ON p.agendamento_id = a.id
     WHERE (a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date =
           (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
  );

  const mes = await query(
    `SELECT
       COALESCE(SUM(p.valor_centavos) FILTER (WHERE p.status = 'pago'
         AND date_trunc('month', p.pago_em AT TIME ZONE 'America/Sao_Paulo') =
             date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')), 0)::bigint AS recebido_mes,
       COALESCE(SUM(p.valor_previsto_centavos) FILTER (WHERE p.status = 'pendente'
         AND a.inicio_em >= NOW() AND a.status IN ('confirmado','pendente')), 0)::bigint AS previsto_futuro,
       COUNT(*) FILTER (WHERE a.status IN ('confirmado','pendente') AND a.inicio_em >= NOW())::int AS futuros
     FROM salao.agendamentos a
     LEFT JOIN salao.pagamentos p ON p.agendamento_id = a.id`,
  );

  const estoqueBaixo = await query(
    `SELECT COUNT(*)::int AS n FROM salao.produtos
     WHERE ativo AND estoque_atual <= estoque_minimo`,
  );

  const rowH = hoje.rows[0] || {};
  const rowM = mes.rows[0] || {};

  return {
    hoje: {
      agendamentos: rowH.agendamentos_hoje || 0,
      previsto_reais: centsToReais(rowH.previsto_hoje_centavos),
      recebido_reais: centsToReais(rowH.recebido_hoje_centavos),
    },
    mes: {
      recebido_reais: centsToReais(rowM.recebido_mes),
      previsto_futuro_reais: centsToReais(rowM.previsto_futuro),
      agendamentos_futuros: rowM.futuros || 0,
    },
    estoque: {
      produtos_baixo: estoqueBaixo.rows[0]?.n || 0,
    },
  };
}

export async function relatorioPorServico({ dias = 90 } = {}) {
  const { rows } = await query(
    `SELECT s.id, s.nome, s.categoria,
            COUNT(a.id)::int AS total_agendamentos,
            COUNT(a.id) FILTER (WHERE a.status IN ('confirmado','pendente','concluido'))::int AS ativos,
            COALESCE(SUM(p.valor_centavos) FILTER (WHERE p.status = 'pago'), 0)::bigint AS recebido_centavos,
            COALESCE(SUM(p.valor_previsto_centavos) FILTER (WHERE p.status = 'pendente'), 0)::bigint AS previsto_centavos
     FROM salao.servicos s
     LEFT JOIN salao.agendamentos a ON a.servico_id = s.id
       AND a.inicio_em >= NOW() - ($1::int || ' days')::interval
     LEFT JOIN salao.pagamentos p ON p.agendamento_id = a.id
     WHERE s.ativo
     GROUP BY s.id, s.nome, s.categoria
     ORDER BY recebido_centavos DESC, total_agendamentos DESC`,
    [dias],
  );
  return rows.map((r) => ({
    ...r,
    recebido_reais: centsToReais(r.recebido_centavos),
    previsto_reais: centsToReais(r.previsto_centavos),
  }));
}

export async function previsaoEntradas({ dias = 30, profissionalId = null } = {}) {
  const params = [dias];
  let filtroProf = '';
  if (profissionalId) {
    params.push(Number(profissionalId));
    filtroProf = ` AND a.profissional_id = $${params.length}`;
  }
  const { rows } = await query(
    `SELECT (a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
            COUNT(*)::int AS agendamentos,
            COALESCE(SUM(p.valor_previsto_centavos), 0)::bigint AS previsto_centavos
     FROM salao.agendamentos a
     LEFT JOIN salao.pagamentos p ON p.agendamento_id = a.id AND p.status = 'pendente'
     WHERE a.status IN ('confirmado', 'pendente')
       AND a.inicio_em >= NOW()
       AND a.inicio_em < NOW() + ($1::int || ' days')::interval
       ${filtroProf}
     GROUP BY dia
     ORDER BY dia ASC`,
    params,
  );
  const total = rows.reduce((s, r) => s + Number(r.previsto_centavos || 0), 0);
  return {
    dias: rows.map((r) => ({
      dia: r.dia,
      agendamentos: r.agendamentos,
      previsto_reais: centsToReais(r.previsto_centavos),
    })),
    total_previsto_reais: centsToReais(total),
  };
}

export async function historicoMensal({ meses = 6 } = {}) {
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', p.pago_em AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM') AS mes,
            COALESCE(SUM(p.valor_centavos), 0)::bigint AS recebido_centavos,
            COUNT(*)::int AS pagamentos
     FROM salao.pagamentos p
     WHERE p.status = 'pago' AND p.pago_em IS NOT NULL
       AND p.pago_em >= date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo') - ($1::int - 1) * interval '1 month'
     GROUP BY 1
     ORDER BY 1 ASC`,
    [meses],
  );
  return rows.map((r) => ({
    mes: r.mes,
    recebido_reais: centsToReais(r.recebido_centavos),
    pagamentos: r.pagamentos,
  }));
}

/**
 * Relatório diário de um mês: atendimento e receita por dia.
 * mes: 'YYYY-MM' (padrão = mês atual em America/Sao_Paulo)
 */
export async function relatorioDiarioMes({ mes = null } = {}) {
  const mesRef = mes && /^\d{4}-\d{2}$/.test(mes)
    ? mes
    : null;

  const { rows } = await query(
    `WITH params AS (
       SELECT CASE
         WHEN $1::text IS NOT NULL THEN ($1 || '-01')::date
         ELSE date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')::date
       END AS inicio
     ),
     dias AS (
       SELECT generate_series(
         (SELECT inicio FROM params),
         (SELECT (inicio + interval '1 month - 1 day')::date FROM params),
         interval '1 day'
       )::date AS dia
     ),
     por_dia AS (
       SELECT
         (a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
         COUNT(*) FILTER (WHERE a.status IN ('confirmado', 'pendente', 'concluido'))::int AS atendimentos,
         COUNT(*) FILTER (WHERE a.status = 'cancelado')::int AS cancelados,
         COALESCE(SUM(COALESCE(p.valor_previsto_centavos, s.preco_centavos))
           FILTER (WHERE a.status IN ('confirmado', 'pendente', 'concluido')), 0)::bigint AS previsto_centavos,
         COALESCE(SUM(p.valor_centavos)
           FILTER (WHERE p.status = 'pago' AND a.status IN ('confirmado', 'pendente', 'concluido')), 0)::bigint AS recebido_centavos
       FROM salao.agendamentos a
       JOIN salao.servicos s ON s.id = a.servico_id
       LEFT JOIN salao.pagamentos p ON p.agendamento_id = a.id
       WHERE (a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date >= (SELECT inicio FROM params)
         AND (a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date < (SELECT inicio FROM params) + interval '1 month'
       GROUP BY 1
     )
     SELECT
       d.dia,
       to_char(d.dia, 'DD/MM') AS label,
       EXTRACT(DOW FROM d.dia)::int AS dow,
       COALESCE(p.atendimentos, 0)::int AS atendimentos,
       COALESCE(p.cancelados, 0)::int AS cancelados,
       COALESCE(p.previsto_centavos, 0)::bigint AS previsto_centavos,
       COALESCE(p.recebido_centavos, 0)::bigint AS recebido_centavos
     FROM dias d
     LEFT JOIN por_dia p ON p.dia = d.dia
     ORDER BY d.dia ASC`,
    [mesRef],
  );

  const dias = rows.map((r) => {
    const previsto = centsToReais(r.previsto_centavos);
    const recebido = centsToReais(r.recebido_centavos);
    return {
      dia: r.dia,
      label: r.label,
      dow: Number(r.dow),
      atendimentos: r.atendimentos,
      cancelados: r.cancelados,
      previsto_reais: previsto,
      recebido_reais: recebido,
      // “lucro” operacional do dia = o que já entrou dos atendimentos do dia
      lucro_reais: recebido,
    };
  });

  const comMovimento = dias.filter((d) => d.atendimentos > 0 || d.recebido_reais > 0);
  const porAtend = [...comMovimento].sort((a, b) => b.atendimentos - a.atendimentos);
  const porLucro = [...comMovimento].sort((a, b) => b.lucro_reais - a.lucro_reais || b.previsto_reais - a.previsto_reais);

  const totalAtend = dias.reduce((s, d) => s + d.atendimentos, 0);
  const totalPrevisto = dias.reduce((s, d) => s + d.previsto_reais, 0);
  const totalRecebido = dias.reduce((s, d) => s + d.recebido_reais, 0);

  let mesOut = mesRef;
  if (!mesOut && dias[0]) {
    const raw = dias[0].dia;
    if (raw instanceof Date) {
      mesOut = `${raw.getUTCFullYear()}-${String(raw.getUTCMonth() + 1).padStart(2, '0')}`;
    } else {
      mesOut = String(raw).slice(0, 7);
    }
  }

  return {
    mes: mesOut || '',
    resumo: {
      atendimentos: totalAtend,
      previsto_reais: totalPrevisto,
      recebido_reais: totalRecebido,
      dias_com_movimento: comMovimento.length,
      media_atendimentos: comMovimento.length
        ? Math.round((totalAtend / comMovimento.length) * 10) / 10
        : 0,
      media_recebido_reais: comMovimento.length
        ? Math.round((totalRecebido / comMovimento.length) * 100) / 100
        : 0,
    },
    destaques: {
      maior_atendimento: porAtend[0] || null,
      menor_atendimento: porAtend.length ? porAtend[porAtend.length - 1] : null,
      maior_lucro: porLucro[0] || null,
      menor_lucro: porLucro.length ? porLucro[porLucro.length - 1] : null,
    },
    ranking_atendimento: porAtend.slice(0, 5),
    ranking_lucro: porLucro.slice(0, 5),
    dias,
  };
}
