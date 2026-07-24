// Distributed CAS/lease execution for forward-only deletion saga steps.

import { randomUUID } from 'node:crypto';

import { logger } from '../../../lib/logger.js';

import { executeBucketDelete } from './deletion-step-bucket-delete.js';
import { executeEventDataPurge } from './deletion-step-event-data-purge.js';
import { completeGdprDeletion } from './deletion-step-gdpr-purge.js';
import { executeRealmDelete } from './deletion-step-realm-delete.js';
import { executeSchemaDrop } from './deletion-step-schema-drop.js';

import type { PrismaClient, TenantDeletionStep } from '@prisma/client';
import type { DeletionContext } from './deletion-context.service.js';

export const STEP_ORDER = [
  'event_data_purge',
  'schema_drop',
  'realm_delete',
  'bucket_delete',
] as const;
export type DeletionStepName = (typeof STEP_ORDER)[number];

export const MAX_ATTEMPTS = 3;
export const STEP_LEASE_MS = 5 * 60 * 1000;
const LEASE_HEARTBEAT_MS = 60_000;
const BACKOFF_BASE_MS = 1000;

type StepDispatcher = (
  step: DeletionStepName,
  prisma: PrismaClient,
  tenantId: string,
  context: DeletionContext
) => Promise<void>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dispatchStep(
  step: DeletionStepName,
  prisma: PrismaClient,
  tenantId: string,
  context: DeletionContext
): Promise<void> {
  switch (step) {
    case 'event_data_purge':
      return executeEventDataPurge(prisma, tenantId, context);
    case 'schema_drop':
      return executeSchemaDrop(prisma, tenantId, context.schemaName);
    case 'realm_delete':
      return executeRealmDelete(tenantId, context.realmName);
    case 'bucket_delete':
      return executeBucketDelete(tenantId, context.bucketName);
  }
}

function errorCode(step: DeletionStepName): string {
  return `DELETION_${step.toUpperCase()}_FAILED`;
}

export async function executeStepWithRetry(
  prisma: PrismaClient,
  step: TenantDeletionStep,
  context: DeletionContext,
  execute: StepDispatcher = dispatchStep
): Promise<boolean> {
  const stepName = step.step as DeletionStepName;
  const leaseToken = randomUUID();
  const claimed = await prisma.tenantDeletionStep.updateMany({
    where: { id: step.id, status: 'pending' },
    data: {
      status: 'in_progress',
      attempts: 0,
      lastError: null,
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + STEP_LEASE_MS),
    },
  });
  if (claimed.count === 0) return false;

  const heartbeat = setInterval(() => {
    void prisma.tenantDeletionStep
      .updateMany({
        where: { id: step.id, status: 'in_progress', leaseToken },
        data: { leaseExpiresAt: new Date(Date.now() + STEP_LEASE_MS) },
      })
      .catch(() => logger.warn({ stepId: step.id }, 'Deletion lease heartbeat failed'));
  }, LEASE_HEARTBEAT_MS);
  heartbeat.unref();

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const owned = await prisma.tenantDeletionStep.updateMany({
        where: { id: step.id, status: 'in_progress', leaseToken },
        data: { attempts: attempt },
      });
      if (owned.count === 0) return false;

      try {
        await execute(stepName, prisma, step.tenantId, context);
        if (stepName === 'bucket_delete') {
          await completeGdprDeletion(prisma, step.tenantId, step.id, leaseToken, context);
          return true;
        }
        const completed = await prisma.tenantDeletionStep.updateMany({
          where: { id: step.id, status: 'in_progress', leaseToken },
          data: { status: 'done', lastError: null, leaseToken: null, leaseExpiresAt: null },
        });
        if (completed.count === 0) return false;
        logger.info({ stepId: step.id, step: stepName, attempt }, 'Deletion step done');
        return true;
      } catch {
        const updated = await prisma.tenantDeletionStep.updateMany({
          where: { id: step.id, status: 'in_progress', leaseToken },
          data: { lastError: errorCode(stepName) },
        });
        if (updated.count === 0) return false;
        logger.warn({ stepId: step.id, step: stepName, attempt }, 'Deletion step attempt failed');
        if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      }
    }

    await prisma.tenantDeletionStep.updateMany({
      where: { id: step.id, status: 'in_progress', leaseToken },
      data: { status: 'failed', leaseToken: null, leaseExpiresAt: null },
    });
    logger.error({ stepId: step.id, step: stepName }, 'Deletion step failed after max attempts');
    return false;
  } finally {
    clearInterval(heartbeat);
  }
}
