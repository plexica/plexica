// File: apps/core-api/src/__tests__/tenant/e2e/tenant-e2e-helpers.ts
//
// Shared helpers for tenant E2E tests.
//
// Extracted from tenant-concurrent.e2e.test.ts (TD-005) so that all tenant E2E
// files can use the same polling utilities instead of hard-coded `setTimeout` sleeps.

import type { FastifyInstance } from 'fastify';

/**
 * Poll `GET /api/tenants/:id` until `tenant.status === expectedStatus` or timeout.
 *
 * Replaces hard-coded `setTimeout` sleeps (TD-005) that were flaky in CI when
 * Keycloak provisioning took longer than the fixed 2-second wait.
 *
 * @param app            - Fastify test instance (light-my-request compatible)
 * @param token          - Bearer token for the request
 * @param tenantId       - Tenant UUID to poll
 * @param expectedStatus - Status string to wait for (e.g. 'ACTIVE')
 * @param maxWaitMs      - Maximum wait time in milliseconds (default 15 000)
 * @param intervalMs     - Polling interval in milliseconds (default 300)
 * @throws Error immediately if the token is rejected (401/403) — this is
 *   always a configuration error, never a timing issue, so failing fast gives
 *   a clear CI signal rather than a 15-second silent timeout.
 * @throws Error after `maxWaitMs` if the expected status is never reached.
 */
export async function waitForTenantStatus(
  app: FastifyInstance,
  token: string,
  tenantId: string,
  expectedStatus: string,
  maxWaitMs = 15_000,
  intervalMs = 300
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/tenants/${tenantId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    // Fail fast on auth errors — spinning to timeout would obscure the real cause.
    if (res.statusCode === 401 || res.statusCode === 403) {
      throw new Error(
        `waitForTenantStatus: auth failure polling tenant ${tenantId} — HTTP ${res.statusCode}`
      );
    }

    if (res.statusCode === 200) {
      let body: { status?: string };
      try {
        body = res.json() as { status?: string };
      } catch {
        throw new Error(
          `waitForTenantStatus: tenant ${tenantId} returned 200 with non-JSON body: ${res.payload}`
        );
      }
      if (body.status === expectedStatus) return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Tenant ${tenantId} did not reach status '${expectedStatus}' within ${maxWaitMs}ms`
  );
}
