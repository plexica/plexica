// tenant-db-cache.ts
// Bounded LRU cache of TenantPrismaClient instances, one per tenant schema (ADR-027).
//
// WHY THE CACHE IS SAFE
// Each cached client is constructed with `?schema=<schemaName>` in its
// connection URL: every connection in its pool derives its search_path from
// that URL when it is opened. A cached client is therefore bound to exactly
// ONE tenant schema for its entire lifetime — there is no pool shared across
// schemas and no mutable search_path, so cached clients cannot leak data
// across tenants. (Regression guard: cross-tenant-isolation.test.ts.)
//
// LIFECYCLE
// - Read path: withTenantDb() (tenant-database.ts) via getOrCreateTenantClient().
//   It NEVER disconnects on the request path — the cache owns the lifecycle.
// - Eviction: least-recently-used when the cap (TENANT_DB_CACHE_MAX) is
//   exceeded, and idle entries older than the TTL (TENANT_DB_CACHE_TTL_MS).
//   Evicted entries are $disconnect()ed. TTL is enforced on every access and
//   by a periodic unref'd sweeper (idle pools are released even without
//   traffic). Only IDLE entries expire: config enforces ttl >= 1000 ms, far
//   beyond the milliseconds an in-flight request holds a client reference.
// - Deprovisioning: invalidateTenantDbClient() is called by the deletion saga
//   (deletion-step-schema-drop.ts) when a schema is dropped.
// - Shutdown: disconnectAllTenantDbClients() from stopBackgroundServices(),
//   BEFORE the core pool closes.

// @ts-ignore — generated at build time via 'pnpm db:generate'; not present in git checkout
import { PrismaClient as TenantPrismaClient } from '../../prisma/generated/tenant-client/index.js';

import { config } from './config.js';
import { logger } from './logger.js';

type CachedTenantClient = InstanceType<typeof TenantPrismaClient>;

interface CacheEntry {
  client: CachedTenantClient;
  lastUsed: number;
  /** Number of withTenantDb callbacks currently executing on this client. */
  inFlight: number;
}

// Map insertion order doubles as LRU order: entries are re-inserted at the
// tail on every access, so the FIRST key is always the least-recently-used.
const clients = new Map<string, CacheEntry>();

let maxEntries = config.TENANT_DB_CACHE_MAX;
let ttlMs = config.TENANT_DB_CACHE_TTL_MS;

const MIN_SWEEP_INTERVAL_MS = 1_000;
const MAX_SWEEP_INTERVAL_MS = 60_000;

let sweeper: ReturnType<typeof setInterval> | undefined;

function buildTenantClient(schemaName: string): CachedTenantClient {
  const baseUrl = process.env['DATABASE_URL'] ?? '';
  const tenantUrl = baseUrl.includes('?')
    ? `${baseUrl}&schema=${schemaName}`
    : `${baseUrl}?schema=${schemaName}`;
  return new TenantPrismaClient({ datasources: { db: { url: tenantUrl } } });
}

async function disconnectQuietly(
  schemaName: string,
  client: CachedTenantClient,
  reason: string
): Promise<void> {
  try {
    await client.$disconnect();
  } catch (err) {
    logger.warn({ err, schemaName, reason }, 'Tenant DB client disconnect failed');
  }
}

function sweepIntervalMs(): number {
  return Math.min(Math.max(Math.floor(ttlMs / 2), MIN_SWEEP_INTERVAL_MS), MAX_SWEEP_INTERVAL_MS);
}

function evictEntry(schemaName: string, entry: CacheEntry, reason: string): void {
  // Never evict a client with a callback in flight: $disconnect() would reject
  // a query running right now (Prisma 6 lazy-reconnects on the NEXT query, so
  // the failure would be a transient 500 under burst).
  if (entry.inFlight > 0) return;
  clients.delete(schemaName);
  // Fire-and-forget: the request path is synchronous and cannot await.
  void disconnectQuietly(schemaName, entry.client, reason);
  logger.debug({ schemaName, reason, cacheSize: clients.size }, 'Tenant DB client evicted');
}

function evictExpiredEntries(now: number): void {
  for (const [schemaName, entry] of clients) {
    if (now - entry.lastUsed > ttlMs) evictEntry(schemaName, entry, 'ttl-expired');
  }
}

function evictLruEntry(): void {
  // Walk past entries with in-flight callbacks — the coldest IDLE entry is the
  // one to evict. If every entry is busy (pathological burst), evict nothing:
  // the cache temporarily exceeds the cap rather than killing live queries.
  for (const [schemaName, entry] of clients) {
    if (entry.inFlight === 0) {
      evictEntry(schemaName, entry, 'lru-cap');
      return;
    }
  }
}

