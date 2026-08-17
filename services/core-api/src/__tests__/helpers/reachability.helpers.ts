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

/** Returns true when MinIO is reachable. */
export async function isMinioReachable(): Promise<boolean> {
  try {
    const url = new URL('/minio/health/live', config.MINIO_ENDPOINT).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Throws unless PostgreSQL + Keycloak + MinIO are all reachable — the shared
 * pre-flight guard of the tenant lifecycle integration suites. `suiteName`
 * completes the error message: "...must all be reachable for <suiteName>."
 */
export async function requireInfra(suiteName: string): Promise<void> {
  const [dbOk, kcOk, minioOk] = await Promise.all([
    isDbReachable(),
    isKeycloakReachable(),
    isMinioReachable(),
  ]);
  if (!dbOk || !kcOk || !minioOk) {
    throw new Error(`PostgreSQL + Keycloak + MinIO must all be reachable for ${suiteName}.`);
  }
}
