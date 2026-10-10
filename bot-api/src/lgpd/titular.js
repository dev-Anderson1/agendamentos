import crypto from 'crypto';
import { query } from '../db.js';

export function privacyPolicyUrl() {
  return (
    process.env.PRIVACY_POLICY_URL ||
    process.env.PAINEL_PUBLIC_URL?.replace(/\/painel\/?$/, '') ||
    'http://localhost:3001'
  ).replace(/\/$/, '') + '/privacidade';
}

export function studioNome() {
  return process.env.STUDIO_NOME || 'Studio Erika Thebas';
}

export function mensagemAvisoPrivacidade() {
  const url = privacyPolicyUrl();
  return [
    `*Privacidade — ${studioNome()}*`,
    '',
    'Usamos seu *nome* e *WhatsApp* só para:',
    '• agendar / remarcar / cancelar horários',
    '• enviar avisos sobre seu atendimento',
    '',
    'Não vendemos seus dados. Você pode pedir *acesso* ou *exclusão* falando com o studio.',
    '',
    `Política completa: ${url}`,
    '',
    'Digite *ok* ou *aceito* para continuar (só uma vez).',
  ].join('\n');
}

export function politicaVersao() {
  return process.env.LGPD_POLITICA_VERSAO || '2026-08-21';
}

