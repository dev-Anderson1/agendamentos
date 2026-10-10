import crypto from 'crypto';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ownerPin } from '../admin.js';
import { query } from '../db.js';
import { autenticarUsuario, seedAdminSeVazio } from './usuarios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TTL_MS = 12 * 60 * 60 * 1000;

function tokenSecret() {
  return (
    process.env.PAINEL_TOKEN_SECRET ||
    process.env.N8N_ENCRYPTION_KEY ||
    `salao-painel-${ownerPin()}`
  );
}

function sign(data) {
  return crypto.createHmac('sha256', tokenSecret()).update(data).digest('base64url');
}

/** Token: { exp, iat, role, uid, profissional_id, nome, login } */
export function createPainelToken(user = { role: 'admin', id: 0, nome: 'Administrador', login: 'admin' }) {
  const role = user.role === 'owner' ? 'admin' : user.role || 'admin';
  const payload = {
    exp: Date.now() + TTL_MS,
    iat: Date.now(),
    role,
    uid: user.id ?? 0,
    profissional_id: user.profissional_id ?? null,
    nome: user.nome || 'Administrador',
    login: user.login || 'admin',
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function parsePainelToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig] = token.split('.');
  if (!data || !sig || sign(data) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Date.now()) return null;
    if (payload.role === 'owner') payload.role = 'admin';
    return payload;
  } catch {
    return null;
  }
}

export function verifyPainelToken(token) {
  return Boolean(parsePainelToken(token));
}

export function isAdmin(user) {
  return user?.role === 'admin';
}

export function painelAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : req.headers['x-painel-token'];
  const payload = parsePainelToken(token);
  if (payload) {
    req.user = payload;
    return next();
  }
  const pin = req.headers['x-owner-pin'];
  if (String(pin || '') === ownerPin()) {
    req.user = { role: 'admin', uid: 0, profissional_id: null, nome: 'Administrador', login: 'admin' };
    return next();
  }
  return res.status(401).json({ erro: 'nao_autorizado' });
}

export function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  return res.status(403).json({ erro: 'apenas_admin' });
}

export async function loginPainel({ login, pin }) {
  const user = await autenticarUsuario({ login, pin });
  if (!user) return null;
  return {
    token: createPainelToken(user),
    usuario: {
      id: user.id,
      nome: user.nome,
      login: user.login,
      email: user.email || null,
      telefone: user.telefone || null,
      role: user.role,
      profissional_id: user.profissional_id || null,
      lgpd_aceite_em: user.lgpd_aceite_em || null,
    },
  };
}

export async function ensureUsuariosMigration() {
  const candidates = [
    join(__dirname, '../../postgres/migrate_usuarios_consumo.sql'),
    join(__dirname, '../../../postgres/migrate_usuarios_consumo.sql'),
    '/postgres/migrate_usuarios_consumo.sql',
  ];
  let sql = null;
  for (const p of candidates) {
    try {
      sql = readFileSync(p, 'utf8');
      break;
    } catch {
      /* next */
    }
  }
  if (!sql) {
    console.warn('[painel] migrate_usuarios_consumo.sql não encontrado');
    return false;
  }
  try {
    await query(sql);
    await seedAdminSeVazio();
    return true;
  } catch (err) {
    console.error('[painel] migrate usuarios:', err.message);
    return false;
  }
}
