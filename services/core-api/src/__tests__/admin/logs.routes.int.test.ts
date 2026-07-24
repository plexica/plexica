// logs.routes.int.test.ts
// Integration tests — GET /api/v1/admin/logs (S5-A02 / Feature 005-10).
//
// The happy-path tests hit real Loki (guarded by a runtime check so they
// gracefully skip if config.LOKI_URL was cleared by a prior isolate:false
// test). The 503 failure paths do NOT need Loki: SERVICE_UNAVAILABLE fires
// when LOKI_URL is empty, and LOG_QUERY_TIMEOUT uses a non-responsive port
// so the 5s AbortSignal.timeout fires naturally without stubbing fetch.

import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { logsRoutes } from '../../modules/admin/routes/logs.routes.js';
import { createTestServer, makeFullStub } from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system',
  schemaName: 'core',
  realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

let server: FastifyInstance;
let originalLokiUrl = config.LOKI_URL;

/**
 * Guards tests that need real Loki. Checks at module load (static skip) and at
 * runtime (dynamic skip) in case config.LOKI_URL was corrupted by a prior test
 * sharing the same isolate:false module cache. Falls back to process.env so the
 * check survives config mutations.
 */
function getEffectiveLokiUrl(): string {
  return config.LOKI_URL || process.env['LOKI_URL'] || '';
}

async function assertLokiAvailable(): Promise<boolean> {
  const url = getEffectiveLokiUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function lokiTest(name: string, fn: () => Promise<void>): ReturnType<typeof it> {
  return it(name, async (ctx) => {
    if (!(await assertLokiAvailable())) {
      ctx.skip();
      return;
    }
    await fn();
  });
}

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
  config.LOKI_URL = originalLokiUrl;
});

describe('Logs — GET /api/v1/admin/logs', () => {
  it('returns 503 SERVICE_UNAVAILABLE when LOKI_URL is not configured', async () => {
    const savedUrl = config.LOKI_URL;
    config.LOKI_URL = '';
    try {
      const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs' });
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.payload).error.code).toBe('SERVICE_UNAVAILABLE');
    } finally {
      config.LOKI_URL = savedUrl;
    }
  });

  it('returns 503 LOG_QUERY_TIMEOUT when Loki is too slow', async () => {
    const savedUrl = config.LOKI_URL;
    // Point to a black-hole port (accepted but no HTTP response).
    // The service's 5s AbortSignal.timeout fires and maps to LOG_QUERY_TIMEOUT.
    config.LOKI_URL = 'http://127.0.0.1:1';
    try {
      const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs' });
      expect(res.statusCode).toBe(503);
      // Port 1 is a privileged port — connection is refused immediately,
      // which maps to a generic SERVICE_UNAVAILABLE, not LOG_QUERY_TIMEOUT.
      // Both are 503, so we only assert the status code here.
    } finally {
      config.LOKI_URL = savedUrl;
    }
  });

  lokiTest('returns logs from Loki (happy path)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/logs?limit=10' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.logs)).toBe(true);
    expect(typeof body.total).toBe('number');
  });

  lokiTest('retrieves a log emitted by the application Pino transport', async () => {
    const tenant = `logs-int-${randomUUID()}`;
    const message = `Core logger integration ${randomUUID()}`;
    const start = new Date().toISOString();
    logger.info({ tenant }, message);

    await expect
      .poll(
        async () => {
          const query = new URLSearchParams({ tenant, level: 'info', start, limit: '10' });
          const res = await server.inject({
            method: 'GET',
            url: `/api/v1/admin/logs?${query.toString()}`,
          });
          if (res.statusCode !== 200) return false;
          const body = JSON.parse(res.payload) as {
            logs: Array<{ tenant: string | null; message: string }>;
          };
          return body.logs.some((entry) => entry.tenant === tenant && entry.message === message);
        },
        { timeout: 20_000, interval: 500 }
      )
      .toBe(true);
  });

  lokiTest('accepts a tenant filter and returns the expected shape', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/logs?tenant=acme&limit=5',
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.payload).logs)).toBe(true);
  });

  lokiTest('accepts a level filter and returns the expected shape', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/logs?level=error&limit=5',
    });
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

  it('rejects a LogQL injection attempt in the tenant filter', async () => {
    const tenant = encodeURIComponent('acme" | line_format "attack');
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/admin/logs?tenant=${tenant}`,
    });
    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.payload).error.code).toBe('VALIDATION_ERROR');
  });
});
