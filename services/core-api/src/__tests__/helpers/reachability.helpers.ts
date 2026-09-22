// reachability.helpers.ts
// Infrastructure reachability probes for integration tests — each returns
// true when the backing service answers, false otherwise. Extracted from
// server.helpers.ts to keep both files under the 200-line limit (Rule 4).

import { config } from '../../lib/config.js';

/** Returns true when PostgreSQL is reachable. */
export async function isDbReachable(): Promise<boolean> {
  try {
    const { prisma } = await import('../../lib/database.js');
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Returns true when Keycloak is reachable. */
export async function isKeycloakReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.KEYCLOAK_URL}/realms/master`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Returns true when Redis is reachable. */
export async function isRedisReachable(): Promise<boolean> {
  try {
    const { redis } = await import('../../lib/redis.js');
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures the shared Redis client is usable, reconnecting it if a prior test
 * file quit() it. The integration project runs in a single isolate:false fork,
 * so teardown in one file can end the singleton for every later file (Bug 1).
 * Returns false only when the Redis server itself is unreachable.
 */
export async function ensureRedis(): Promise<boolean> {
  try {
    const { redis } = await import('../../lib/redis.js');
    if (redis.status === 'ready' || redis.status === 'connect') {
      try {
        return (await redis.ping()) === 'PONG';
      } catch {
        // ping failed although status reads ready/connect — a quit() is still
        // draining the client (ioredis keeps status='ready' until the socket
        // fully closes). Wait for the status to settle before reconnecting.
        await waitForRedisEnd(redis);
      }
    }
    await redis.connect();
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}

/** Waits (bounded) for an ioredis client to leave the ready/connect states. */
async function waitForRedisEnd(redis: { status: string }): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (redis.status !== 'ready' && redis.status !== 'connect') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Returns true when object storage is reachable. */
export async function isStorageReachable(): Promise<boolean> {
  try {
    const url = new URL('/minio/health/live', config.STORAGE_ENDPOINT).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Throws unless PostgreSQL + Keycloak + object storage are all reachable — the shared
 * pre-flight guard of the tenant lifecycle integration suites. `suiteName`
 * completes the error message: "...must all be reachable for <suiteName>."
 */
export async function requireInfra(suiteName: string): Promise<void> {
  const [dbOk, kcOk, storageOk] = await Promise.all([
    isDbReachable(),
    isKeycloakReachable(),
    isStorageReachable(),
  ]);
  if (!dbOk || !kcOk || !storageOk) {
    throw new Error(
      `PostgreSQL + Keycloak + object storage must all be reachable for ${suiteName}.`
    );
  }
}
