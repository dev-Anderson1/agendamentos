import { isPedidoOperacional } from './intent-flags.js';
import { query } from './db.js';
import { listarHistorico } from './history.js';
import { buildSystemPrompt } from './prompt.js';
import { buscarConhecimento, formatarContextoRag, precisaRag } from './rag.js';
import { TOOL_DEFINITIONS, executeTool } from './tools.js';

export { isPedidoOperacional };

const MAX_TOOL_ROUNDS = 6;
const LLM_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 120000);

function aiConfig() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  return { apiKey, baseUrl, model, enabled: Boolean(apiKey) };
}

export function isAgentEnabled() {
  return aiConfig().enabled;
}

function respostaDiretaRag(hits = []) {
  const trechos = hits
    .slice(0, 2)
    .map((h) => h.conteudo)
    .filter(Boolean);
  if (!trechos.length) {
    return 'Não encontrei essa orientação cadastrada. Posso confirmar com a recepção — ou te ajudar com preços, horários e agendamento.';
  }
  return `${trechos.join('\n\n')}\n\nQuer que eu veja horários ou preços de algum serviço?`;
}

async function loadHistory(telefone) {
  const historico = await listarHistorico(telefone, 20);
  return historico.map((m) => ({
    role: m.papel === 'assistant' ? 'assistant' : 'user',
    content: m.conteudo,
  }));
}

async function saveHistory(telefone, messages) {
  const trimmed = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => typeof m.content === 'string' && m.content)
    .slice(-16);

  await query(
    `INSERT INTO salao.conversas (telefone, estado, dados, atualizado_em)
     VALUES ($1, 'agent', $2::jsonb, NOW())
     ON CONFLICT (telefone) DO UPDATE
       SET estado = 'agent',
           dados = COALESCE(salao.conversas.dados, '{}'::jsonb) || $2::jsonb,
           atualizado_em = NOW()`,
    [telefone, JSON.stringify({ agent_messages: trimmed })],
  );
}

async function callLLM(messages, { useTools = true } = {}) {
  const { apiKey, baseUrl, model } = aiConfig();
  const body = {
    model,
    temperature: 0.35,
    messages,
  };
  if (useTools) {
    body.tools = TOOL_DEFINITIONS;
    body.tool_choice = 'auto';
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`AI API ${resp.status}: ${text.slice(0, 400)}`);
  }
  const data = await resp.json();
  const usage = data.usage || {};
  if (usage.prompt_tokens || usage.completion_tokens) {
    import('./painel/consumo.js')
      .then(({ registrarUsoOpenai }) =>
        registrarUsoOpenai({
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          modelo: model,
          metadados: { origem: 'agent' },
        }),
      )
      .catch((err) => console.warn('[consumo] openai:', err.message));
  }
  return data.choices?.[0]?.message;
}

async function responderComRag({ texto, pushName, history, ragHits, telefone, instance }) {
  // Resposta imediata pelos trechos oficiais (confiável em CPU lenta).
  // Se AI_RAG_LLM=1, tenta reescrever com o modelo (sem tools).
  let finalText = respostaDiretaRag(ragHits);
  const useLlm = String(process.env.AI_RAG_LLM || '') === '1';

  if (useLlm) {
    const system = [
      buildSystemPrompt({ pushName }),
      '',
      '## Conhecimento recuperado (RAG) — base obrigatória desta resposta',
      formatarContextoRag(ragHits),
      '',
      'Responda só com base nesse conhecimento. Se faltar dado, diga que a recepção confirma. Sem inventar. Sem menu numérico. WhatsApp, curto e claro.',
    ].join('\n');

    try {
      const msg = await callLLM(
        [
          { role: 'system', content: system },
          ...history.slice(-4),
          { role: 'user', content: texto },
        ],
        { useTools: false },
      );
      const polished = String(msg?.content || '').trim();
      if (polished) finalText = polished;
    } catch (err) {
      console.warn('[agent] RAG LLM falhou, mantendo trechos:', err.message);
    }
  }

  await saveHistory(telefone, [
    ...history.slice(-10),
    { role: 'user', content: texto },
    { role: 'assistant', content: finalText },
  ]);

  return {
    resposta: finalText,
    instance,
    telefone,
    modo: 'rag',
    rag: ragHits.map((h) => ({
      id: h.id,
      topico: h.topico,
      titulo: h.titulo,
      score: h.score,
    })),
  };
}

export async function handleAgentMessage({ telefone, texto, pushName = '', instance = 'salao2' }) {
  const history = await loadHistory(telefone);
  const ultima = history[history.length - 1];
  if (ultima?.role === 'user' && ultima.content === texto) {
    history.pop();
  }

  let ragHits = [];
  if (precisaRag(texto)) {
    ragHits = await buscarConhecimento(texto, { topK: 4 });
  }

  // Perguntas/situações importantes → RAG primeiro (sem tools pesadas)
  if (
    precisaRag(texto) &&
    ragHits.length &&
    ragHits[0].score >= 0.2 &&
    !isPedidoOperacional(texto)
  ) {
    return responderComRag({ texto, pushName, history, ragHits, telefone, instance });
  }

  let system = buildSystemPrompt({ pushName });
  if (ragHits.length) {
    system += `\n\n## Conhecimento recuperado (RAG) — use estes trechos na resposta\n${formatarContextoRag(ragHits)}`;
  } else if (precisaRag(texto)) {
    system +=
      '\n\n## Conhecimento recuperado (RAG)\nNenhum trecho encontrado. Se a dúvida for de política/orientação, chame buscar_conhecimento ou diga que a recepção confirma.';
  }

  const messages = [
    { role: 'system', content: system },
    ...history,
    {
      role: 'user',
      content: `[telefone_cliente=${telefone}]\n[instrução: entenda a dúvida/pedido. Em perguntas importantes use o RAG (já injetado ou tool buscar_conhecimento). Use outras tools para dados vivos. Sem menu numérico.]\n${texto}`,
    },
  ];

  let finalText = '';
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const msg = await callLLM(messages, { useTools: true });
      if (!msg) break;

      messages.push(msg);

      const toolCalls = msg.tool_calls;
      if (toolCalls?.length) {
        for (const call of toolCalls) {
          const name = call.function?.name;
          let args = {};
          try {
            args = JSON.parse(call.function?.arguments || '{}');
          } catch {
            args = {};
          }
          const result = await executeTool(name, args, { telefone });
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      finalText = String(msg.content || '').trim();
      break;
    }
  } catch (err) {
    console.warn('[agent] LLM/tools falhou:', err.message);
    if (ragHits.length && !isPedidoOperacional(texto)) {
      finalText = respostaDiretaRag(ragHits);
    }
  }

  if (!finalText) {
    finalText =
      'Desculpa, não consegui concluir agora. Pode repetir o que você precisa? Posso ver horários, serviços ou agendar pra você.';
  }

  const toStore = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content:
        m.role === 'user'
          ? String(m.content || '')
              .replace(/^\[telefone_cliente=[^\]]+\]\n/, '')
              .replace(/^\[instrução:[^\]]+\]\n/, '')
          : String(m.content || ''),
    }))
    .filter((m) => m.content);

  if (!toStore.length || toStore[toStore.length - 1].content !== finalText) {
    toStore.push({ role: 'assistant', content: finalText });
  }
  await saveHistory(telefone, toStore);

  return {
    resposta: finalText,
    instance,
    telefone,
    modo: ragHits.length && !finalText.includes('Desculpa') ? 'agent' : 'agent',
    rag: ragHits.map((h) => ({ id: h.id, topico: h.topico, titulo: h.titulo, score: h.score })),
  };
}
