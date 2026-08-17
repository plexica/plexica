// tenant-db-cache.test.ts
// Integration tests for the ADR-027 TenantPrismaClient LRU cache: tenant
// isolation, LRU cap eviction, TTL expiry, invalidation, concurrency, and
// the deletion-saga schema_drop wiring.
//
// Most cases use schema names WITHOUT creating the schemas: cached clients
// connect lazily and the callbacks under test never query. Only isolation
// and schema_drop create real schemas.
//
// NOTE: Prisma 6 reconnects lazily after $disconnect(), so a query on a
// disconnected client does NOT reject. Eviction is asserted via
// vi.spyOn(client, '$disconnect') on the captured reference plus cache
// introspection (tenantDbCacheSize / hasTenantDbClient).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { config } from '../lib/config.js';
import { prisma } from '../lib/database.js';
import {
  configureTenantDbCache,
  disconnectAllTenantDbClients,
  hasTenantDbClient,
  invalidateTenantDbClient,
  tenantDbCacheSize,
} from '../lib/tenant-db-cache.js';
import { withTenantDb } from '../lib/tenant-database.js';
import { executeSchemaDrop } from '../modules/admin/services/deletion-step-schema-drop.js';

import type { TenantContext } from '../lib/tenant-context-store.js';

function makeContext(schemaName: string): TenantContext {
  return { tenantId: `id-${schemaName}`, slug: schemaName, schemaName, realmName: 'r' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Runs `SHOW search_path` through the cached client for `schemaName`. */
async function showSearchPath(schemaName: string): Promise<string> {
  const rows = await withTenantDb(
    (db) => db.$queryRaw<Array<{ search_path: string }>>`SHOW search_path`,
    makeContext(schemaName)
  );
  return rows[0]?.search_path ?? '';
}

beforeEach(async () => {
  // isolate:false → the module-level cache is shared with other test files
  // in this worker. Always start from an empty cache with defaults restored.
  await disconnectAllTenantDbClients();
  configureTenantDbCache({
    maxEntries: config.TENANT_DB_CACHE_MAX,
    ttlMs: config.TENANT_DB_CACHE_TTL_MS,
  });
});

afterAll(async () => {
  await disconnectAllTenantDbClients();
});

describe('tenant isolation', () => {
  const ISO_A = 'tenant_cache_iso_a';
  const ISO_B = 'tenant_cache_iso_b';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${ISO_A}"`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${ISO_B}"`);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ISO_A}" CASCADE`);
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${ISO_B}" CASCADE`);
  });

  it('two schemas get two distinct cached clients, each bound to its own search_path', async () => {
    const dbA = await withTenantDb((db) => Promise.resolve(db), makeContext(ISO_A));
    const dbB = await withTenantDb((db) => Promise.resolve(db), makeContext(ISO_B));

    expect(dbA).not.toBe(dbB);
    expect(tenantDbCacheSize()).toBe(2);

    const pathA = await showSearchPath(ISO_A);
    const pathB = await showSearchPath(ISO_B);
    expect(pathA).toContain(ISO_A);
    expect(pathA).not.toContain(ISO_B);
    expect(pathB).toContain(ISO_B);
    expect(pathB).not.toContain(ISO_A);

    // A repeated access reuses the same cached client — no per-call creation.
    const dbA2 = await withTenantDb((db) => Promise.resolve(db), makeContext(ISO_A));
    expect(dbA2).toBe(dbA);
  });
});

describe('LRU eviction on cap', () => {
  it('evicts and disconnects the least-recently-used client when the cap is exceeded', async () => {
    configureTenantDbCache({ maxEntries: 2 });

    const ctxA = makeContext('tenant_cache_cap_a');
    const ctxB = makeContext('tenant_cache_cap_b');
    const ctxC = makeContext('tenant_cache_cap_c');

    const dbA = await withTenantDb((db) => Promise.resolve(db), ctxA);
    await withTenantDb((db) => Promise.resolve(db), ctxB);
    const disconnectSpy = vi.spyOn(dbA, '$disconnect');

    // Third distinct schema exceeds the cap → A (LRU) is evicted synchronously.
    await withTenantDb((db) => Promise.resolve(db), ctxC);

    expect(tenantDbCacheSize()).toBe(2);
    expect(hasTenantDbClient(ctxA.schemaName)).toBe(false);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);

    // B is now the oldest: touching A again creates a NEW client and evicts B.
    const dbA2 = await withTenantDb((db) => Promise.resolve(db), ctxA);
    expect(dbA2).not.toBe(dbA);
    expect(hasTenantDbClient(ctxB.schemaName)).toBe(false);
    expect(tenantDbCacheSize()).toBe(2);
  });
});

