import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'satria',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '123',
  // Pool size: sesuai connection limit PostgreSQL
  max: 20,
  // Koneksi idle ditutup setelah 60 detik (naik dari 30 untuk traffic burst)
  idleTimeoutMillis: 60_000,
  // Tunggu koneksi lebih lama sebelum error (naik dari 2 detik)
  connectionTimeoutMillis: 10_000,
  // search_path agar tidak perlu tulis schema di setiap query
  options: '-c search_path=auth,master,pkpt,penugasan,audit,pelaporan,public',
});

pool.on('error', (err) => {
  console.error('[DB POOL] Unexpected error on idle client:', err.message);
});

/** Threshold (ms) untuk slow-query warning. */
const SLOW_QUERY_THRESHOLD_MS = 500;

export async function query<T = unknown>(
  text: string,
  params?: unknown[],
): Promise<import('pg').QueryResult<T & Record<string, unknown>>> {
  const start = Date.now();
  const res   = await pool.query<T & Record<string, unknown>>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('[DB]', { query: text.slice(0, 100), duration, rows: res.rowCount });
  } else if (duration > SLOW_QUERY_THRESHOLD_MS) {
    console.warn(`[DB SLOW] ${duration}ms — ${text.slice(0, 120)}`);
  }
  return res;
}

/**
 * Helper untuk menjalankan sekumpulan operasi DB dalam satu transaction.
 * Otomatis COMMIT jika sukses, ROLLBACK jika ada exception.
 *
 * @example
 * await withTransaction(async (client) => {
 *   await client.query('INSERT INTO ...');
 *   await client.query('UPDATE ...');
 * });
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
