/**
 * Cliente HTTP da Evolution API (envio de mensagens WhatsApp).
 * Sem n8n no meio: bot-api responde direto.
 */

function evolutionConfig() {
  const baseUrl = (
    process.env.EVOLUTION_SERVER_URL_INTERNAL ||
    process.env.EVOLUTION_SERVER_URL ||
    'http://evolution-api:8080'
  ).replace(/\/$/, '');
  const apiKey = process.env.EVOLUTION_API_KEY || 'salao_evolution_key';
  return { baseUrl, apiKey };
}

export async function sendWhatsAppText({ instance = 'salao2', telefone, texto }) {
  const number = String(telefone || '').replace(/\D/g, '');
  const text = String(texto || '').trim();
  if (!number || !text) {
    return { ok: false, skipped: true, reason: 'telefone/texto vazio' };
  }

  const { baseUrl, apiKey } = evolutionConfig();
  const url = `${baseUrl}/message/sendText/${encodeURIComponent(instance)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      number,
      text,
    }),
  });

  const bodyText = await resp.text();
  let data = null;
  try {
    data = JSON.parse(bodyText);
  } catch {
    data = { raw: bodyText.slice(0, 400) };
  }

  if (!resp.ok) {
    throw new Error(`Evolution sendText ${resp.status}: ${bodyText.slice(0, 300)}`);
  }

  return { ok: true, data };
}
