// deletion-step-executor.ts
// Step execution + retry-with-backoff for the deletion saga (S5-700).
// Isolated from deletion-saga.service.ts to keep that file under 200 lines
// (Rule 4). The executor sets a step to in_progress, attempts the handler up
// to MAX_ATTEMPTS times with exponential backoff, and records done/failed.

import type { PrismaClient, TenantDeletionStep } from '@prisma/client';

import { logger } from '../../../lib/logger.js';
import { executeSchemaDrop } from './deletion-step-schema-drop.js';
import { executeRealmDelete } from './deletion-step-realm-delete.js';
import { executeBucketDelete } from './deletion-step-bucket-delete.js';

export const STEP_ORDER = ['schema_drop', 'realm_delete', 'bucket_delete'] as const;
export type DeletionStepName = (typeof STEP_ORDER)[number];

export const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dispatchStep(
  step: DeletionStepName,
  prisma: PrismaClient,
  tenantId: string,
  tenantSlug: string
): Promise<void> {
  switch (step) {
    case 'schema_drop':
      return executeSchemaDrop(prisma, tenantId, tenantSlug);
    case 'realm_delete':
      return executeRealmDelete(tenantSlug);
    case 'bucket_delete':
      return executeBucketDelete(tenantSlug);
  }
}

/**
 * Executes a single pending deletion step with retry + exponential backoff.
 * Sets the step to in_progress on entry, increments attempts per try, and
 * sets done on success or failed (with last_error) after MAX_ATTEMPTS.
 *
 * Returns true if the step succeeded, false if it failed all attempts.
 * One step failure halts the saga — later steps stay pending for manual retry.
 */
export async function executeStepWithRetry(
  prisma: PrismaClient,
  step: TenantDeletionStep,
  tenantSlug: string
): Promise<boolean> {
  const stepName = step.step as DeletionStepName;

  await prisma.tenantDeletionStep.update({
    where: { id: step.id },
    data: { status: 'in_progress', attempts: 0, lastError: null },
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await prisma.tenantDeletionStep.update({
      where: { id: step.id },
      data: { attempts: attempt },
    });

    try {
      await dispatchStep(stepName, prisma, step.tenantId, tenantSlug);
      await prisma.tenantDeletionStep.update({
        where: { id: step.id },
        data: { status: 'done', lastError: null },
      });
      logger.info({ stepId: step.id, step: stepName, attempt }, 'Deletion step done');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.tenantDeletionStep.update({
        where: { id: step.id },
        data: { lastError: message },
      });
      logger.warn(
        { stepId: step.id, step: stepName, attempt, message },
        'Deletion step attempt failed'
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }

  await prisma.tenantDeletionStep.update({
    where: { id: step.id },
    data: { status: 'failed' },
  });
  logger.error(
    { stepId: step.id, step: stepName },
    'Deletion step failed after max attempts — manual retry required'
  );
  return false;
}
