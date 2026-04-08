// audit-log.test.ts
// Integration tests for GET /api/v1/tenant/audit-log and action-types.
// Implements: Spec 003, INT-07, Phase 18
// Requires: PostgreSQL, Redis (via makeFullStub → withTenantDb)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { auditLogRoutes } from '../modules/audit-log/routes.js';
import { withTenantDb } from '../lib/tenant-database.js';

import {
  createTestServer,
  makeFullStub,
  isDbReachable,
  isRedisReachable,
} from './helpers/server.helpers.js';
import { seedTenant, cleanupTenant, wipeTenantWorkspaces } from './helpers/db.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';

const TENANT_SLUG = 'test-auditlog';
const ACTOR_ID = 'kcuser-audit-001';

let server: FastifyInstance;
let ctx: TenantContext;

async function seedAuditEntry(
  tenantCtx: TenantContext,
  actorId: string,
  actionType: string
): Promise<string> {
  const row = await withTenantDb(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tx as any).auditLog.create({
      data: {
        actorId,
        actionType,
        targetType: 'workspace',
        targetId: null,
        beforeValue: null,
        afterValue: null,
        ipAddress: null,
      },
      select: { id: true },
    });
  }, tenantCtx);
  return (row as { id: string }).id;
}

async function wipeAuditLog(tenantCtx: TenantContext): Promise<void> {
  await withTenantDb(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx as any).auditLog.deleteMany({});
  }, tenantCtx);
}

const dbOk = await isDbReachable();
const redisOk = await isRedisReachable();
const allOk = dbOk && redisOk;

describe('INT-07 — Audit Log routes', () => {
  beforeAll(async () => {
    if (!allOk) return;
    const seeded = await seedTenant(TENANT_SLUG);
    ctx = seeded.tenantContext;
    server = await createTestServer();
    server.addHook('preHandler', makeFullStub(ACTOR_ID, ctx, ['tenant_admin']));
    await server.register(auditLogRoutes);
    await server.ready();
  });

  afterAll(async () => {
    if (!allOk) return;
    await server.close();
    await cleanupTenant(TENANT_SLUG);
  });

  beforeEach(async () => {
    if (!allOk) return;
    await wipeTenantWorkspaces(ctx);
    await wipeAuditLog(ctx);
  });

  // ── GET /api/v1/tenant/audit-log/action-types ─────────────────────────────

  it.skipIf(!allOk)('GET action-types returns all categories', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tenant/audit-log/action-types',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<Array<{ key: string; label: string; category: string }>>();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const categories = new Set(body.map((e) => e.category));
    expect(categories.has('Authentication')).toBe(true);
    expect(categories.has('Workspace')).toBe(true);
    expect(categories.has('Membership')).toBe(true);
  });

  // ── GET /api/v1/tenant/audit-log — empty state ────────────────────────────

  it.skipIf(!allOk)('returns empty list when no entries exist', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/tenant/audit-log' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number }>();
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  // ── Seeded entries ────────────────────────────────────────────────────────

  it.skipIf(!allOk)('returns seeded audit entries ordered newest first', async () => {
    await seedAuditEntry(ctx, ACTOR_ID, 'workspace.create');
    await seedAuditEntry(ctx, ACTOR_ID, 'workspace.update');

    const res = await server.inject({ method: 'GET', url: '/api/v1/tenant/audit-log' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ actionType: string }>; total: number }>();
    expect(body.total).toBe(2);
    const [first, second] = body.data;
    expect(first?.actionType).toBe('workspace.update');
    expect(second?.actionType).toBe('workspace.create');
  });

  // ── actorId filter ────────────────────────────────────────────────────────

  it.skipIf(!allOk)('filters by actorId', async () => {
    const other = 'kcuser-other-002';
    await seedAuditEntry(ctx, ACTOR_ID, 'workspace.create');
    await seedAuditEntry(ctx, other, 'workspace.delete');

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/tenant/audit-log?actorId=${ACTOR_ID}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ actorId: string }>; total: number }>();
    expect(body.total).toBe(1);
    const [entry] = body.data;
    expect(entry?.actorId).toBe(ACTOR_ID);
  });

  // ── actionType filter ─────────────────────────────────────────────────────

  it.skipIf(!allOk)('filters by actionType', async () => {
    await seedAuditEntry(ctx, ACTOR_ID, 'workspace.create');
    await seedAuditEntry(ctx, ACTOR_ID, 'member.add');

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tenant/audit-log?actionType=member.add',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Array<{ actionType: string }>; total: number }>();
    expect(body.total).toBe(1);
    const [entry] = body.data;
    expect(entry?.actionType).toBe('member.add');
  });

  // ── Pagination ────────────────────────────────────────────────────────────

  it.skipIf(!allOk)('respects page and limit query params', async () => {
    for (let i = 0; i < 5; i++) {
      await seedAuditEntry(ctx, ACTOR_ID, 'workspace.create');
    }

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tenant/audit-log?page=2&limit=2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; total: number; page: number }>();
    expect(body.total).toBe(5);
    expect(body.data).toHaveLength(2);
  });

  // ── 403 for non-admin ─────────────────────────────────────────────────────

  it.skipIf(!allOk)('returns 403 when caller is not tenant admin', async () => {
    const plain = await createTestServer();
    plain.addHook('preHandler', makeFullStub(ACTOR_ID, ctx, []));
    await plain.register(auditLogRoutes);
    await plain.ready();

    const res = await plain.inject({ method: 'GET', url: '/api/v1/tenant/audit-log' });
    expect(res.statusCode).toBe(403);
    await plain.close();
  });

  // ── Validation error ──────────────────────────────────────────────────────

  it.skipIf(!allOk)('returns 422 for invalid actorId (not a UUID)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/tenant/audit-log?actorId=not-a-uuid',
    });
    expect(res.statusCode).toBe(422);
  });
});
