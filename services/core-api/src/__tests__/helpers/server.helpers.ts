// server.helpers.ts
// Shared Fastify server factory and auth stub for integration tests (Spec 003, Phase 18).
// Extracted to keep individual test files under the 200-line constitution limit (Rule 4).

import Fastify from 'fastify';
import multipart from '@fastify/multipart';

import { configureErrorHandler } from '../../middleware/error-handler.js';
import { config } from '../../lib/config.js';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthUser } from '../../middleware/auth-middleware.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';

export type TestRole = 'tenant_admin' | 'none';

/**
 * Builds a Fastify preHandler that injects a fake AuthUser without real JWT validation.
 * Must be registered BEFORE tenantContextMiddleware so realm routing works.
 */
export function makeAuthStub(
  userId: string,
  realmName: string,
  roles: string[] = []
): (req: FastifyRequest) => Promise<void> {
  return async (req: FastifyRequest): Promise<void> => {
    const user: AuthUser = {
      id: userId,
      keycloakUserId: userId,
      email: `${userId}@test.plexica.io`,
      firstName: 'Test',
      lastName: 'User',
      realm: realmName,
      roles,
    };
    req.user = user;
  };
}

/**
 * Bypasses both auth and tenant context middleware by directly injecting
 * request.user and request.tenantContext. Useful for ABAC / workspace tests
 * where we control the tenant fixture manually.
 */
export function makeFullStub(
  userId: string,
  tenantContext: TenantContext,
  roles: string[] = []
): (req: FastifyRequest) => Promise<void> {
  return async (req: FastifyRequest): Promise<void> => {
    const user: AuthUser = {
      id: userId,
      keycloakUserId: userId,
      email: `${userId}@test.plexica.io`,
      firstName: 'Test',
      lastName: 'User',
      realm: tenantContext.realmName,
      roles,
    };
    req.user = user;
    req.tenantContext = tenantContext;

    // Also seed AsyncLocalStorage so withTenantDb fallback path works
    const { enterWithTenant } = await import('../../lib/tenant-context-store.js');
    enterWithTenant(tenantContext);
  };
}

/**
 * Creates a Fastify test server with error handler and multipart support.
 * Caller registers routes after receiving the instance.
 */
export async function createTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);
  await server.register(multipart, {
    limits: {
      fileSize: Math.max(config.AVATAR_MAX_BYTES, config.LOGO_MAX_BYTES) * 2,
    },
  });
  return server;
}

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
    const res = await fetch(`http://${config.MINIO_ENDPOINT}/minio/health/live`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
