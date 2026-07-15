// audit-log.routes.int.test.ts
// Integration tests for GET /api/v1/admin/audit-logs (Spec 005, S5-302).
// Requires real PostgreSQL. Seeds platform_audit_log entries directly.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { requireSuperAdmin } from '../../middleware/require-super-admin.js';
import { auditLogRoutes } from '../../modules/admin/routes/audit-log.routes.js';
import { writeAuditEntry } from '../../modules/admin/services/audit-log.service.js';

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
// Unique actor per test run so cleanup is deterministic and isolated.
const ACTOR_ID = '00000000-aaaa-0000-0000-0000000000aa';
const TENANT_ID = '00000000-bbbb-0000-0000-0000000000bb';

let server: FastifyInstance;
let seededIds: string[] = [];

beforeAll(async () => {
  const dbReachable = await isDbReachable();
  if (!dbReachable) {
    throw new Error(
      'Database is not reachable — tests cannot run. Ensure PostgreSQL is running and DATABASE_URL is configured.'
    );
  }

  // Seed a few audit entries with distinct actions/tenant refs.
  const entries = await Promise.all([
    writeAuditEntry(prisma, {
      actorId: ACTOR_ID,
      action: 'tenant.provision',
      resourceType: 'tenant',
      resourceId: TENANT_ID,
      tenantId: TENANT_ID,
      metadata: { slug: 'test-adm-al' },
    }),
    writeAuditEntry(prisma, {
      actorId: ACTOR_ID,
      action: 'tenant.suspend',
      resourceType: 'tenant',
      resourceId: TENANT_ID,
      tenantId: TENANT_ID,
      metadata: { reason: 'integration-test' },
    }),
    writeAuditEntry(prisma, {
      actorId: ACTOR_ID,
      action: 'plugin.publish',
      resourceType: 'plugin',
      metadata: { pluginSlug: 'test-plugin' },
    }),
  ]);
  seededIds = entries.map((e) => e.id);

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, mockTenantContext, ['super_admin']));
  await server.register(
    async (scope) => {
      scope.addHook('preHandler', requireSuperAdmin);
      await scope.register(auditLogRoutes);
    },
    { prefix: ADMIN_PREFIX }
  );
  await server.ready();
});

afterAll(async () => {
  if (server !== undefined) await server.close();
  await prisma.platformAuditLog.deleteMany({ where: { actorId: ACTOR_ID } });
});

describe('GET /api/v1/admin/audit-logs — platform audit log', () => {
  it('returns paginated audit entries', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/admin/audit-logs' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      data: Array<{ id: string; actorId: string; action: string }>;
      total: number;
      page: number;
      pageSize: number;
    }>();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.total).toBeGreaterThanOrEqual(3);
    const ids = body.data.map((e) => e.id);
    for (const id of seededIds) {
      expect(ids).toContain(id);
    }
  });

  it('filters by action=tenant.provision', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?action=tenant.provision',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ action: string; actorId: string }> }>();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const e of body.data) {
      expect(e.action).toBe('tenant.provision');
    }
    const actors = body.data.map((e) => e.actorId);
    expect(actors).toContain(ACTOR_ID);
  });

  it('filters by tenantId', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/admin/audit-logs?tenantId=${TENANT_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ tenantId: string | null; action: string }> }>();
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    for (const e of body.data) {
      expect(e.tenantId).toBe(TENANT_ID);
    }
    const actions = body.data.map((e) => e.action).sort();
    expect(actions).toContain('tenant.provision');
    expect(actions).toContain('tenant.suspend');
  });

  it('honours pagination params', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?pageSize=1&page=1',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; page: number; pageSize: number }>();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(1);
    expect(body.data).toHaveLength(1);
  });

  it('rejects an invalid action with 422', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/admin/audit-logs?action=bogus.action',
    });
    expect(res.statusCode).toBe(422);
  });
});
