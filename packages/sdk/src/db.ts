// db.ts
// Typed database access helper for plugin backends.
// Wraps a pg.Pool connected via the restricted role injected by the platform.
// Extracted from PluginSDK to keep index.ts under the 200-line constitution limit
// and to give consumers a typed query API without importing pg themselves.

import { DbAccessError } from './errors.js';

import type { Pool } from 'pg';


export interface DbQueryResult {
  rows: Record<string, unknown>[];
}

/**
 * Manages a `pg.Pool` scoped to the plugin's declared tables.
 *
 * The platform injects `DATABASE_URL` (or an explicit `dbConnectionString`)
 * pointing at the restricted `plugin_{installId}` role. The pool is created
 * lazily on the first `query()`/`queryOne()`/`getPool()` call and reused for
 * the lifetime of the plugin backend process.
 */
export class PluginDb {
  private pool: Pool | null = null;
  private readonly onError: ((error: Error) => void) | undefined;

  constructor(opts?: { onError?: (error: Error) => void }) {
    this.onError = opts?.onError;
  }

  /**
   * Lazily creates and returns the pg.Pool.
   * @throws {DbAccessError} if no connection string is available.
   */
  async getPool(connectionString: string): Promise<Pool> {
    if (this.pool) return this.pool;

    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString, max: 5 });
      pool.on('error', (err: Error) => {
        if (this.onError) {
          this.onError(err);
        }
      });
      // Verify connectivity once before returning.
      const client = await pool.connect();
      client.release();
      this.pool = pool;
      return pool;
    } catch (err: unknown) {
      throw new DbAccessError(`failed to connect: ${(err as Error).message}`);
    }
  }

  /**
   * Execute a parameterized query and return all matching rows.
   */
  async query(
    connectionString: string,
    sql: string,
    params?: unknown[],
  ): Promise<Record<string, unknown>[]> {
    const pool = await this.getPool(connectionString);
    const result: DbQueryResult = await pool.query(sql, params as never[]);
    return result.rows;
  }

  /**
   * Execute a parameterized query and return the first row, or null.
   */
  async queryOne(
    connectionString: string,
    sql: string,
    params?: unknown[],
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.query(connectionString, sql, params);
    return rows[0] ?? null;
  }

  /**
   * Close the pool and release all connections. Safe to call multiple times.
   */
  async close(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.end();
    } catch {
      /* ignore — pool may already be closed */
    }
    this.pool = null;
  }
}
