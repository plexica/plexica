// tenant-context.helpers.ts
// Shared test helpers for tenant-context.test.ts.
// Extracted to keep the test file under the 200-line constitution limit (Rule 4).

import Fastify from 'fastify';

import { configureErrorHandler } from '../../middleware/error-handler.js';
import { tenantContextMiddleware } from '../../middleware/tenant-context.js';

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AuthUser } from '../../middleware/auth-middleware.js';

/**
 * Returns a Fastify preHandler that sets request.user to the given realm.
 * Must be registered BEFORE tenantContextMiddleware so H-2 realm validation works.
 */
export function makeAuthStub(realm: string): (request: FastifyRequest) => Promise<void> {
  return async (request: FastifyRequest): Promise<void> => {
    const user: AuthUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      realm,
      roles: [],
    };
    request.user = user;
  };
}

/**
 * Creates a Fastify server with a single /test-realm route that:
 *   1. Stubs request.user with the provided realm
 *   2. Runs tenantContextMiddleware
 *   3. Returns { ok: true } on success
 *
 * Used to test H-2 realm-mismatch behaviour without polluting the module-level
 * server's route table.
 *
 * @note This function triggers tenantContextMiddleware internally, which populates
 *   the module-level `tenantCache` in tenant-context.ts as a side effect.
 *   Tests that call this helper should invoke `clearTenantCache()` in `beforeEach`
 *   to ensure cache state does not leak between test cases.
 */
export async function createServerWithRealmStub(realm: string): Promise<FastifyInstance> {
  const s = Fastify({ logger: false });
  configureErrorHandler(s);
  s.get(
    '/test-realm',
    { preHandler: [makeAuthStub(realm), tenantContextMiddleware] },
    async () => ({ ok: true })
  );
  await s.ready();
  return s;
}
