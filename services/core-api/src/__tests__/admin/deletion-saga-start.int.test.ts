// deletion-saga-start.int.test.ts
// Atomic setup and immediate tenant-cache invalidation coverage (S5-700).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { Redis } from 'ioredis';

import { config } from '../../lib/config.js';
import { prisma } from '../../lib/database.js';
import { configureErrorHandler } from '../../middleware/error-handler.js';
import {
  clearTenantCache,
  resolveTenant,
  tenantContextMiddleware,
} from '../../middleware/tenant-context.js';
import { startDeletionSaga } from '../../modules/admin/services/deletion-saga.service.js';
import { startupSweep } from '../../modules/admin/services/deletion-saga-recovery.service.js';
import { makeAuthStub } from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { SagaRunner } from '../../modules/admin/services/deletion-saga-recovery.service.js';

const ACTOR_ID = 'deletion-start-test-actor';
const CACHE_SLUG = `del-cache-${process.pid}`;
const ROLLBACK_SLUG = `del-rollback-${process.pid}`;

let server: FastifyInstance;
let cacheA: Redis;
let cacheB: Redis;
let cacheTenantId: string;
let rollbackTenantId: string;

function holdImmediateCallbacks(): {
  callbacks: Array<() => void>;
  restore: () => void;
} {
  const callbacks: Array<() => void> = [];
  const implementation = ((callback: () => void) => {
    callbacks.push(callback);
    return 0 as unknown as NodeJS.Immediate;
  }) as typeof setImmediate;
  const spy = vi.spyOn(globalThis, 'setImmediate').mockImplementation(implementation);
  return { callbacks, restore: () => spy.mockRestore() };
}

async function removeFixtures(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: [CACHE_SLUG, ROLLBACK_SLUG] } },
    select: { id: true },
  });
  const tenantIds = tenants.map((tenant) => tenant.id);
  await prisma.tenantDeletionStep.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.platformAuditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantConfig.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

beforeAll(async () => {
  await removeFixtures();
  const [cacheTenant, rollbackTenant] = await Promise.all([
    prisma.tenant.create({ data: { slug: CACHE_SLUG, name: 'Cache deletion test' } }),
    prisma.tenant.create({ data: { slug: ROLLBACK_SLUG, name: 'Rollback deletion test' } }),
  ]);
  cacheTenantId = cacheTenant.id;
  rollbackTenantId = rollbackTenant.id;
  cacheA = new Redis(config.REDIS_URL);
  cacheB = new Redis(config.REDIS_URL);

  server = Fastify({ logger: false });
  configureErrorHandler(server);
  server.get(
    '/tenant-request',
    {
      preHandler: [makeAuthStub('tenant-user', `plexica-${CACHE_SLUG}`), tenantContextMiddleware],
    },
    async () => ({ ok: true })
  );
  await server.ready();
});

beforeEach(async () => clearTenantCache(CACHE_SLUG, cacheA));

afterAll(async () => {
  await clearTenantCache(CACHE_SLUG, cacheA);
  await Promise.all([cacheA.quit(), cacheB.quit()]);
  await server.close();
  await removeFixtures();
  await prisma.$disconnect();
});

describe('deletion saga start transaction', () => {
  it('rejects pending deletion across independent instances sharing Redis', async () => {
    const primed = await server.inject({
      method: 'GET',
      url: '/tenant-request',
      headers: { 'x-tenant-slug': CACHE_SLUG },
    });
    expect(primed.statusCode).toBe(200);
    expect((await resolveTenant(CACHE_SLUG, cacheA))?.status).toBe('active');

    const held = holdImmediateCallbacks();
    try {
      const result = await startDeletionSaga(prisma, cacheTenantId, 1, ACTOR_ID);
      expect(result.steps).toEqual([
        { step: 'event_data_purge', status: 'pending' },
        { step: 'schema_drop', status: 'pending' },
        { step: 'realm_delete', status: 'pending' },
        { step: 'bucket_delete', status: 'pending' },
      ]);
      expect(
        held.callbacks.filter((callback) => callback.name === 'executeDeletionSaga')
      ).toHaveLength(1);
    } finally {
      held.restore();
    }

    const [tenant, steps, audit] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: cacheTenantId } }),
      prisma.tenantDeletionStep.findMany({ where: { tenantId: cacheTenantId } }),
      prisma.platformAuditLog.findFirst({
        where: { tenantId: cacheTenantId, action: 'tenant.delete' },
      }),
    ]);
    expect(tenant).toMatchObject({ status: 'pending_deletion', version: 2 });
    expect(steps).toHaveLength(4);
    expect(audit?.metadata).toMatchObject({ phase: 'started' });

    const [resolvedA, resolvedB] = await Promise.all([
      resolveTenant(CACHE_SLUG, cacheA),
      resolveTenant(CACHE_SLUG, cacheB),
    ]);
    expect(resolvedA?.status).toBe('pending_deletion');
    expect(resolvedB?.status).toBe('pending_deletion');

    const rejected = await server.inject({
      method: 'GET',
      url: '/tenant-request',
      headers: { 'x-tenant-slug': CACHE_SLUG },
    });
    expect(rejected.statusCode).toBe(403);
    expect(JSON.parse(rejected.body).error.code).toBe('TENANT_PENDING_DELETION');

    const scheduled: Array<{ task: () => void; delayMs: number }> = [];
    const runner = vi.fn<SagaRunner>(async (_client, _tenantId) => undefined);
    const found = await startupSweep(
      prisma,
      (task, delayMs) => scheduled.push({ task, delayMs }),
      runner
    );
    expect(found).toBeGreaterThan(0);
    expect(scheduled.some(({ delayMs }) => delayMs === 0)).toBe(true);
    scheduled.forEach(({ task }) => task());
    await vi.waitFor(() => {
      expect(
        runner.mock.calls.some(([client, id]) => client === prisma && id === cacheTenantId)
      ).toBe(true);
    });
  });

  it('rolls back status and all step rows when start audit setup fails', async () => {
    const held = holdImmediateCallbacks();
    try {
      await expect(startDeletionSaga(prisma, rollbackTenantId, 1, '')).rejects.toThrow();
      expect(
        held.callbacks.filter((callback) => callback.name === 'executeDeletionSaga')
      ).toHaveLength(0);
    } finally {
      held.restore();
    }

    const [tenant, steps, audits] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: rollbackTenantId } }),
      prisma.tenantDeletionStep.findMany({ where: { tenantId: rollbackTenantId } }),
      prisma.platformAuditLog.findMany({ where: { tenantId: rollbackTenantId } }),
    ]);
    expect(tenant).toMatchObject({ status: 'active', version: 1 });
    expect(steps).toEqual([]);
    expect(audits).toEqual([]);
  });
});
