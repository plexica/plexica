import { setRealmEnabled } from '../../../lib/keycloak-admin-realm.js';
import { logger } from '../../../lib/logger.js';
import { invalidateTenantLifecycle } from '../../../lib/tenant-context-cache.js';
import { toRealmName } from '../../../lib/tenant-schema-helpers.js';
import { publishTenantStatus } from '../../../middleware/tenant-context.js';
import {
  pauseTenantPluginRuntime,
  resumeTenantPluginRuntime,
} from '../../plugin/services/tenant-runtime-lifecycle.service.js';

import {
  claimLifecycleOperation,
  failLifecycleOperation,
  LIFECYCLE_LEASE_MS,
} from './lifecycle-reconciliation-repository.js';

import type { PrismaClient, TenantStatus } from '@prisma/client';
import type { ClaimedLifecycleOperation } from './lifecycle-reconciliation-repository.js';

export interface LifecycleDependencies {
  setRealmEnabled(realm: string, enabled: boolean): Promise<void>;
  pauseRuntime(tenantId: string, slug: string): Promise<void>;
  resumeRuntime(tenantId: string, slug: string): Promise<void>;
  convergeCache(
    slug: string,
    tenantId: string,
    status: 'active' | 'suspended',
    version: number
  ): Promise<void>;
}

const defaultDependencies: LifecycleDependencies = {
  setRealmEnabled,
  pauseRuntime: pauseTenantPluginRuntime,
  resumeRuntime: resumeTenantPluginRuntime,
  async convergeCache(slug, tenantId, status, version) {
    if (status === 'active') {
      await invalidateTenantLifecycle(slug);
      return;
    }
    if (!(await publishTenantStatus(slug, tenantId, status, version))) {
      throw new Error('CACHE_WRITE_FAILED');
    }
  },
};

class LifecycleSideEffectError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function runSideEffect(code: string, task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch {
    throw new LifecycleSideEffectError(code);
  }
}

async function completeOperation(
  prisma: PrismaClient,
  operation: ClaimedLifecycleOperation,
  activate: boolean
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    if (activate) {
      const activated = await tx.tenant.updateMany({
        where: {
          id: operation.tenantId,
          version: operation.targetVersion,
          status: 'suspended',
        },
        data: { status: 'active' },
      });
      if (activated.count !== 1) return false;
    }
    const completed = await tx.tenantLifecycleReconciliation.updateMany({
      where: { id: operation.id, status: 'in_progress', leaseToken: operation.leaseToken },
      data: {
        status: 'completed',
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        completedAt: new Date(),
      },
    });
    if (completed.count !== 1) throw new Error('LIFECYCLE_LEASE_LOST');
    return true;
  });
}

async function converge(
  prisma: PrismaClient,
  operation: ClaimedLifecycleOperation,
  dependencies: LifecycleDependencies
): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: operation.tenantId },
    select: { id: true, slug: true, status: true, version: true },
  });
  if (!tenant || tenant.version !== operation.targetVersion) {
    return completeOperation(prisma, operation, false);
  }
  const desired = operation.desiredStatus as 'active' | 'suspended';
  if (tenant.status !== 'suspended') return completeOperation(prisma, operation, false);
  const enabled = desired === 'active';
  await runSideEffect('LIFECYCLE_KEYCLOAK_FAILED', () =>
    dependencies.setRealmEnabled(toRealmName(tenant.slug), enabled)
  );
  await runSideEffect('LIFECYCLE_RUNTIME_FAILED', () =>
    enabled
      ? dependencies.resumeRuntime(tenant.id, tenant.slug)
      : dependencies.pauseRuntime(tenant.id, tenant.slug)
  );
  await runSideEffect('LIFECYCLE_CACHE_FAILED', () =>
    dependencies.convergeCache(tenant.slug, tenant.id, desired, tenant.version)
  );
  return completeOperation(prisma, operation, enabled);
}

function failureCode(status: TenantStatus): string {
  return status === 'active' ? 'TENANT_REACTIVATION_FAILED' : 'TENANT_SUSPENSION_FAILED';
}

export async function reconcileLifecycleOperation(
  prisma: PrismaClient,
  operationId?: string,
  dependencies: LifecycleDependencies = defaultDependencies
): Promise<boolean> {
  const operation = await claimLifecycleOperation(prisma, operationId);
  if (!operation) return false;
  const heartbeat = setInterval(() => {
    void prisma.tenantLifecycleReconciliation.updateMany({
      where: { id: operation.id, status: 'in_progress', leaseToken: operation.leaseToken },
      data: { leaseExpiresAt: new Date(Date.now() + LIFECYCLE_LEASE_MS) },
    }).catch(() =>
      logger.warn(
        { operationId: operation.id, code: 'LIFECYCLE_LEASE_HEARTBEAT_FAILED' },
        'Tenant lifecycle lease heartbeat failed'
      )
    );
  }, LIFECYCLE_LEASE_MS / 3);
  heartbeat.unref();
  try {
    return await converge(prisma, operation, dependencies);
  } catch (error) {
    const code =
      error instanceof LifecycleSideEffectError
        ? error.code
        : failureCode(operation.desiredStatus);
    await failLifecycleOperation(prisma, operation, code);
    logger.warn({ operationId: operation.id, tenantId: operation.tenantId, code },
      'Tenant lifecycle reconciliation deferred');
    return false;
  } finally {
    clearInterval(heartbeat);
  }
}
