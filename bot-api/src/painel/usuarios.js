import crypto from 'crypto';
import { query } from '../db.js';
import { ownerPin } from '../admin.js';

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, KEYLEN, SCRYPT).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored || !pin) return false;
  if (!String(stored).startsWith('scrypt$')) {
    return String(stored) === String(pin);
  }
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(pin), salt, KEYLEN, SCRYPT).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
  } catch {
    return false;
  }
}

export async function seedAdminSeVazio() {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM salao.usuarios`);
  if ((rows[0]?.n || 0) > 0) return;
  await query(
    `INSERT INTO salao.usuarios (nome, login, pin_hash, role, ativo, lgpd_aceite_em, lgpd_politica_ver)
     VALUES ($1, $2, $3, 'admin', TRUE, NOW(), '1.0')`,
    ['Administrador', 'admin', hashPin(ownerPin())],
  );
  console.log('[usuarios] admin seed: login=admin / PIN=OWNER_PIN');
}

export async function autenticarUsuario({ login, pin }) {
  const pinStr = String(pin || '').trim();
  if (!pinStr) return null;

  // Só PIN (compat): OWNER_PIN → admin
  if (!login || !String(login).trim()) {
    if (pinStr !== ownerPin()) return null;
    const admin = await buscarAdminAtivo();
    if (admin) {
      await marcarAcesso(admin.id);
      return admin;
    }
    return {
      id: 0,
      nome: 'Administrador',
      login: 'admin',
      role: 'admin',
      profissional_id: null,
      email: null,
      telefone: null,
      lgpd_aceite_em: new Date().toISOString(),
    };
  }

  const loginNorm = String(login).trim().toLowerCase();
  const { rows } = await query(
    `SELECT id, nome, login, email, telefone, pin_hash, role, profissional_id, ativo,
            lgpd_aceite_em, lgpd_politica_ver
     FROM salao.usuarios
     WHERE lower(login) = $1
        OR lower(COALESCE(email,'')) = $1
        OR telefone = $1
     LIMIT 1`,
    [loginNorm],
  );
  const u = rows[0];
  if (!u || !u.ativo) return null;
  if (!verifyPin(pinStr, u.pin_hash)) return null;
  await marcarAcesso(u.id);
  return u;
}

async function buscarAdminAtivo() {
  const { rows } = await query(
    `SELECT id, nome, login, email, telefone, role, profissional_id, ativo,
            lgpd_aceite_em, lgpd_politica_ver
     FROM salao.usuarios
     WHERE role = 'admin' AND ativo = TRUE
     ORDER BY id ASC LIMIT 1`,
  );
  return rows[0] || null;
}

async function marcarAcesso(id) {
  if (!id) return;
  await query(
    `UPDATE salao.usuarios SET ultimo_acesso_em = NOW(), atualizado_em = NOW() WHERE id = $1`,
    [id],
  );
}

export async function listarUsuarios() {
  const { rows } = await query(
    `SELECT u.id, u.nome, u.login, u.email, u.telefone, u.role, u.profissional_id, u.ativo,
            u.lgpd_aceite_em, u.lgpd_politica_ver, u.ultimo_acesso_em, u.criado_em,
            p.nome AS profissional_nome
     FROM salao.usuarios u
     LEFT JOIN salao.profissionais p ON p.id = u.profissional_id
     ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'funcionario' THEN 1 ELSE 2 END, u.nome`,
  );
  return rows;
}

export async function obterUsuario(id) {
  const { rows } = await query(
    `SELECT u.id, u.nome, u.login, u.email, u.telefone, u.role, u.profissional_id, u.ativo,
            u.lgpd_aceite_em, u.lgpd_politica_ver, u.ultimo_acesso_em, u.criado_em,
            p.nome AS profissional_nome
     FROM salao.usuarios u
     LEFT JOIN salao.profissionais p ON p.id = u.profissional_id
     WHERE u.id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function criarUsuario(dados) {
  const {
    nome,
    login,
    email = null,
    telefone = null,
    pin,
    role = 'funcionario',
    profissional_id = null,
    ativo = true,
  } = dados;

  if (!nome || !login || !pin) {
    throw Object.assign(new Error('informe_nome_login_pin'), { status: 400 });
  }
  if (!['admin', 'funcionario', 'usuario'].includes(role)) {
    throw Object.assign(new Error('role_invalido'), { status: 400 });
  }

  try {
    const { rows } = await query(
      `INSERT INTO salao.usuarios
         (nome, login, email, telefone, pin_hash, role, profissional_id, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nome, login, email, telefone, role, profissional_id, ativo, criado_em`,
      [
        String(nome).trim(),
        String(login).trim().toLowerCase(),
        email ? String(email).trim().toLowerCase() : null,
        telefone ? String(telefone).replace(/\D/g, '') : null,
        hashPin(pin),
        role,
        profissional_id ? Number(profissional_id) : null,
        Boolean(ativo),
      ],
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('login_ou_email_ja_existe'), { status: 409 });
    }
    throw err;
  }
}

