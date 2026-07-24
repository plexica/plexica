import { ConflictError } from '../../../lib/app-error.js';

import { writeAuditEntry } from './audit-log.service.js';
import { reconcileLifecycleOperation } from './tenant-lifecycle-reconciler.js';

import type { PrismaClient } from '@prisma/client';

export interface TenantStatusChangeResult {
  id: string;
  status: 'active' | 'suspended';
  version: number;
  operationId?: string;
  reconciliation?: 'pending';
}

export async function suspendTenant(
  prisma: PrismaClient,
  tenantId: string,
  expectedVersion: number,
  actorId: string,
  reconcile: typeof reconcileLifecycleOperation = reconcileLifecycleOperation
): Promise<TenantStatusChangeResult> {
  const targetVersion = expectedVersion + 1;
  const operation = await prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.updateMany({
      where: { id: tenantId, version: expectedVersion, status: 'active' },
      data: { status: 'suspended', version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictError('Tenant cannot be suspended at the requested version');
    }
    const intent = await tx.tenantLifecycleReconciliation.create({
      data: { tenantId, targetVersion, desiredStatus: 'suspended' },
      select: { id: true },
    });
    await writeAuditEntry(tx, {
      actorId,
      action: 'tenant.suspend',
      resourceType: 'tenant',
      resourceId: tenantId,
      tenantId,
      metadata: { operationId: intent.id, targetVersion },
    });
    return intent;
  });

  if (await reconcile(prisma, operation.id)) {
    return { id: tenantId, status: 'suspended', version: targetVersion };
  }
  return {
    operationId: operation.id,
    id: tenantId,
    status: 'suspended',
    version: targetVersion,
    reconciliation: 'pending',
  };
}
