import { Pool, PoolClient } from 'pg';
export declare const pool: Pool;
export declare function query<T = unknown>(text: string, params?: unknown[]): Promise<import('pg').QueryResult<T & Record<string, unknown>>>;
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
export declare function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
//# sourceMappingURL=database.d.ts.map