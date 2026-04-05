// rate-limit-helpers.ts
// Shared test helpers for @fastify/rate-limit integration tests.
// Provides a canonical SUPER_ADMIN_USER fixture and a buildTestServer() factory
// that creates an isolated Fastify instance with in-memory rate limiting
// (no Redis, no Keycloak) suitable for unit / integration-level rate-limit tests.

import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { configureErrorHandler } from '../../middleware/error-handler.js';
import tenantRoutes from '../../modules/tenant/tenant-routes.js';
import {
  GLOBAL_RATE_LIMIT,
  rateLimitKeyGenerator,
  rateLimitErrorResponseBuilder,
} from '../../lib/rate-limit-config.js';

import type { FastifyInstance } from 'fastify';
import type { AuthUser } from '../../middleware/auth-middleware.js';

// ---------------------------------------------------------------------------
// Canonical super-admin fixture — matches the master-realm token shape
// expected by requireSuperAdmin() in tenant-routes.ts (ID-004).
// ---------------------------------------------------------------------------
export const SUPER_ADMIN_USER: AuthUser = {
  id: 'test-super-admin',
  email: 'admin@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  realm: 'master',
  roles: ['super_admin'],
};

// ---------------------------------------------------------------------------
// Build an isolated test server with in-memory rate limiting.
// No Redis: @fastify/rate-limit falls back to in-memory store automatically.
// No Keycloak: authMiddleware is mocked at the vi.mock() level in each test
// file; this hook populates request.user for per-user keyGenerator usage.
// ---------------------------------------------------------------------------
export async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  configureErrorHandler(server);

  await server.register(rateLimit, {
    global: true,
    max: GLOBAL_RATE_LIMIT.max,
    timeWindow: GLOBAL_RATE_LIMIT.timeWindow,
    keyGenerator: rateLimitKeyGenerator,
    errorResponseBuilder: rateLimitErrorResponseBuilder,
  });

  // Populate request.user before route handlers and per-route keyGenerators run.
  // authMiddleware is mocked — this hook is what actually sets the user object.
  server.addHook('onRequest', async (request) => {
    request.user = SUPER_ADMIN_USER;
  });

  await server.register(tenantRoutes);
  await server.ready();
  return server;
}
