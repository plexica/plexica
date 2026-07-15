// health.routes.int.test.ts
// Integration tests for GET /api/v1/admin/health (Spec 005, S5-101).
// Requires real infrastructure (PostgreSQL, Redis, Keycloak, Kafka, MinIO).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { requireSuperAdmin } from '../../middleware/require-super-admin.js';
import { healthRoutes } from '../../modules/admin/routes/health.routes.js';
import { createTestServer, makeFullStub, isDbReachable } from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const mockTenantContext: TenantContext = {
  slug: 'system',
  schemaName: 'core',
  realmName: 'master',
  tenantId: '00000000-0000-0000-0000-000000000000',
};

const ADMIN_PREFIX = '/api/v1/admin';

let server: FastifyInstance;
let unauthServer: FastifyInstance;

beforeAll(async () => {
  const dbReachable = await isDbReachable();
  if (!dbReachable) {
    throw new Error(
      'Database is not reachable — tests cannot run. Ensure PostgreSQL is running and DATABASE_URL is configured.'
    );
  }

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(
    async (scope) => {
      scope.addHook('preHandler', requireSuperAdmin);
      await scope.register(healthRoutes);
    },
    { prefix: ADMIN_PREFIX }
  );
  await server.ready();

  unauthServer = await createTestServer();
  await unauthServer.register(
    async (scope) => {
      scope.addHook('preHandler', requireSuperAdmin);
      await scope.register(healthRoutes);
    },
    { prefix: ADMIN_PREFIX }
  );
  await unauthServer.ready();
});

afterAll(async () => {
  await server.close();
  await unauthServer.close();
});

describe('GET /api/v1/admin/health — system health check', () => {
  it('returns 200 with 5 services when all infrastructure is reachable', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ services: Array<{ name: string; status: string; latencyMs: number }> }>();
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.services).toHaveLength(5);
    const names = body.services.map((s) => s.name).sort();
    expect(names).toEqual(['kafka', 'keycloak', 'minio', 'postgres', 'redis']);
  });

  it('every service reports a healthy status in dev environment', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ services: Array<{ status: string }> }>();
    for (const svc of body.services) {
      expect(['healthy', 'degraded', 'down']).toContain(svc.status);
      // In a fully-up dev environment every probe should be healthy.
      expect(svc.status).toBe('healthy');
    }
  });

  it('response shape matches { services: [{ name, status, latencyMs }] }', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/health' });
    const body = res.json<Record<string, unknown>>();
    expect(Object.keys(body)).toEqual(['services']);
    const first = (body['services'] as Array<Record<string, unknown>>)[0]!;
    expect(Object.keys(first).sort()).toEqual(['latencyMs', 'name', 'status']);
    expect(typeof first['latencyMs']).toBe('number');
    expect(typeof first['name']).toBe('string');
    expect(typeof first['status']).toBe('string');
  });

  it('requireSuperAdmin enforced — no auth returns 401', async () => {
    const res = await unauthServer.inject({ method: 'GET', url: '/api/v1/admin/health' });
    expect(res.statusCode).toBe(401);
  });
});
