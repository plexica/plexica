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
//
// H-1 fix: bounded cache size (MAX_CACHE_SIZE) prevents memory exhaustion from
// unbounded growth if callers pass arbitrary realm names. Realm names are also
// validated against Keycloak's allowed character set before caching, so only
// plausible realm identifiers can populate the cache.

import { createRemoteJWKSet } from 'jose';

import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';

type RemoteJWKSet = ReturnType<typeof createRemoteJWKSet>;

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

// H-1: hard cap on cache entries to bound memory usage.
// A legitimate deployment has one Keycloak realm per tenant. 500 covers large
// multi-tenant installations while preventing unbounded growth from invalid input.
const MAX_CACHE_SIZE = 500;

// H-1: Keycloak realm name format — alphanumeric, hyphens, underscores, dots.
// Max 255 chars (Keycloak admin UI limit). Rejects empty strings and path-traversal
// characters that would corrupt the JWKS URL.
const REALM_NAME_RE = /^[a-zA-Z0-9._-]{1,255}$/;

const cache = new Map<string, RemoteJWKSet>();
const inFlight = new Map<string, Promise<RemoteJWKSet>>();

let hits = 0;
let misses = 0;

function jwksUrl(realmName: string): string {
  return `${config.KEYCLOAK_URL}/realms/${realmName}/protocol/openid-connect/certs`;
}

export async function getJWKS(realmName: string): Promise<RemoteJWKSet> {
  // H-1: validate realm name format before touching the cache or network.
  if (!REALM_NAME_RE.test(realmName)) {
    throw new Error(`Invalid realm name: "${realmName}"`);
  }

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
      // H-1: only cache if we have not hit the size cap.
      if (cache.size < MAX_CACHE_SIZE) {
        cache.set(realmName, jwks);
      } else {
        logger.warn({ realm: realmName, size: cache.size }, 'JWKS cache full — entry not cached');
      }
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
