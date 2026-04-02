// jwks-cache.ts
// In-memory JWKS cache keyed by Keycloak realm name.
// Uses jose createRemoteJWKSet; deduplicates concurrent in-flight fetches.
//
// M-08 fix: removed TTL-based eviction from the Map level.
// jose's createRemoteJWKSet handles its own internal HTTP caching and key rotation
// transparently. Discarding the function reference on TTL expiry forces a full
// JWKS round-trip on the next request, which is counterproductive for NFR-03
// (> 99% cache hit rate). The JWKS_CACHE_TTL_MS config key is now unused here
// but retained in config.ts to avoid a breaking env-var change.
// The invalidate() function is preserved for EC-06: forced cache eviction on
// JWSSignatureVerificationFailed (key rotation signal).

import { createRemoteJWKSet } from 'jose';

import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

const cache = new Map<string, RemoteJWKSet>();
const inFlight = new Map<string, Promise<RemoteJWKSet>>();

let hits = 0;
let misses = 0;

function jwksUrl(realmName: string): string {
  return `${config.KEYCLOAK_URL}/realms/${realmName}/protocol/openid-connect/certs`;
}

export async function getJWKS(realmName: string): Promise<RemoteJWKSet> {
  const cached = cache.get(realmName);
  if (cached !== undefined) {
    hits++;
    return cached;
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
      cache.set(realmName, jwks);
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
