// server.helpers.ts
// Shared Fastify server factory and auth stub for integration tests (Spec 003, Phase 18).
// Extracted to keep individual test files under the 200-line constitution limit (Rule 4).

import Fastify from 'fastify';
import multipart from '@fastify/multipart';

import { configureErrorHandler } from '../../middleware/error-handler.js';
import { requireSuperAdmin } from '../../middleware/require-super-admin.js';
import { TRUSTED_AUTH_SYMBOL } from '../../middleware/auth-middleware.js';

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AuthUser } from '../../middleware/auth-middleware.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';

// Reachability probes live in reachability.helpers.ts (Rule 4); re-exported
// here so existing imports from server.helpers.js keep working.
export {
  isDbReachable,
  isKeycloakReachable,
  isRedisReachable,
  isMinioReachable,
  requireInfra,
} from './reachability.helpers.js';

export type TestRole = 'tenant_admin' | 'none';

/** Keycloak user id injected as the authenticated super-admin in admin tests. */
export const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';

/** Route prefix of the super-admin module — mirrors modules/admin/index.ts. */
export const ADMIN_PREFIX = '/api/v1/admin';

/** Tenant context of the master realm used by every super-admin route test. */
export const SYSTEM_TENANT_CONTEXT: TenantContext = {
  slug: 'system',
  schemaName: 'core',
  realmName: 'master',
  tenantId: SUPER_ADMIN_ACTOR,
};

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
    (req as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] = true;
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
    (req as Record<symbol, boolean>)[TRUSTED_AUTH_SYMBOL] = true;

    // Also seed AsyncLocalStorage so withTenantDb fallback path works
    const { enterWithTenant } = await import('../../lib/tenant-context-store.js');
    enterWithTenant(tenantContext);
  };
}

/**
 * Creates a Fastify test server with error handler and multipart support.
 * Caller registers routes after receiving the instance.
 *
 * The multipart limit MUST match production (index.ts). It previously derived
 * its own value — `max(AVATAR_MAX_BYTES, LOGO_MAX_BYTES) * 2` = 4 MB against
 * production's 5 MB — so uploads between 4 and 5 MB were rejected in tests and
 * accepted in production: the tests could not observe the real boundary.
 *
 * TECH DEBT: this is still a value copy, not a single source of truth, because
 * production inlines the literal in index.ts. The constant belongs in
 * lib/config.ts with both call sites importing it. See AGENTS.md §Testing
 * rule 3 ("the test app is the production app") — createTestServer diverging
 * from the real app is the underlying problem this only papers over.
 */
export async function createTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);
  await server.register(multipart, {
    limits: {
      // Keep in sync with services/core-api/src/index.ts (5 MB).
      fileSize: 5 * 1024 * 1024,
    },
  });
  return server;
}

interface AdminTestServerOptions {
  /** Set to false to omit the super-admin auth stub (for 401 tests). */
  auth?: boolean;
  /**
   * Plugins that declare absolute /api/v1/... paths (e.g. dlqRoutes,
   * adminPublishRoutes). Registered at root level — never under ADMIN_PREFIX.
   */
  rootRoutes?: FastifyPluginAsync[];
}

/**
 * Creates a test server mirroring the production admin module
 * (modules/admin/index.ts): super-admin auth stub, then a scope under
 * ADMIN_PREFIX with the requireSuperAdmin preHandler, then the given route
 * plugins. Routes that also self-apply requireSuperAdmin simply run it twice,
 * exactly as in production.
 */
export async function createAdminTestServer(
  routes: FastifyPluginAsync[],
  options: AdminTestServerOptions = {}
): Promise<FastifyInstance> {
  const server = await createTestServer();
  if (options.auth !== false) {
    server.addHook(
      'preHandler',
      makeFullStub(SUPER_ADMIN_ACTOR, SYSTEM_TENANT_CONTEXT, ['super_admin'])
    );
  }
  if (routes.length > 0) {
    await server.register(
      async (scope) => {
        scope.addHook('preHandler', requireSuperAdmin);
        for (const plugin of routes) {
          await scope.register(plugin);
        }
      },
      { prefix: ADMIN_PREFIX }
    );
  }
  for (const plugin of options.rootRoutes ?? []) {
    await server.register(plugin);
  }
  await server.ready();
  return server;
}