export async function atualizarUsuario(id, dados) {
  const atual = await obterUsuario(id);
  if (!atual) throw Object.assign(new Error('nao_encontrado'), { status: 404 });

  const nome = dados.nome != null ? String(dados.nome).trim() : atual.nome;
  const email =
    dados.email !== undefined
      ? dados.email
        ? String(dados.email).trim().toLowerCase()
        : null
      : atual.email;
  const telefone =
    dados.telefone !== undefined
      ? dados.telefone
        ? String(dados.telefone).replace(/\D/g, '')
        : null
      : atual.telefone;
  const role = dados.role != null ? dados.role : atual.role;
  const profissional_id =
    dados.profissional_id !== undefined
      ? dados.profissional_id
        ? Number(dados.profissional_id)
        : null
      : atual.profissional_id;
  const ativo = dados.ativo != null ? Boolean(dados.ativo) : atual.ativo;

  if (!['admin', 'funcionario', 'usuario'].includes(role)) {
    throw Object.assign(new Error('role_invalido'), { status: 400 });
  }

  if (dados.pin) {
    const { rows } = await query(
      `UPDATE salao.usuarios SET
         nome=$1, email=$2, telefone=$3, role=$4, profissional_id=$5, ativo=$6,
         pin_hash=$7, atualizado_em=NOW()
       WHERE id=$8
       RETURNING id, nome, login, email, telefone, role, profissional_id, ativo, atualizado_em`,
      [nome, email, telefone, role, profissional_id, ativo, hashPin(dados.pin), id],
    );
    return rows[0];
  }

  const { rows } = await query(
    `UPDATE salao.usuarios SET
       nome=$1, email=$2, telefone=$3, role=$4, profissional_id=$5, ativo=$6, atualizado_em=NOW()
     WHERE id=$7
     RETURNING id, nome, login, email, telefone, role, profissional_id, ativo, atualizado_em`,
    [nome, email, telefone, role, profissional_id, ativo, id],
  );
  return rows[0];
}

export async function registrarAceiteLgpd(usuarioId, versao = '1.0') {
  await query(
    `UPDATE salao.usuarios
     SET lgpd_aceite_em = NOW(), lgpd_politica_ver = $2, atualizado_em = NOW()
     WHERE id = $1`,
    [usuarioId, versao],
  );
}

export async function auditoriaLgpd({ usuarioId, acao, detalhe, ip }) {
  await query(
    `INSERT INTO salao.lgpd_auditoria (usuario_id, acao, detalhe, ip)
     VALUES ($1, $2, $3, $4)`,
    [usuarioId || null, acao, detalhe || null, ip || null],
  );
}

