// jwks-cache.ts
// In-memory JWKS cache keyed by Keycloak realm name.
// Uses jose createRemoteJWKSet; deduplicates concurrent in-flight fetches.

import { createRemoteJWKSet } from 'jose';

import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

interface CacheEntry {
  jwks: RemoteJWKSet;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RemoteJWKSet>>();

let hits = 0;
let misses = 0;

function jwksUrl(realmName: string): string {
  return `${config.KEYCLOAK_URL}/realms/${realmName}/protocol/openid-connect/certs`;
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.createdAt > config.JWKS_CACHE_TTL_MS;
}

export async function getJWKS(realmName: string): Promise<RemoteJWKSet> {
  const entry = cache.get(realmName);
  if (entry !== undefined && !isExpired(entry)) {
    hits++;
    return entry.jwks;
  }

  // Check for an in-flight fetch for the same realm (deduplication)
  const inflight = inFlight.get(realmName);
  if (inflight !== undefined) {
    return inflight;
  }

  misses++;
  logger.debug({ realm: realmName }, 'JWKS cache miss — fetching from Keycloak');

  const promise = (async (): Promise<RemoteJWKSet> => {
    try {
      const url = new URL(jwksUrl(realmName));
      const jwks = createRemoteJWKSet(url);
      cache.set(realmName, { jwks, createdAt: Date.now() });
      return jwks;
    } finally {
      inFlight.delete(realmName);
    }
  })();

  inFlight.set(realmName, promise);
  return promise;
}

export function invalidate(realmName: string): void {
  cache.delete(realmName);
  logger.debug({ realm: realmName }, 'JWKS cache entry invalidated');
}

export function getCacheStats(): CacheStats {
  return { hits, misses, size: cache.size };
}

/**
 * Resets hit/miss counters — useful in test beforeEach to get clean measurements.
 * L-9: counters are module-level and accumulate across tests without this.
 */
export function resetCacheStats(): void {
  hits = 0;
  misses = 0;
}
