// tenant-db-cache.helpers.ts
// Shared helpers for TenantPrismaClient LRU cache tests (split from
// tenant-db-cache.test.ts to satisfy the 200-line rule).

import { withTenantDb } from '../../lib/tenant-database.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

export function makeContext(schemaName: string): TenantContext {
  return { tenantId: `id-${schemaName}`, slug: schemaName, schemaName, realmName: 'r' };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `SHOW search_path` through the cached client for `schemaName`. */
export async function showSearchPath(schemaName: string): Promise<string> {
  const rows = await withTenantDb(
    (db) => db.$queryRaw<Array<{ search_path: string }>>`SHOW search_path`,
    makeContext(schemaName)
  );
  return rows[0]?.search_path ?? '';
}