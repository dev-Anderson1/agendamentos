import { google } from 'googleapis';
import { query } from './db.js';

const TZ = 'America/Sao_Paulo';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_CALENDAR_EMAIL || 'primary';
}

function attendeeEmail() {
  return process.env.GOOGLE_CALENDAR_EMAIL || 'andiscipulo@gmail.com';
}

function redirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/oauth/google/callback';
}

export function googleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function googleCalendarPronto() {
  if (!googleOAuthConfigured()) return false;
  const token = await getRefreshToken();
  return Boolean(token);
}

async function getRefreshToken() {
  if (process.env.GOOGLE_REFRESH_TOKEN) return process.env.GOOGLE_REFRESH_TOKEN;
  try {
    const { rows } = await query(
      `SELECT valor FROM salao.configuracoes WHERE chave = 'google_refresh_token'`,
    );
    const v = rows[0]?.valor;
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v.token) return v.token;
  } catch {
    /* ignore */
  }
  return null;
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri(),
  );
}

export function googleAuthUrl() {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    include_granted_scopes: true,
  });
}

export async function salvarRefreshToken(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google não devolveu refresh_token. Revogue o acesso do app e autorize de novo.');
  }
  await query(
    `INSERT INTO salao.configuracoes (chave, valor)
     VALUES ('google_refresh_token', to_jsonb($1::text))
     ON CONFLICT (chave) DO UPDATE SET valor = to_jsonb($1::text), atualizado_em = NOW()`,
    [tokens.refresh_token],
  );
  return tokens.refresh_token;
}

async function calendarClient() {
  const refresh = await getRefreshToken();
  if (!googleOAuthConfigured() || !refresh) return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: refresh });
  return google.calendar({ version: 'v3', auth: client });
}

function montarEvento({ id, cliente, telefone, servico, profissional, inicioLocal, fimLocal }) {
  const email = attendeeEmail();
  return {
    summary: `TESTE · ${servico} · ${cliente}`,
    description: [
      'TESTE — agendamento via WhatsApp (Studio Erika Thebas)',
      `Código: #${id}`,
      `Cliente: ${cliente}`,
      `Telefone: ${telefone}`,
      `Serviço: ${servico}`,
      `Profissional: ${profissional || 'A definir'}`,
    ].join('\n'),
    start: { dateTime: inicioLocal, timeZone: TZ },
    end: { dateTime: fimLocal, timeZone: TZ },
    attendees: [{ email, displayName: 'teste' }],
    reminders: {
      useDefault: false,
      overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 30 }],
    },
  };
}

export async function criarEventoGoogle(dados) {
  const cal = await calendarClient();
  if (!cal) {
    console.warn('[google] calendário não autorizado — pulando evento');
    return null;
  }
  try {
    const resp = await cal.events.insert({
      calendarId: calendarId(),
      sendUpdates: 'all',
      requestBody: montarEvento(dados),
    });
    const eventId = resp.data?.id || null;
    if (eventId && dados.id) {
      await query(`UPDATE salao.agendamentos SET google_event_id = $2, atualizado_em = NOW() WHERE id = $1`, [
        dados.id,
        eventId,
      ]);
    }
    console.log(`[google] evento TESTE criado #${dados.id} → ${eventId}`);
    return eventId;
  } catch (err) {
    console.warn('[google] falha ao criar evento:', err.message);
    return null;
  }
}

export async function cancelarEventoGoogle(eventId) {
  if (!eventId) return false;
  const cal = await calendarClient();
  if (!cal) return false;
  try {
    await cal.events.patch({
      calendarId: calendarId(),
      eventId,
      sendUpdates: 'all',
      requestBody: {
        status: 'cancelled',
        summary: 'TESTE · CANCELADO',
      },
    });
    return true;
  } catch (err) {
    console.warn('[google] falha ao cancelar evento:', err.message);
    return false;
  }
}

export async function sincronizarNovoAgendamento({
  id,
  cliente,
  telefone,
  servico,
  profissional,
  inicioLocal,
  fimLocal,
}) {
  return criarEventoGoogle({
    id,
    cliente,
    telefone,
    servico,
    profissional,
    inicioLocal,
    fimLocal,
  });
}
