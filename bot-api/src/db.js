import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://salao:salao_secret@postgres:5432/salao',
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