function ensureSweeper(): void {
  if (sweeper !== undefined) return;
  sweeper = setInterval(() => evictExpiredEntries(Date.now()), sweepIntervalMs());
  // Never keep the process alive just to reap idle clients.
  sweeper.unref();
}

/**
 * Returns the cached client for `schemaName`, creating it on first access.
 *
 * Synchronous by design: there is no await between the cache lookup and the
 * insertion, so two concurrent calls for the same schema cannot create two
 * clients (PrismaClient connects lazily on first query anyway).
 */
export function getOrCreateTenantClient(schemaName: string): CachedTenantClient {
  const now = Date.now();
  evictExpiredEntries(now);
  ensureSweeper();

  const existing = clients.get(schemaName);
  if (existing !== undefined) {
    existing.lastUsed = now;
    // Refresh recency: re-insert at the tail so keys iterate LRU-first.
    clients.delete(schemaName);
    clients.set(schemaName, existing);
    existing.inFlight++;
    return existing.client;
  }

  while (clients.size >= maxEntries) {
    const sizeBefore = clients.size;
    evictLruEntry();
    // Every entry busy: do not spin forever on a pathological burst.
    if (clients.size === sizeBefore) break;
  }

  const entry: CacheEntry = { client: buildTenantClient(schemaName), lastUsed: now, inFlight: 1 };
  clients.set(schemaName, entry);
  logger.debug({ schemaName, cacheSize: clients.size }, 'Tenant DB client cached');
  return entry.client;
}

/**
 * Marks the callback that was holding the client as finished. MUST be called
 * in a finally by every withTenantDb wrapper — an unbalanced count would keep
 * the entry pinned in the cache forever.
 */
export function releaseTenantClient(schemaName: string): void {
  const entry = clients.get(schemaName);
  if (entry !== undefined && entry.inFlight > 0) entry.inFlight--;
}

/**
 * Removes the cached client for `schemaName` and disconnects it (no-op when
 * not cached). MUST be called by the tenant deprovisioning path when a schema
 * is dropped — a cached client holding pooled connections to a dropped schema
 * would fail on its next use.
 */
export async function invalidateTenantDbClient(schemaName: string): Promise<void> {
  const entry = clients.get(schemaName);
  if (entry === undefined) return;
  clients.delete(schemaName);
  await disconnectQuietly(schemaName, entry.client, 'invalidated');
  logger.info({ schemaName }, 'Tenant DB client invalidated');
}

/**
 * Disconnects every cached client and stops the sweeper. Called from
 * stopBackgroundServices() BEFORE disconnectDatabase(). The sweeper restarts
 * lazily on the next access, so this is also safe to use as a test reset.
 */
export async function disconnectAllTenantDbClients(): Promise<void> {
  if (sweeper !== undefined) {
    clearInterval(sweeper);
    sweeper = undefined;
  }
  const entries = [...clients.entries()];
  clients.clear();
  await Promise.all(
    entries.map(([schemaName, entry]) => disconnectQuietly(schemaName, entry.client, 'shutdown'))
  );
}

/**
 * Overrides the cache limits at runtime, so integration tests can exercise
 * cap eviction and TTL expiry without production-scale values. Not used on
 * the request path.
 */
export function configureTenantDbCache(overrides: { maxEntries?: number; ttlMs?: number }): void {
  if (overrides.maxEntries !== undefined) {
    if (!Number.isInteger(overrides.maxEntries) || overrides.maxEntries < 1) {
      throw new Error('TENANT_DB_CACHE_MAX override must be an integer >= 1');
    }
    maxEntries = overrides.maxEntries;
  }
  if (overrides.ttlMs !== undefined) {
    if (!Number.isInteger(overrides.ttlMs) || overrides.ttlMs < 1) {
      throw new Error('TENANT_DB_CACHE_TTL_MS override must be an integer >= 1');
    }
    ttlMs = overrides.ttlMs;
  }
  // Restart the sweeper (if running) so a new TTL takes effect immediately.
  if (sweeper !== undefined) {
    clearInterval(sweeper);
    sweeper = undefined;
    ensureSweeper();
  }
}

/** Current number of cached clients — test/ops introspection. */
export function tenantDbCacheSize(): number {
  return clients.size;
}

/** Whether a client for `schemaName` is currently cached — test/ops introspection. */
export function hasTenantDbClient(schemaName: string): boolean {
  return clients.has(schemaName);
}
