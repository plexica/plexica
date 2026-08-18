// tenant-db-cache.ts
// Bounded LRU cache of TenantPrismaClient instances, one per tenant schema (ADR-027).
//
// WHY THE CACHE IS SAFE
// Each cached client is built with `?schema=<schemaName>` in its connection URL,
// so its pool is bound to ONE schema for its entire lifetime — no shared
// search_path, no cross-tenant leak. (Regression guard: cross-tenant-isolation.)
//
// LIFECYCLE
// - Read path: withTenantDb() via getOrCreateTenantClient(). The cache owns the
//   lifecycle; nothing disconnects on the request path.
// - Eviction: tenant-db-cache-eviction.ts (LRU on cap, TTL on idle).
// - Deprovisioning: invalidateTenantDbClient() on schema drop.
// - Shutdown: disconnectAllTenantDbClients() from stopBackgroundServices().

// ADR-028: the generated tenant client is always present after `pnpm install`.
import { PrismaClient as TenantPrismaClient } from '../../prisma/generated/tenant-client/index.js';

import { config } from './config.js';
import { logger } from './logger.js';
import { disconnectQuietly, evictExpiredEntries, evictLruEntry } from './tenant-db-cache-eviction.js';

import type { CacheEntryLike } from './tenant-db-cache-eviction.js';

type CachedTenantClient = InstanceType<typeof TenantPrismaClient>;

interface CacheEntry extends CacheEntryLike {
  client: CachedTenantClient;
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

function sweepIntervalMs(): number {
  return Math.min(Math.max(Math.floor(ttlMs / 2), MIN_SWEEP_INTERVAL_MS), MAX_SWEEP_INTERVAL_MS);
}

function ensureSweeper(): void {
  if (sweeper !== undefined) return;
  sweeper = setInterval(() => evictExpiredEntries(clients, ttlMs, Date.now()), sweepIntervalMs());
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
  evictExpiredEntries(clients, ttlMs, now);
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
    evictLruEntry(clients);
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
