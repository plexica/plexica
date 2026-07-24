// deletion-saga-start.service.ts
// Atomic setup and post-commit launch for the GDPR deletion saga (S5-700).

import { logger } from '../../../lib/logger.js';
import { NotFoundError, ValidationError, VersionConflictError } from '../../../lib/app-error.js';
import { publishTenantStatus } from '../../../middleware/tenant-context.js';

import { writeAuditEntry } from './audit-log.service.js';
import { captureDeletionContext } from './deletion-context.service.js';
import { STEP_ORDER } from './deletion-step-executor.js';
import { runSagaSteps } from './deletion-saga-runner.service.js';

import type { PrismaClient } from '@prisma/client';

export interface SagaStepSummary {
  step: string;
  status: string;
}

export interface DeletionSagaStartResult {
  deletionId: string;
  steps: SagaStepSummary[];
}

/** Atomically prepares the saga, then invalidates tenant access before launch. */
export async function startDeletionSaga(
  prisma: PrismaClient,
  tenantId: string,
  expectedVersion: number,
  actorId: string
): Promise<DeletionSagaStartResult> {
  const deletionContext = await captureDeletionContext(prisma, tenantId);
  const committed = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, status: true },
    });
    if (tenant === null) throw new NotFoundError('Tenant not found');
    if (tenant.status !== 'active' && tenant.status !== 'suspended') {
      throw new ValidationError(`Tenant in status '${tenant.status}' cannot be deleted`);
    }

    const updated = await tx.tenant.updateMany({
      where: { id: tenantId, version: expectedVersion, status: tenant.status },
      data: {
        status: 'pending_deletion',
        deletionContext,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new VersionConflictError('Tenant version mismatch — re-read state and retry');
    }

    const steps: SagaStepSummary[] = [];
    for (const step of STEP_ORDER) {
      const row = await tx.tenantDeletionStep.upsert({
        where: { tenantId_step: { tenantId, step } },
        create: { tenantId, step, status: 'pending' },
        update: {
          status: 'pending',
          attempts: 0,
          lastError: null,
          leaseToken: null,
          leaseExpiresAt: null,
        },
        select: { step: true, status: true },
      });
      steps.push(row);
    }

    await writeAuditEntry(tx, {
      actorId,
      action: 'tenant.delete',
      resourceType: 'tenant',
      resourceId: tenantId,
      tenantId,
      metadata: { phase: 'started', steps: steps.map((s) => s.step) },
    });

    return { slug: tenant.slug, steps };
  });

  await publishTenantStatus(committed.slug, tenantId, 'pending_deletion', expectedVersion + 1);
  logger.info({ tenantId }, 'Deletion saga started');

  setImmediate(function executeDeletionSaga() {
    runSagaSteps(prisma, tenantId).catch(() => {
      logger.error({ tenantId }, 'Deletion saga background executor crashed');
    });
  });

  return { deletionId: tenantId, steps: committed.steps };
}
