import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { handleAgentMessage, isAgentEnabled } from './agent.js';
import { handleMessage, isShortcutClassic } from './bot.js';
import {
  isContinuacaoCurta,
  isPedidoCatalogo,
  isPedidoOperacional,
} from './intent-flags.js';
import { classifyIntent } from './classifier.js';
import { pool } from './db.js';
import { sendWhatsAppText } from './evolution.js';
import { registrarMensagem } from './history.js';
import {
  googleAuthUrl,
  googleCalendarPronto,
  googleOAuthConfigured,
  salvarRefreshToken,
} from './google-calendar.js';
import { buscarConhecimento, ensureRagReady, precisaRag } from './rag.js';
import { executeTool, TOOL_DEFINITIONS } from './tools.js';
import {
  avisarClientes,
  buscarAgendamento,
  cancelarHorarioEAvisar,
  isDonoIntent,
  listarAgendaSalao,
  listarClientesComAgenda,
  ownerPin,
} from './admin.js';
import { enviarAvisoComRemarcacao, prepararRemarcacao } from './remarcar.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
const __dirname = dirname(fileURLToPath(import.meta.url));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    let conhecimento = 0;
    try {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM salao.conhecimento WHERE ativo`);
      conhecimento = r.rows[0]?.n || 0;
    } catch {
      conhecimento = -1;
    }
    res.json({
      ok: true,
      agent: isAgentEnabled(),
      model: process.env.AI_MODEL || null,
      rag: { conhecimento },
      google_calendar: await googleCalendarPronto(),
      evolution: Boolean(
        process.env.EVOLUTION_SERVER_URL_INTERNAL || process.env.EVOLUTION_SERVER_URL,
      ),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.get('/oauth/google', (_req, res) => {
  if (!googleOAuthConfigured()) {
    return res
      .status(400)
      .send(
        'Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no .env. Crie um OAuth Web no Google Cloud (Calendar API) com redirect http://localhost:3001/oauth/google/callback',
      );
  }
  res.redirect(googleAuthUrl());
});

app.get('/oauth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Sem code do Google.');
    await salvarRefreshToken(String(code));
    res.send(
      'Google Agenda autorizado. Os próximos agendamentos entram como TESTE no calendário de andiscipulo@gmail.com. Pode fechar esta aba.',
    );
  } catch (err) {
    console.error(err);
    res.status(500).send(`Falha na autorização: ${err.message}`);
  }
});

app.post('/rag/search', async (req, res) => {
  try {
    const pergunta = req.body?.pergunta || req.body?.texto || '';
    const hits = await buscarConhecimento(pergunta, { topK: Number(req.body?.topK) || 5 });
    res.json({ pergunta, precisa_rag: precisaRag(pergunta), hits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: String(err.message || err) });
  }
});

app.get('/tools', (_req, res) => {
  res.json({
    tools: TOOL_DEFINITIONS.map((t) => t.function.name),
    definitions: TOOL_DEFINITIONS,
  });
});

app.post('/classify', async (req, res) => {
  try {
    const texto = req.body?.texto || req.body?.message || '';
    const result = await classifyIntent(texto);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: String(err.message || err) });
  }
});

function adminAutorizado(req) {
  const pin = req.headers['x-owner-pin'] || req.body?.pin || req.query?.pin;
  return String(pin || '') === ownerPin();
}

app.get(['/admin', '/admin/'], (_req, res) => {
  res.type('html').send(readFileSync(join(__dirname, 'admin.html'), 'utf8'));
});

app.get('/admin/agenda', async (req, res) => {
  if (!adminAutorizado(req)) return res.status(401).json({ erro: 'pin_invalido' });
  try {
    const periodo = req.query.periodo || 'hoje';
    const data = await listarAgendaSalao(periodo);
    res.json(data);
  } catch (err) {
    res.status(500).json({ erro: String(err.message || err) });
  }
});

app.post('/admin/avisar', async (req, res) => {
  if (!adminAutorizado(req)) return res.status(401).json({ erro: 'pin_invalido' });
  try {
    const texto = req.body?.texto || req.body?.mensagem || '';
    const id = Number(req.body?.id);
    const instance = req.body?.instance || process.env.EVOLUTION_INSTANCE || 'salao2';

    if (id) {
      const ag = await buscarAgendamento(id);
      if (!ag) return res.status(404).json({ erro: 'nao_encontrado' });
      const oferta = await enviarAvisoComRemarcacao({
        telefoneCliente: ag.cliente_telefone,
        clienteNome: ag.cliente_nome,
        servicoId: ag.servico_id,
        profissionalId: ag.profissional_id,
        quando: ag.quando,
        servicoNome: ag.servico,
        agendamentoId: ag.id,
        textoAviso: texto,
        instance,
      });
      return res.json({
        ok: true,
        slots: oferta.slots?.length || 0,
        mensagem: oferta.erro_envio
          ? `Não consegui enviar o WhatsApp: ${oferta.erro_envio}`
          : `Aviso enviado para ${ag.cliente_nome} com ${oferta.slots?.length || 0} horário(s) livres para remarcar.`,
        erro_envio: oferta.erro_envio || null,
      });
    }

    const telefone = req.body?.telefone || null;
    let dest;
    if (telefone) {
      dest = [{ telefone }];
    } else {
      const clientes = await listarClientesComAgenda();
      dest = clientes.map((c) => ({ telefone: c.cliente_telefone, nome: c.cliente_nome }));
    }
    const r = await avisarClientes({
      destinatarios: dest,
      texto,
      instance,
    });
    res.json(r);
  } catch (err) {
    res.status(500).json({ erro: String(err.message || err) });
  }
});

app.post('/admin/cancelar-remarcar', async (req, res) => {
  if (!adminAutorizado(req)) return res.status(401).json({ erro: 'pin_invalido' });
  try {
    const id = Number(req.body?.id);
    if (!id) return res.status(400).json({ erro: 'informe_id' });
    const instance = req.body?.instance || process.env.EVOLUTION_INSTANCE || 'salao2';
    const r = await cancelarHorarioEAvisar({ id, instance, enviarAviso: false });
    if (!r.ok) return res.status(404).json({ erro: 'nao_encontrado' });
    const oferta = await prepararRemarcacao({
      telefoneCliente: r.horario.cliente_telefone,
      clienteNome: r.horario.cliente_nome,
      servicoId: r.horario.servico_id,
      profissionalId: r.horario.profissional_id,
      quandoCancelado: r.horario.quando,
      agendamentoId: r.horario.id,
      instance,
      origem: 'dono',
      enviarWhatsApp: true,
    });
    res.json({
      ok: true,
      id: r.horario.id,
      cliente: r.horario.cliente_nome,
      slots: oferta.slots?.length || 0,
      mensagem: oferta.slots?.length
        ? `Cancelado. Enviamos ${oferta.slots.length} horário(s) livres para ${r.horario.cliente_nome} remarcar.`
        : `Cancelado. Avisamos ${r.horario.cliente_nome}; não há vaga nos próximos 14 dias no sistema.`,
      erro_envio: oferta.erro_envio || null,
    });
  } catch (err) {
    res.status(500).json({ erro: String(err.message || err) });
  }
});

app.post('/tools/:nome', async (req, res) => {
  try {
    const nome = req.params.nome;
    const args = req.body || {};
    const result = await executeTool(nome, args, { telefone: args.telefone });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: String(err.message || err) });
  }
});

function extractFromEvolution(body) {
  const root = body?.body ?? body ?? {};
  const data = root.data ?? root;
  const key = data.key ?? {};
  const message = data.message ?? {};

  const fromMe = Boolean(key.fromMe);
  const remoteJid = String(key.remoteJid || '');
  const remoteJidAlt = String(key.remoteJidAlt || '');
  // Em eventos LID, o número real costuma vir em remoteJidAlt.
  const clienteJid =
    [remoteJid, remoteJidAlt].find((jid) => jid.endsWith('@s.whatsapp.net')) ||
    remoteJid ||
    remoteJidAlt;
  const isGroup = remoteJid.endsWith('@g.us');

  const texto =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.buttonResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    '';

  const telefone = clienteJid
    .replace('@s.whatsapp.net', '')
    .replace('@lid', '')
    .replace(/\D/g, '');

  const instance =
    root.instance ||
    root.instanceName ||
    body.instance ||
    data.instance ||
    process.env.EVOLUTION_INSTANCE ||
    'salao2';
  const pushName = data.pushName || '';
  const event = String(root.event || body.event || data.event || '').toLowerCase();

  return {
    fromMe,
    isGroup,
    texto: String(texto).trim(),
    telefone,
    instance,
    pushName,
    event,
  };
}

async function registrarMensagemSeguro(dados) {
  try {
    await registrarMensagem(dados);
  } catch (err) {
    console.error('Falha ao registrar histórico:', err.message || err);
  }
}

function isEquipeIntent(texto = '') {
  const t = String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
  return (
    ['equipe', 'profissional', 'agenda profissional', 'sou profissional'].includes(t) ||
    isDonoIntent(texto)
  );
}

async function processChat({ telefone, texto, pushName = '', instance = 'salao2' }) {
  const sessaoAntes = await pool.query(
    `SELECT estado FROM salao.conversas WHERE telefone = $1`,
    [telefone],
  );
  const estadoAntes = sessaoAntes.rows[0]?.estado || 'idle';
  await registrarMensagemSeguro({
    telefone,
    papel: 'user',
    conteudo:
      estadoAntes === 'equipe_pin' || estadoAntes === 'dono_pin' ? '[PIN informado]' : texto,
    metadados: { estadoAntes, instance, pushName },
  });

  const forceClassic = String(process.env.AI_FORCE_CLASSIC || '') === '1';

  let result;
  if (
    forceClassic ||
    !isAgentEnabled() ||
    isEquipeIntent(texto) ||
    isShortcutClassic(texto) ||
    isPedidoOperacional(texto) ||
    isContinuacaoCurta(texto) ||
    isPedidoCatalogo(texto)
  ) {
    result = await handleMessage({ telefone, texto, pushName, instance });
  } else {
    const sess = await pool.query(
      `SELECT estado FROM salao.conversas WHERE telefone = $1`,
      [telefone],
    );
    const estado = sess.rows[0]?.estado || 'idle';
    const estadosClassicos = new Set([
      'equipe_escolher',
      'equipe_pin',
      'profissional_menu',
      'dono_pin',
      'dono_menu',
      'dono_agenda_lista',
      'dono_item_acoes',
      'dono_item_aviso_texto',
      'dono_aviso_todos_texto',
      'dono_aviso_todos_confirmar',
      'dono_aviso_um_escolher',
      'dono_aviso_um_texto',
      'dono_cancelar_escolher',
      'remarcar_escolher_slot',
      'remarcar_confirmar',
      'confirmar_ver_profissionais',
      'confirmar_agendar_equipe',
      'confirmar_ver_horarios',
      'agendar_tipo_corte',
      'agendar_servico',
      'agendar_profissional',
      'agendar_dia',
      'agendar_hora',
      'agendar_confirmar_datahora',
      'agendar_nome',
      'agendar_nome_texto',
      'agendar_confirmar',
      'cancelar_escolher',
    ]);
    if (estadosClassicos.has(estado)) {
      result = await handleMessage({ telefone, texto, pushName, instance });
    } else {
      result = await handleAgentMessage({ telefone, texto, pushName, instance });
    }
  }

  if (result?.resposta) {
    const sessaoDepois = await pool.query(
      `SELECT estado, dados FROM salao.conversas WHERE telefone = $1`,
      [telefone],
    );
    const estadoDepois = sessaoDepois.rows[0]?.estado || 'idle';
    const dadosDepois = sessaoDepois.rows[0]?.dados || {};
    await registrarMensagemSeguro({
      telefone,
      papel: 'assistant',
      conteudo: result.resposta,
      metadados: {
        estado: estadoDepois,
        acaoPendente: estadoDepois.startsWith('confirmar_') ? estadoDepois : null,
        servico: dadosDepois.servico?.nome || null,
        instance,
      },
    });
  }

  return {
    ...result,
    telefone,
    instance: result?.instance || instance,
  };
}

/** Teste local / curl: não envia WhatsApp. */
app.post('/chat', async (req, res) => {
  try {
    const incoming = req.body || {};
    let telefone = incoming.telefone;
    let texto = incoming.texto;
    let instance = incoming.instance || process.env.EVOLUTION_INSTANCE || 'salao2';
    let pushName = incoming.pushName || '';
    let fromMe = incoming.fromMe;
    let isGroup = incoming.isGroup;

    if (!telefone || texto === undefined) {
      const parsed = extractFromEvolution(incoming);
      telefone = parsed.telefone;
      texto = parsed.texto;
      instance = parsed.instance;
      pushName = parsed.pushName;
      fromMe = parsed.fromMe;
      isGroup = parsed.isGroup;
    }

    if (fromMe || isGroup || !telefone || !texto) {
      return res.json({ ignore: true, resposta: null });
    }

    const result = await processChat({ telefone, texto, pushName, instance });
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      resposta: 'Tive um problema aqui. Pode tentar de novo em instantes?',
      instance: req.body?.instance || 'salao2',
      error: String(err.message || err),
    });
  }
});

/**
 * Webhook da Evolution (substitui o n8n).
 * Responde 200 rápido e envia a resposta pelo sendText.
 */
async function handleEvolutionWebhook(req, res) {
  // ACK imediato — Evolution não pode esperar o LLM/fluxo completo.
  res.status(200).json({ received: true });

  try {
    const parsed = extractFromEvolution(req.body || {});
    const { fromMe, isGroup, texto, telefone, instance, pushName, event } = parsed;

    if (event && event.includes('connection')) {
      console.log(`[webhook] connection event instance=${instance}`);
      return;
    }

    if (fromMe || isGroup || !telefone || !texto) {
      return;
    }

    const result = await processChat({ telefone, texto, pushName, instance });
    if (!result?.resposta) return;

    await sendWhatsAppText({
      instance: result.instance || instance,
      telefone: result.telefone || telefone,
      texto: result.resposta,
    });
  } catch (err) {
    console.error('[webhook] erro:', err.message || err);
  }
}

app.post('/webhook/whatsapp', handleEvolutionWebhook);
app.post('/webhook/whatsapp-salao', handleEvolutionWebhook);

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(
    `bot-api listening on :${port} | agent=${isAgentEnabled()} | webhook=/webhook/whatsapp | agenda=/admin`,
  );
  ensureRagReady().catch((e) => console.warn('[rag] ready:', e.message));
});
