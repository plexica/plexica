// tenant-db-cache-eviction.ts
// Eviction and sweeper logic for the tenant DB client LRU cache (ADR-027).
// Extracted from tenant-db-cache.ts to keep both files under the 200-line
// constitution limit (Rule 4).

import { logger } from './logger.js';

export interface CacheEntryLike {
  client: { $disconnect(): Promise<void> };
  lastUsed: number;
  inFlight: number;
}

export async function disconnectQuietly(
  schemaName: string,
  client: CacheEntryLike['client'],
  reason: string
): Promise<void> {
  try {
    await client.$disconnect();
  } catch (err) {
    logger.warn({ err, schemaName, reason }, 'Tenant DB client disconnect failed');
  }
}

/**
 * Evicts an entry unless it has a callback in flight. $disconnect() would
 * reject a query running right now (Prisma 6 lazy-reconnects on the NEXT
 * query, so the failure would be a transient 500 under burst).
 */
export function evictEntry(
  clients: Map<string, CacheEntryLike>,
  schemaName: string,
  entry: CacheEntryLike,
  reason: string
): void {
  if (entry.inFlight > 0) return;
  clients.delete(schemaName);
  // Fire-and-forget: the request path is synchronous and cannot await.
  void disconnectQuietly(schemaName, entry.client, reason);
  logger.debug({ schemaName, reason, cacheSize: clients.size }, 'Tenant DB client evicted');
}

export function evictExpiredEntries(
  clients: Map<string, CacheEntryLike>,
  ttlMs: number,
  now: number
): void {
  for (const [schemaName, entry] of clients) {
    if (now - entry.lastUsed > ttlMs) evictEntry(clients, schemaName, entry, 'ttl-expired');
  }
}

/**
 * Evicts the coldest IDLE entry. Walks past entries with in-flight callbacks.
 * If every entry is busy (pathological burst), evicts nothing: the cache
 * temporarily exceeds the cap rather than killing live queries.
 */
export function evictLruEntry(clients: Map<string, CacheEntryLike>): void {
  for (const [schemaName, entry] of clients) {
    if (entry.inFlight === 0) {
      evictEntry(clients, schemaName, entry, 'lru-cap');
      return;
    }
  }
}