describe('TTL expiry', () => {
  it('disconnects and evicts a client idle longer than the TTL, then recreates it', async () => {
    configureTenantDbCache({ ttlMs: 50 });

    const ctx = makeContext('tenant_cache_ttl');
    const db1 = await withTenantDb((db) => Promise.resolve(db), ctx);
    const disconnectSpy = vi.spyOn(db1, '$disconnect');

    await sleep(80);

    // The next cache access observes the stale entry: evict + disconnect it,
    // then create a fresh client for the same schema.
    const db2 = await withTenantDb((db) => Promise.resolve(db), ctx);

    expect(db2).not.toBe(db1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(tenantDbCacheSize()).toBe(1);
  });

  it('the periodic sweeper evicts idle entries even without any cache access', async () => {
    // The access-time eviction above does not cover the sweeper path. This test
    // uses a TTL at the config floor (1000ms) so MIN_SWEEP_INTERVAL_MS (1000ms)
    // applies, then sleeps past it WITHOUT touching the cache. If ensureSweeper
    // or sweepIntervalMs break, the entry stays and this test fails.
    configureTenantDbCache({ ttlMs: 1_000 });

    const ctx = makeContext('tenant_cache_sweeper');
    await withTenantDb((db) => Promise.resolve(db), ctx);
    expect(hasTenantDbClient('tenant_cache_sweeper')).toBe(true);

    // Sweeper interval = clamp(1000/2, 1000, 60000) = 1000ms. Sleep past two
    // sweeps without any cache access.
    await sleep(2_200);

    expect(hasTenantDbClient('tenant_cache_sweeper')).toBe(false);
  }, 10_000);
});

describe('invalidation', () => {
  it('invalidateTenantDbClient disconnects and removes the cached client', async () => {
    const ctx = makeContext('tenant_cache_invalidate');
    const db1 = await withTenantDb((db) => Promise.resolve(db), ctx);
    const disconnectSpy = vi.spyOn(db1, '$disconnect');

    await invalidateTenantDbClient(ctx.schemaName);

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(hasTenantDbClient(ctx.schemaName)).toBe(false);

    const db2 = await withTenantDb((db) => Promise.resolve(db), ctx);
    expect(db2).not.toBe(db1);
  });

  it('invalidateTenantDbClient is a no-op for a schema that is not cached', async () => {
    await expect(invalidateTenantDbClient('tenant_never_cached')).resolves.toBeUndefined();
    expect(tenantDbCacheSize()).toBe(0);
  });
});

describe('concurrency', () => {
  it('concurrent access to the same schema creates exactly one client', async () => {
    const ctx = makeContext('tenant_cache_concurrent');
    const [db1, db2] = await Promise.all([
      withTenantDb((db) => Promise.resolve(db), ctx),
      withTenantDb((db) => Promise.resolve(db), ctx),
    ]);
    expect(db1).toBe(db2);
    expect(tenantDbCacheSize()).toBe(1);
  });
});

describe('deprovisioning wiring', () => {
  const DROP_SCHEMA = 'tenant_cache_drop';

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${DROP_SCHEMA}" CASCADE`);
  });

  it('the deletion saga schema_drop step invalidates the cached client', async () => {
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${DROP_SCHEMA}"`);

    const db1 = await withTenantDb((db) => Promise.resolve(db), makeContext(DROP_SCHEMA));
    const disconnectSpy = vi.spyOn(db1, '$disconnect');

    await executeSchemaDrop(prisma, 'tenant-id-cache-drop', DROP_SCHEMA);

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect(hasTenantDbClient(DROP_SCHEMA)).toBe(false);
  });
});
