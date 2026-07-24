// Multi-replica lease and crash-window integration coverage for GDPR deletion.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../lib/database.js';
import { resumePendingTenant } from '../../modules/admin/services/deletion-saga-recovery.service.js';
import {
  STEP_LEASE_MS,
  executeStepWithRetry,
} from '../../modules/admin/services/deletion-step-executor.js';

import type { TenantDeletionStep } from '@prisma/client';
import type { DeletionContext } from '../../modules/admin/services/deletion-context.service.js';

const LEASE_SLUG = `del-lease-${process.pid}`;
const CAS_SLUG = `del-cas-${process.pid}`;
const tenantIds: string[] = [];

function context(slug: string): DeletionContext {
  return {
    tenantSlug: slug,
    schemaName: `tenant_${slug.replaceAll('-', '_')}`,
    realmName: `plexica-${slug}`,
    bucketName: `tenant-${slug}`,
    pluginInstallIds: [],
  };
}

async function cleanup(): Promise<void> {
  await prisma.tenantDeletionStep.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.platformAuditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

beforeAll(async () => {
  const existing = await prisma.tenant.findMany({
    where: { slug: { in: [LEASE_SLUG, CAS_SLUG] } },
    select: { id: true },
  });
  tenantIds.push(...existing.map((tenant) => tenant.id));
  await cleanup();
  tenantIds.length = 0;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('deletion saga distributed leases', () => {
  it('delays recovery of a recent in-progress step until its lease expires', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        slug: LEASE_SLUG,
        name: 'Lease recovery fixture',
        status: 'pending_deletion',
        deletionContext: context(LEASE_SLUG),
      },
    });
    tenantIds.push(tenant.id);
    const leaseExpiresAt = new Date(Date.now() + STEP_LEASE_MS);
    const step = await prisma.tenantDeletionStep.create({
      data: {
        tenantId: tenant.id,
        step: 'schema_drop',
        status: 'in_progress',
        leaseToken: randomUUID(),
        leaseExpiresAt,
      },
    });
    for (const name of ['realm_delete', 'bucket_delete']) {
      await prisma.tenantDeletionStep.create({
        data: { tenantId: tenant.id, step: name, status: 'pending' },
      });
    }

    const delays: number[] = [];
    const runner = vi.fn(async () => undefined);
    await resumePendingTenant(prisma, tenant.id, (_task, delay) => delays.push(delay), runner);

    expect(runner).not.toHaveBeenCalled();
    expect(delays).toHaveLength(1);
    expect(delays[0]).toBeGreaterThan(STEP_LEASE_MS - 5_000);
    expect((await prisma.tenantDeletionStep.findUnique({ where: { id: step.id } }))?.status).toBe(
      'in_progress'
    );

    await prisma.tenantDeletionStep.update({
      where: { id: step.id },
      data: { leaseExpiresAt: new Date(Date.now() - 1) },
    });
    await resumePendingTenant(prisma, tenant.id, () => undefined, runner);
    expect(runner).toHaveBeenCalledOnce();
    expect((await prisma.tenantDeletionStep.findUnique({ where: { id: step.id } }))?.status).toBe(
      'pending'
    );
  });

  it('allows only one replica to execute a pending step', async () => {
    const tenant = await prisma.tenant.create({
      data: {
        slug: CAS_SLUG,
        name: 'CAS fixture',
        status: 'pending_deletion',
        deletionContext: context(CAS_SLUG),
      },
    });
    tenantIds.push(tenant.id);
    const step = await prisma.tenantDeletionStep.create({
      data: { tenantId: tenant.id, step: 'schema_drop' },
    });
    const dispatch = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const results = await Promise.all([
      executeStepWithRetry(prisma, step as TenantDeletionStep, context(CAS_SLUG), dispatch),
      executeStepWithRetry(prisma, step as TenantDeletionStep, context(CAS_SLUG), dispatch),
    ]);

    expect(dispatch).toHaveBeenCalledOnce();
    expect(results.sort()).toEqual([false, true]);
  });
});