export async function ensureLgpdSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS salao.lgpd_auditoria (
      id            SERIAL PRIMARY KEY,
      acao          VARCHAR(40) NOT NULL,
      telefone_tail VARCHAR(16),
      detalhes      JSONB NOT NULL DEFAULT '{}'::jsonb,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS salao.lgpd_consentimentos (
      telefone_tail   VARCHAR(16) PRIMARY KEY,
      telefone        VARCHAR(32) NOT NULL,
      aceito_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      politica_versao VARCHAR(32) NOT NULL DEFAULT '1',
      canal           VARCHAR(24) NOT NULL DEFAULT 'whatsapp',
      resposta        VARCHAR(80),
      texto_aviso     TEXT,
      politica_url    TEXT
    );
  `);
  await query(`ALTER TABLE salao.lgpd_consentimentos ADD COLUMN IF NOT EXISTS politica_versao VARCHAR(32) NOT NULL DEFAULT '1'`);
  await query(`ALTER TABLE salao.lgpd_consentimentos ADD COLUMN IF NOT EXISTS canal VARCHAR(24) NOT NULL DEFAULT 'whatsapp'`);
  await query(`ALTER TABLE salao.lgpd_consentimentos ADD COLUMN IF NOT EXISTS resposta VARCHAR(80)`);
  await query(`ALTER TABLE salao.lgpd_consentimentos ADD COLUMN IF NOT EXISTS texto_aviso TEXT`);
  await query(`ALTER TABLE salao.lgpd_consentimentos ADD COLUMN IF NOT EXISTS politica_url TEXT`);
}

function phoneTail(tel) {
  return String(tel || '').replace(/\D/g, '').slice(-8);
}

export async function precisaAvisoPrivacidade(telefone) {
  const tail = phoneTail(telefone);
  if (!tail) return true;

  const consent = await query(
    `SELECT 1 FROM salao.lgpd_consentimentos WHERE telefone_tail = $1 LIMIT 1`,
    [tail],
  );
  if (consent.rows.length) return false;

  // fallback legado: flag em conversas.dados
  const r = await query(
    `SELECT dados FROM salao.conversas
     WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 8) = $1
     LIMIT 1`,
    [tail],
  );
  const dados = r.rows[0]?.dados || {};
  if (dados.lgpd_aviso_em) {
    await marcarAvisoPrivacidadeAceito(telefone, { resposta: 'legado_migrado' });
    return false;
  }
  return true;
}

/**
 * Salva o aceite da política de forma permanente (prova LGPD).
 */
export async function marcarAvisoPrivacidadeAceito(telefone, { resposta = 'aceito' } = {}) {
  const tail = phoneTail(telefone);
  const tel = String(telefone || '').replace(/\D/g, '') || telefone;
  const aviso = mensagemAvisoPrivacidade();
  const url = privacyPolicyUrl();
  const versao = politicaVersao();

  if (tail) {
    await query(
      `INSERT INTO salao.lgpd_consentimentos (
         telefone_tail, telefone, aceito_em, atualizado_em,
         politica_versao, canal, resposta, texto_aviso, politica_url
       ) VALUES ($1, $2, NOW(), NOW(), $3, 'whatsapp', $4, $5, $6)
       ON CONFLICT (telefone_tail) DO UPDATE SET
         telefone = EXCLUDED.telefone,
         atualizado_em = NOW(),
         politica_versao = EXCLUDED.politica_versao,
         resposta = EXCLUDED.resposta,
         texto_aviso = EXCLUDED.texto_aviso,
         politica_url = EXCLUDED.politica_url`,
      [tail, tel, versao, String(resposta || 'aceito').slice(0, 80), aviso, url],
    );

    await query(
      `INSERT INTO salao.lgpd_auditoria (acao, telefone_tail, detalhes)
       VALUES ('consentimento_aceito', $1, $2::jsonb)`,
      [
        tail,
        JSON.stringify({
          telefone: tel,
          resposta,
          politica_versao: versao,
          politica_url: url,
          em: new Date().toISOString(),
        }),
      ],
    );
  }

  // mantém também em conversas.dados (compat)
  const r = await query(
    `SELECT estado, dados FROM salao.conversas WHERE telefone = $1`,
    [telefone],
  );
  const estado = r.rows[0]?.estado || 'idle';
  const dados = {
    ...(r.rows[0]?.dados || {}),
    lgpd_aviso_em: new Date().toISOString(),
    lgpd_politica_versao: versao,
  };
  await query(
    `INSERT INTO salao.conversas (telefone, estado, dados, atualizado_em)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (telefone) DO UPDATE
       SET dados = COALESCE(salao.conversas.dados, '{}'::jsonb) || EXCLUDED.dados,
           atualizado_em = NOW()`,
    [telefone, estado, JSON.stringify(dados)],
  );
}

export async function listarConsentimentos({ limite = 100 } = {}) {
  const { rows } = await query(
    `SELECT telefone, telefone_tail, aceito_em, atualizado_em,
            politica_versao, canal, resposta, politica_url
     FROM salao.lgpd_consentimentos
     ORDER BY aceito_em DESC
     LIMIT $1`,
    [Math.min(Number(limite) || 100, 500)],
  );
  return rows.map((r) => ({
    ...r,
    aceito_em_br: r.aceito_em
      ? new Date(r.aceito_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : null,
  }));
}

export async function exportarDadosTitular(telefone) {
  const tail = phoneTail(telefone);
  if (!tail || tail.length < 8) return { ok: false, erro: 'telefone_invalido' };

  const ag = await query(
    `SELECT a.id, a.cliente_nome, a.cliente_telefone, a.status, a.origem,
            s.nome AS servico, COALESCE(p.nome,'') AS profissional,
            to_char(a.inicio_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS quando,
            a.criado_em, a.atualizado_em
     FROM salao.agendamentos a
     JOIN salao.servicos s ON s.id = a.servico_id
     LEFT JOIN salao.profissionais p ON p.id = a.profissional_id
     WHERE RIGHT(regexp_replace(a.cliente_telefone, '\\D', '', 'g'), 8) = $1
     ORDER BY a.inicio_em DESC`,
    [tail],
  );

  const pag = await query(
    `SELECT pg.id, pg.status, pg.metodo, pg.valor_centavos, pg.valor_previsto_centavos,
            pg.pago_em, pg.criado_em, pg.agendamento_id
     FROM salao.pagamentos pg
     JOIN salao.agendamentos a ON a.id = pg.agendamento_id
     WHERE RIGHT(regexp_replace(a.cliente_telefone, '\\D', '', 'g'), 8) = $1
     ORDER BY pg.criado_em DESC`,
    [tail],
  );

  const msgs = await query(
    `SELECT id, telefone, papel, conteudo, metadados, criado_em
     FROM salao.mensagens_conversa
     WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 8) = $1
     ORDER BY criado_em DESC
     LIMIT 500`,
    [tail],
  );

  const conv = await query(
    `SELECT telefone, estado, dados, atualizado_em
     FROM salao.conversas
     WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 8) = $1`,
    [tail],
  );

  return {
    ok: true,
    exportado_em: new Date().toISOString(),
    telefone_consulta: telefone,
    titular: {
      telefones_encontrados: [
        ...new Set([
          ...ag.rows.map((r) => r.cliente_telefone),
          ...conv.rows.map((r) => r.telefone),
          ...msgs.rows.map((r) => r.telefone),
        ]),
      ],
    },
    agendamentos: ag.rows,
    pagamentos: pag.rows,
    conversas: conv.rows,
    mensagens: msgs.rows,
  };
}

/**
 * Anonimiza / remove dados pessoais do titular (direito de exclusão LGPD).
 * Mantém registros financeiros agregados sem identificar a pessoa.
 */
export async function excluirDadosTitular(telefone, { hardDeleteMensagens = true } = {}) {
  const tail = phoneTail(telefone);
  if (!tail || tail.length < 8) return { ok: false, erro: 'telefone_invalido' };

  const anonId = `anon_${crypto.randomBytes(4).toString('hex')}`;

  const rAg = await query(
    `UPDATE salao.agendamentos
     SET cliente_nome = $2,
         cliente_telefone = $3,
         atualizado_em = NOW()
     WHERE RIGHT(regexp_replace(cliente_telefone, '\\D', '', 'g'), 8) = $1
     RETURNING id`,
    [tail, `[excluído LGPD ${anonId}]`, `lgpd_${anonId}`],
  );

  const rMsg = hardDeleteMensagens
    ? await query(
        `DELETE FROM salao.mensagens_conversa
         WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 8) = $1
         RETURNING id`,
        [tail],
      )
    : await query(
        `UPDATE salao.mensagens_conversa
         SET conteudo = '[mensagem removida — LGPD]',
             telefone = $2,
             metadados = '{}'::jsonb
         WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 8) = $1
         RETURNING id`,
        [tail, `lgpd_${anonId}`],
      );

  const rConv = await query(
    `DELETE FROM salao.conversas
     WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 8) = $1
     RETURNING telefone`,
    [tail],
  );

  await query(`DELETE FROM salao.lgpd_consentimentos WHERE telefone_tail = $1`, [tail]);

  await query(
    `INSERT INTO salao.lgpd_auditoria (acao, telefone_tail, detalhes)
     VALUES ('exclusao', $1, $2::jsonb)`,
    [
      tail,
      JSON.stringify({
        anon_id: anonId,
        agendamentos: rAg.rows.length,
        mensagens: rMsg.rows.length,
        conversas: rConv.rows.length,
        em: new Date().toISOString(),
      }),
    ],
  );

  return {
    ok: true,
    anon_id: anonId,
    agendamentos_anonimizados: rAg.rows.length,
    mensagens_removidas: rMsg.rows.length,
    conversas_removidas: rConv.rows.length,
  };
}

export async function limparMensagensAntigas({ dias = 180 } = {}) {
  const d = Math.max(30, Number(dias) || 180);
  const r = await query(
    `DELETE FROM salao.mensagens_conversa
     WHERE criado_em < NOW() - ($1::int || ' days')::interval
     RETURNING id`,
    [d],
  );
  await query(
    `INSERT INTO salao.lgpd_auditoria (acao, telefone_tail, detalhes)
     VALUES ('retencao_mensagens', NULL, $1::jsonb)`,
    [JSON.stringify({ dias: d, removidas: r.rows.length, em: new Date().toISOString() })],
  );
  return { ok: true, removidas: r.rows.length, dias: d };
}

export function textoPoliticaHtml() {
  const nome = studioNome();
  const contato = process.env.OWNER_NOTIFY_PHONE || process.env.STUDIO_CONTATO || '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacidade · ${nome}</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1.25rem;line-height:1.55;color:#241c16;background:#f4eee7}
    h1{font-size:1.4rem} h2{font-size:1.05rem;margin-top:1.5rem}
    a{color:#7c3140}
  </style>
</head>
<body>
  <h1>Política de Privacidade</h1>
  <p><strong>${nome}</strong> — atualizado em ${new Date().toLocaleDateString('pt-BR')}</p>
  <p>Esta política explica como tratamos dados pessoais no agendamento via WhatsApp e no painel administrativo do studio.</p>

  <h2>1. Quem controla os dados</h2>
  <p>O studio <strong>${nome}</strong> é o controlador dos dados das clientes. O sistema de agendamento processa esses dados sob instrução do studio.</p>

  <h2>2. Quais dados coletamos</h2>
  <ul>
    <li>Nome e número de WhatsApp</li>
    <li>Horários e serviços agendados</li>
    <li>Histórico de mensagens com o bot (para atendimento)</li>
    <li>Informações de pagamento do atendimento (status e forma: PIX, dinheiro, cartão), quando registradas pelo studio</li>
  </ul>

  <h2>3. Para que usamos</h2>
  <ul>
    <li>Agendar, remarcar e cancelar horários</li>
    <li>Enviar avisos sobre o atendimento</li>
    <li>Organização financeira e operacional do studio</li>
  </ul>
  <p>Não vendemos nem usamos seus dados para publicidade de terceiros.</p>

  <h2>4. Base legal</h2>
  <p>Execução de contrato/serviço de beleza (agendamento) e legítimo interesse do studio na organização da agenda, nos termos da LGPD (Lei 13.709/2018).</p>

  <h2>5. Com quem compartilhamos</h2>
  <p>Prestadores necessários ao serviço (ex.: hospedagem do servidor, API de WhatsApp). Eles processam dados sob contrato e só para operar o sistema.</p>

  <h2>6. Por quanto tempo guardamos</h2>
  <p>Agenda e pagamentos enquanto necessários à operação e obrigações do studio. Mensagens de conversa podem ser apagadas automaticamente após o prazo de retenção configurado (padrão 180 dias).</p>

  <h2>7. Seus direitos</h2>
  <p>Você pode solicitar acesso, correção, anonimização ou exclusão dos seus dados pessoais. Fale com o studio pelo WhatsApp${contato ? ` (${contato})` : ''}.</p>

  <h2>8. Segurança</h2>
  <p>O painel administrativo é de uso exclusivo do studio, com autenticação. Em produção recomenda-se HTTPS e senha/PIN forte.</p>

  <h2>9. Contato</h2>
  <p>Dúvidas sobre privacidade: WhatsApp do studio${contato ? ` — ${contato}` : ''}.</p>
</body>
</html>`;
}