export async function perfilComResumo(usuario) {
  const base = usuario.uid
    ? await obterUsuario(usuario.uid)
    : {
        id: usuario.uid || 0,
        nome: usuario.nome || 'Administrador',
        login: usuario.login || 'admin',
        role: usuario.role || 'admin',
        profissional_id: usuario.profissional_id || null,
        email: null,
        telefone: null,
        lgpd_aceite_em: null,
      };

  const profissionalId = base?.profissional_id || usuario.profissional_id || null;
  let resumo = { hoje: 0, futuros: 0, previsto_reais: 0, recebido_mes_reais: 0 };

  if (profissionalId) {
    const { rows } = await query(
      `SELECT
         COUNT(*) FILTER (
           WHERE (a.inicio_em AT TIME ZONE 'America/Sao_Paulo')::date =
                 (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
             AND a.status IN ('confirmado','pendente')
         )::int AS hoje,
         COUNT(*) FILTER (
           WHERE a.inicio_em >= NOW() AND a.status IN ('confirmado','pendente')
         )::int AS futuros,
         COALESCE(SUM(p.valor_previsto_centavos) FILTER (
           WHERE a.inicio_em >= NOW() AND a.status IN ('confirmado','pendente') AND p.status = 'pendente'
         ), 0)::bigint AS previsto_centavos,
         COALESCE(SUM(p.valor_centavos) FILTER (
           WHERE p.status = 'pago'
             AND date_trunc('month', p.pago_em AT TIME ZONE 'America/Sao_Paulo') =
                 date_trunc('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
         ), 0)::bigint AS recebido_mes
       FROM salao.agendamentos a
       LEFT JOIN salao.pagamentos p ON p.agendamento_id = a.id
       WHERE a.profissional_id = $1`,
      [profissionalId],
    );
    const r = rows[0] || {};
    resumo = {
      hoje: r.hoje || 0,
      futuros: r.futuros || 0,
      previsto_reais: Number(r.previsto_centavos || 0) / 100,
      recebido_mes_reais: Number(r.recebido_mes || 0) / 100,
    };
  }

  return { usuario: base, resumo };
}

export async function listarProfissionaisAtivos() {
  const { rows } = await query(
    `SELECT id, nome, cargo FROM salao.profissionais WHERE ativo = TRUE ORDER BY nome`,
  );
  return rows;
}

function loginFromNome(nome) {
  const primeiro = String(nome || '')
    .trim()
    .split(/\s+/)[0] || 'prof';
  return (
    primeiro
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'prof'
  );
}

/**
 * Cria conta role=funcionario (não admin) para cada profissional ativo
 * sem usuário vinculado. PIN padrão: FUNCIONARIO_PIN_DEFAULT || 1234
 */
export async function seedFuncionariosDosProfissionais() {
  const pinPadrao = String(process.env.FUNCIONARIO_PIN_DEFAULT || '1234');
  const { rows: profissionais } = await query(
    `SELECT id, nome, cargo
     FROM salao.profissionais
     WHERE ativo = TRUE
     ORDER BY id`,
  );

  const criados = [];
  for (const p of profissionais) {
    const { rows: jaTem } = await query(
      `SELECT id FROM salao.usuarios WHERE profissional_id = $1 LIMIT 1`,
      [p.id],
    );
    if (jaTem.length) continue;

    let base = loginFromNome(p.nome);
    let login = base;
    let seq = 2;
    for (;;) {
      const { rows: conflito } = await query(
        `SELECT 1 FROM salao.usuarios WHERE lower(login) = $1 LIMIT 1`,
        [login],
      );
      if (!conflito.length) break;
      login = `${base}${seq++}`;
    }

    await query(
      `INSERT INTO salao.usuarios
         (nome, login, pin_hash, role, profissional_id, ativo, lgpd_aceite_em, lgpd_politica_ver)
       VALUES ($1, $2, $3, 'funcionario', $4, TRUE, NOW(), '1.0')`,
      [p.nome, login, hashPin(pinPadrao), p.id],
    );
    criados.push({
      nome: p.nome,
      login,
      pin: pinPadrao,
      profissional_id: p.id,
      cargo: p.cargo || null,
    });
  }

  if (criados.length) {
    console.log(
      '[usuarios] funcionários criados:',
      criados.map((c) => `${c.login}/${c.pin} (${c.nome})`).join(' | '),
    );
  }
  return criados;
}
