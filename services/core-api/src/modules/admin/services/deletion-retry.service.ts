// deletion-retry.service.ts
// Manual retry for a single failed deletion saga step (S5-700 / ADR-022 Decision 1).
// Resets a failed step to pending (attempts = 0, lastError cleared) and
// re-launches the background executor for the tenant. The executor re-runs
// from the first non-done step, so a successful retry cascades to later steps.

import { logger } from '../../../lib/logger.js';
import { NotFoundError, ValidationError } from '../../../lib/app-error.js';

import { writeAuditEntry } from './audit-log.service.js';
import { runSagaSteps } from './deletion-saga.service.js';

import type { PrismaClient, TenantDeletionStep } from '@prisma/client';

/**
 * Resets a failed deletion step to pending and re-launches the saga executor.
 * Only steps with status 'failed' can be retried — pending/in_progress/done
 * steps are rejected with a 422. Returns the updated step (status: pending).
 */
export async function retryFailedStep(
  prisma: PrismaClient,
  stepId: string,
  actorId: string
): Promise<TenantDeletionStep> {
  const step = await prisma.tenantDeletionStep.findUnique({ where: { id: stepId } });
  if (step === null) {
    throw new NotFoundError('Deletion step not found');
  }
  if (step.status !== 'failed') {
    throw new ValidationError(
      `Only failed steps can be retried (current status: '${step.status}')`
    );
  }

  const updated = await prisma.tenantDeletionStep.update({
    where: { id: stepId },
    data: {
      status: 'pending',
      attempts: 0,
      lastError: null,
      leaseToken: null,
      leaseExpiresAt: null,
    },
  });

  await writeAuditEntry(prisma, {
    actorId,
    action: 'tenant.delete',
    resourceType: 'tenant',
    resourceId: step.tenantId,
    tenantId: step.tenantId,
    metadata: { step: step.step, phase: 'retry' },
  });

  logger.info(
    { stepId, tenantId: step.tenantId, step: step.step },
    'Deletion step reset for retry'
  );

  setImmediate(() => {
    runSagaSteps(prisma, step.tenantId).catch(() => {
      logger.error({ tenantId: step.tenantId }, 'Retry saga executor crashed');
    });
  });

  return updated;
}
