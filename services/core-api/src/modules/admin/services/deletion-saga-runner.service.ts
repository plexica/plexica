// deletion-saga-runner.service.ts
// Sequential forward-only deletion saga execution (S5-700).

import { logger } from '../../../lib/logger.js';

import { writeAuditEntry } from './audit-log.service.js';
import { ensureDeletionContext } from './deletion-context.service.js';
import { STEP_ORDER, executeStepWithRetry } from './deletion-step-executor.js';

import type { PrismaClient } from '@prisma/client';

const SYSTEM_ACTOR_ID = 'system';

/** Runs pending steps in order and marks the tenant deleted after all succeed. */
export async function runSagaSteps(prisma: PrismaClient, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, deletionContext: true },
  });
  if (tenant === null) {
    logger.warn({ tenantId }, 'Tenant vanished before saga run — aborting');
    return;
  }
  if (tenant.status !== 'pending_deletion') {
    logger.info({ tenantId, status: tenant.status }, 'Skipping saga — tenant not pending_deletion');
    return;
  }

  const context = await ensureDeletionContext(prisma, tenantId, tenant.deletionContext);
  const allSteps = await prisma.tenantDeletionStep.findMany({ where: { tenantId } });
  if (allSteps.length === STEP_ORDER.length && allSteps.every((step) => step.status === 'done')) {
    await prisma.tenantDeletionStep.updateMany({
      where: { tenantId, step: 'bucket_delete', status: 'done' },
      data: { status: 'pending' },
    });
    const finalStep = allSteps.find((step) => step.step === 'bucket_delete');
    if (finalStep !== undefined) finalStep.status = 'pending';
  }
  for (const stepName of STEP_ORDER) {
    const step = allSteps.find((candidate) => candidate.step === stepName);
    if (step === undefined) {
      logger.error(
        { tenantId, step: stepName },
        'Deletion saga halted — missing step row. Manual intervention required.'
      );
      await writeAuditEntry(prisma, {
        actorId: SYSTEM_ACTOR_ID,
        action: 'tenant.delete',
        resourceType: 'tenant',
        resourceId: tenantId,
        tenantId,
        metadata: { phase: 'step_missing', missingStep: stepName },
      });
      return;
    }
    if (step.status === 'done') continue;
    if (step.status === 'failed' || step.status === 'in_progress') {
      logger.info(
        { tenantId, step: stepName, status: step.status },
        'Saga halted — step not pending'
      );
      return;
    }
    if (!(await executeStepWithRetry(prisma, step, context))) return;
  }
}
