import { ConflictError } from '../../../lib/app-error.js';

import { writeAuditEntry } from './audit-log.service.js';
import { reconcileLifecycleOperation } from './tenant-lifecycle-reconciler.js';

import type { PrismaClient } from '@prisma/client';
import type { TenantStatusChangeResult } from './tenant-suspend.service.js';

export { type TenantStatusChangeResult };

export async function reactivateTenant(
  prisma: PrismaClient,
  tenantId: string,
  expectedVersion: number,
  actorId: string,
  reconcile: typeof reconcileLifecycleOperation = reconcileLifecycleOperation
): Promise<TenantStatusChangeResult> {
  const targetVersion = expectedVersion + 1;
  const operation = await prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.updateMany({
      where: { id: tenantId, version: expectedVersion, status: 'suspended' },
      data: { version: { increment: 1 } },
    });
    if (updated.count !== 1) {
      throw new ConflictError('Tenant cannot be reactivated at the requested version');
    }
    const intent = await tx.tenantLifecycleReconciliation.create({
      data: { tenantId, targetVersion, desiredStatus: 'active' },
      select: { id: true },
    });
    await writeAuditEntry(tx, {
      actorId,
      action: 'tenant.reactivate',
      resourceType: 'tenant',
      resourceId: tenantId,
      tenantId,
      metadata: { operationId: intent.id, targetVersion },
    });
    return intent;
  });

  if (await reconcile(prisma, operation.id)) {
    return { id: tenantId, status: 'active', version: targetVersion };
  }
  return {
    operationId: operation.id,
    id: tenantId,
    status: 'suspended',
    version: targetVersion,
    reconciliation: 'pending',
  };
}
