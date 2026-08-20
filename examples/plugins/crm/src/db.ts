// db.ts
// Database access for the CRM plugin backend — now via @plexica/sdk.
//
// The SDK manages a typed pg.Pool connected via the restricted role injected
// by the platform (DATABASE_URL env var). query/queryOne are SDK convenience
// methods that delegate to the pool.
//
// Tables are created by the platform during install via declaredTables migrations.
// The plugin backend holds only runtime DML privileges (SELECT/INSERT/UPDATE/DELETE)
// on its declared tables, granted to the restricted plugin_{installId} role.

import { sdk } from './sdk.js';

import type { Pool } from 'pg';

/** Return the underlying pg.Pool (for advanced use). Prefer query()/queryOne(). */
export async function getPool(): Promise<Pool> {
  return sdk.getDb();
}

export async function query(
  sql: string,
  params?: unknown[],
): Promise<Record<string, unknown>[]> {
  return sdk.query(sql, params);
}

export async function queryOne(
  sql: string,
  params?: unknown[],
): Promise<Record<string, unknown> | null> {
  return sdk.queryOne(sql, params);
}
