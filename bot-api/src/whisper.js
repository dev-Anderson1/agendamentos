/**
 * Transcrição de áudio via Whisper.
 *
 * Backends suportados (em ordem de prioridade):
 *  1. Groq (gratuito para testes) — defina GROQ_API_KEY
 *  2. OpenAI — defina OPENAI_API_KEY ou AI_API_KEY + base openai
 */

function whisperConfig() {
  if (process.env.GROQ_API_KEY) {
    return {
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env.WHISPER_MODEL || 'whisper-large-v3-turbo',
    };
  }

  const isOpenAiBase =
    !process.env.AI_BASE_URL || process.env.AI_BASE_URL.includes('openai.com');
  const key =
    process.env.OPENAI_API_KEY || (isOpenAiBase ? process.env.AI_API_KEY : null);
  if (key && key !== 'ollama') {
    return {
      apiKey: key,
      baseUrl: 'https://api.openai.com/v1',
      model: 'whisper-1',
    };
  }

  return null;
}

export function isWhisperEnabled() {
  return Boolean(whisperConfig());
}

/**
 * Transcreve áudio a partir de base64.
 * @param {string} base64Audio
 * @param {{ mimeType?: string, filename?: string }} opts
 * @returns {Promise<string|null>} texto transcrito ou null se indisponível
 */
export async function transcribeAudioBase64(base64Audio, { mimeType = 'audio/ogg', filename = 'audio.ogg' } = {}) {
  const config = whisperConfig();
  if (!config) return null;

  const audioBuffer = Buffer.from(base64Audio, 'base64');
  const blob = new Blob([audioBuffer], { type: mimeType });

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', config.model);
  form.append('language', 'pt');
  form.append('response_format', 'text');

  const resp = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Whisper ${resp.status}: ${err.slice(0, 200)}`);
  }

  return (await resp.text()).trim();
}
