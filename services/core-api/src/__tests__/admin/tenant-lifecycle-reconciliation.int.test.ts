import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../lib/database.js';
import { reactivateTenant } from '../../modules/admin/services/tenant-reactivate.service.js';
import { reconcileLifecycleOperation } from '../../modules/admin/services/tenant-lifecycle-reconciler.js';
import { suspendTenant } from '../../modules/admin/services/tenant-suspend.service.js';

import type { LifecycleDependencies } from '../../modules/admin/services/tenant-lifecycle-reconciler.js';

const ACTOR_ID = 'lifecycle-reconciliation-test';
const SLUG = `lifecycle-${process.pid}`;
let tenantId: string;

function dependencies(overrides: Partial<LifecycleDependencies> = {}): LifecycleDependencies {
  return {
    setRealmEnabled: vi.fn(async () => undefined),
    pauseRuntime: vi.fn(async () => undefined),
    resumeRuntime: vi.fn(async () => undefined),
    convergeCache: vi.fn(async () => undefined),
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    where: { slug: SLUG },
    select: { id: true },
  });
  const ids = tenants.map((tenant) => tenant.id);
  await prisma.tenantLifecycleReconciliation.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.platformAuditLog.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
}

beforeAll(async () => {
  await cleanup();
  tenantId = (await prisma.tenant.create({ data: { slug: SLUG, name: 'Lifecycle test' } })).id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('durable tenant lifecycle reconciliation', () => {
  it('commits suspension intent before Keycloak failure and resumes after restart', async () => {
    const failedDependencies = dependencies({
      setRealmEnabled: vi.fn(async () => {
        throw new Error('unavailable');
      }),
    });
    const result = await suspendTenant(prisma, tenantId, 1, ACTOR_ID, (db, operationId) =>
      reconcileLifecycleOperation(db, operationId, failedDependencies)
    );

    expect(result).toMatchObject({
      status: 'suspended', version: 2, reconciliation: 'pending',
    });
    if (!result.operationId) throw new Error('Suspension operation ID missing');
    const operation = await prisma.tenantLifecycleReconciliation.findUniqueOrThrow({
      where: { id: result.operationId },
    });
    expect(operation).toMatchObject({
      status: 'failed', desiredStatus: 'suspended',
      lastErrorCode: 'LIFECYCLE_KEYCLOAK_FAILED',
    });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).status)
      .toBe('suspended');

    await prisma.tenantLifecycleReconciliation.update({
      where: { id: operation.id }, data: { availableAt: new Date(0) },
    });
    expect(await reconcileLifecycleOperation(prisma, operation.id, dependencies())).toBe(true);
    expect((await prisma.tenantLifecycleReconciliation.findUniqueOrThrow({
      where: { id: operation.id },
    })).status).toBe('completed');
  });

  it('keeps reactivation suspended on runtime failure and grants one concurrent lease', async () => {
    const failed = dependencies({
      resumeRuntime: vi.fn(async () => {
        throw new Error('unavailable');
      }),
    });
    const result = await reactivateTenant(prisma, tenantId, 2, ACTOR_ID, (db, operationId) =>
      reconcileLifecycleOperation(db, operationId, failed)
    );
    expect(result).toMatchObject({
      status: 'suspended', version: 3, reconciliation: 'pending',
    });
    if (!result.operationId) throw new Error('Reactivation operation ID missing');
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).status)
      .toBe('suspended');

    await prisma.tenantLifecycleReconciliation.update({
      where: { id: result.operationId }, data: { availableAt: new Date(0) },
    });
    const resumed = dependencies({
      resumeRuntime: vi.fn(async () => new Promise<void>((resolve) => setTimeout(resolve, 50))),
    });
    const outcomes = await Promise.all([
      reconcileLifecycleOperation(prisma, result.operationId, resumed),
      reconcileLifecycleOperation(prisma, result.operationId, resumed),
    ]);
    expect(outcomes.sort()).toEqual([false, true]);
    expect(resumed.resumeRuntime).toHaveBeenCalledOnce();
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).status)
      .toBe('active');
  });

  it('keeps suspension fail-closed when Redis convergence fails', async () => {
    const failed = dependencies({
      convergeCache: vi.fn(async () => {
        throw new Error('unavailable');
      }),
    });
    const result = await suspendTenant(prisma, tenantId, 3, ACTOR_ID, (db, operationId) =>
      reconcileLifecycleOperation(db, operationId, failed)
    );
    expect(result).toMatchObject({
      status: 'suspended', version: 4, reconciliation: 'pending',
    });
    if (!result.operationId) throw new Error('Suspension operation ID missing');
    const operation = await prisma.tenantLifecycleReconciliation.findUniqueOrThrow({
      where: { id: result.operationId },
    });
    expect(operation.lastErrorCode).toBe('LIFECYCLE_CACHE_FAILED');
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).status)
      .toBe('suspended');
  });
});
