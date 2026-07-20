// logs.routes.int.test.ts
// Integration tests — GET /api/v1/admin/logs (S5-A02 / Feature 005-10).
//
// The happy-path tests hit real Loki (guarded by isLokiReachable, evaluated at
// module load via top-level await — same pattern as smoke-redpanda.test.ts).
// The 503 failure paths do NOT need Loki: SERVICE_UNAVAILABLE fires when
// LOKI_URL is empty (test-env default), and LOG_QUERY_TIMEOUT stubs global
// fetch to reject with a TimeoutError while pointing LOKI_URL at a dummy URL.
// No vi.mock is used — config is mutated in place and restored, so the real
// requireSuperAdmin config reads keep working.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { config } from '../../lib/config.js';
import { logsRoutes } from '../../modules/admin/routes/logs.routes.js';
import { createTestServer, makeFullStub } from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

let server: FastifyInstance;
let originalLokiUrl = config.LOKI_URL;

/** Returns true when Loki is reachable at config.LOKI_URL. */
async function isLokiReachable(): Promise<boolean> {
  if (!config.LOKI_URL) return false;
  try {
    const res = await fetch(`${config.LOKI_URL}/ready`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

const lokiAvailable = await isLokiReachable();
const skipIfNoLoki = it.skipIf(!lokiAvailable);

beforeAll(async () => {
  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(logsRoutes, { prefix: '/api/v1/admin' });
  await server.ready();
});

afterAll(async () => {
  config.LOKI_URL = originalLokiUrl;
  await server.close();
});

afterEach(() => {
  vi.unstubAllGlobals();
  config.LOKI_URL = originalLokiUrl;
});

describe('Logs — GET /api/v1/admin/logs', () => {
  it('returns 503 SERVICE_UNAVAILABLE when LOKI_URL is not configured', async () => {
    config.LOKI_URL = '';
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 503 LOG_QUERY_TIMEOUT when Loki is too slow', async () => {
    config.LOKI_URL = 'http://loki.test:3100';
    const timeoutErr = new DOMException('Aborted', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutErr));
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs' });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.payload).error.code).toBe('LOG_QUERY_TIMEOUT');
  });

  skipIfNoLoki('returns logs from Loki (happy path)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.logs)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  skipIfNoLoki('accepts a tenant filter and returns the expected shape', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs?tenant=acme&limit=5' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload).logs)).toBe(true);
  });

  skipIfNoLoki('accepts a level filter and returns the expected shape', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs?level=error&limit=5' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload).logs)).toBe(true);
  });

  it('rejects an invalid level filter (422 VALIDATION_ERROR)', async () => {
    // Validation runs before Loki is contacted, so no Loki needed.
    config.LOKI_URL = originalLokiUrl;
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs?level=fatal' });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
  });
});
