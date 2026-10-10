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

export async function evolutionConnectionState(instance = 'salao2') {
  const { baseUrl, apiKey } = evolutionConfig();
  const url = `${baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`;
  const resp = await fetch(url, { headers: { apikey: apiKey } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.message || `connectionState ${resp.status}`);
  }
  return {
    instance: data?.instance?.instanceName || instance,
    state: data?.instance?.state || 'unknown',
  };
}

export async function evolutionConnectQr(instance = 'salao2') {
  const { baseUrl, apiKey } = evolutionConfig();
  const url = `${baseUrl}/instance/connect/${encodeURIComponent(instance)}`;
  const resp = await fetch(url, { headers: { apikey: apiKey } });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.message || `connect ${resp.status}`);
  }
  return {
    pairingCode: data.pairingCode || null,
    code: data.code || null,
    base64: data.base64 || data.qrcode?.base64 || null,
  };
}

/**
 * Baixa mídia de uma mensagem e retorna base64.
 * Usado para transcrição de áudios do WhatsApp.
 */
export async function downloadMediaBase64({ instance, messageData }) {
  const { baseUrl, apiKey } = evolutionConfig();
  const url = `${baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: messageData, convertToMp4: false }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`downloadMedia ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json().catch(() => ({}));
  return data.base64 || null;
}

/**
 * Envia um pin de localização pelo WhatsApp.
 */
export async function sendWhatsAppLocation({ instance = 'salao2', telefone, latitude, longitude, name = '', address = '' }) {
  const number = String(telefone || '').replace(/\D/g, '');
  if (!number || !latitude || !longitude) {
    return { ok: false, skipped: true, reason: 'dados_insuficientes' };
  }
  const { baseUrl, apiKey } = evolutionConfig();
  const url = `${baseUrl}/message/sendLocation/${encodeURIComponent(instance)}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number, name, address, latitude, longitude }),
  });
  const bodyText = await resp.text();
  if (!resp.ok) {
    throw new Error(`Evolution sendLocation ${resp.status}: ${bodyText.slice(0, 200)}`);
  }
  return { ok: true };
}

export function evolutionManagerUrl() {
  return (
    process.env.EVOLUTION_MANAGER_URL ||
    process.env.EVOLUTION_SERVER_URL ||
    'http://localhost:8080'
  ).replace(/\/$/, '') + '/manager';
}
