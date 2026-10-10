import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { seedAdminSeVazio, seedFuncionariosDosProfissionais } from './usuarios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** SQL embutido — garante create mesmo se o arquivo não estiver no container. */
const USUARIOS_CONSUMO_SQL = `
CREATE TABLE IF NOT EXISTS salao.usuarios (
  id                SERIAL PRIMARY KEY,
  nome              VARCHAR(120) NOT NULL,
  login             VARCHAR(80) NOT NULL,
  email             VARCHAR(160),
  telefone          VARCHAR(32),
  pin_hash          TEXT NOT NULL,
  role              VARCHAR(20) NOT NULL DEFAULT 'funcionario'
                    CHECK (role IN ('admin', 'funcionario', 'usuario')),
  profissional_id   INTEGER REFERENCES salao.profissionais(id) ON DELETE SET NULL,
  ativo             BOOLEAN NOT NULL DEFAULT TRUE,
  lgpd_aceite_em    TIMESTAMPTZ,
  lgpd_politica_ver VARCHAR(20),
  ultimo_acesso_em  TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_usuarios_login UNIQUE (login)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email
  ON salao.usuarios (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_profissional
  ON salao.usuarios (profissional_id) WHERE profissional_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_role_ativo
  ON salao.usuarios (role, ativo);

CREATE TABLE IF NOT EXISTS salao.uso_plataforma (
  id            BIGSERIAL PRIMARY KEY,
  provedor      VARCHAR(40) NOT NULL,
  metrica       VARCHAR(64) NOT NULL,
  quantidade    NUMERIC(18, 4) NOT NULL DEFAULT 0,
  custo_centavos INTEGER NOT NULL DEFAULT 0,
  modelo        VARCHAR(80),
  periodo       DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date),
  usuario_id    INTEGER REFERENCES salao.usuarios(id) ON DELETE SET NULL,
  metadados     JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uso_plataforma_periodo
  ON salao.uso_plataforma (periodo DESC, provedor, metrica);
CREATE INDEX IF NOT EXISTS idx_uso_plataforma_provedor
  ON salao.uso_plataforma (provedor, periodo DESC);

CREATE TABLE IF NOT EXISTS salao.lgpd_auditoria (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES salao.usuarios(id) ON DELETE SET NULL,
  acao        VARCHAR(80) NOT NULL,
  detalhe     TEXT,
  ip          VARCHAR(64),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

function loadSql(names) {
  const bases = [
    join(__dirname, '../../postgres'),
    join(__dirname, '../../../postgres'),
    '/postgres',
  ];
  for (const name of names) {
    for (const base of bases) {
      try {
        return readFileSync(join(base, name), 'utf8');
      } catch {
        /* next */
      }
    }
  }
  return null;
}

export async function ensurePainelSchema() {
  try {
    await query(`SELECT 1 FROM salao.pagamentos LIMIT 1`);
  } catch {
    const sql = loadSql(['migrate_painel.sql']);
    if (!sql) {
      console.warn('[painel] migrate_painel.sql não encontrado');
    } else {
      try {
        await query(sql);
        console.log('[painel] schema financeiro/estoque aplicado');
      } catch (err) {
        console.error('[painel] falha migrate_painel:', err.message);
      }
    }
  }

  try {
    await query(`SELECT 1 FROM salao.usuarios LIMIT 1`);
  } catch {
    const sql = loadSql(['migrate_usuarios_consumo.sql']) || USUARIOS_CONSUMO_SQL;
    try {
      await query(sql);
      console.log('[painel] schema usuarios/consumo aplicado');
    } catch (err) {
      console.error('[painel] falha migrate usuarios:', err.message);
    }
  }

  try {
    await seedAdminSeVazio();
  } catch (err) {
    console.warn('[painel] seed admin:', err.message);
  }

  try {
    await seedFuncionariosDosProfissionais();
  } catch (err) {
    console.warn('[painel] seed funcionários:', err.message);
  }
  return true;
}
