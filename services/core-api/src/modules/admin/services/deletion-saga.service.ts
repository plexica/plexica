// deletion-saga.service.ts
// Forward-only GDPR deletion saga orchestrator (S5-700 / ADR-022 Decision 1).
// startDeletionSaga: optimistic-locks tenant into pending_deletion, creates the
// 3 saga step rows, writes an audit entry, and launches the background executor
// via setImmediate — the HTTP 202 response is returned immediately.
// runSagaSteps: processes steps sequentially (schema_drop → realm_delete →
// bucket_delete) with retry + backoff (see deletion-step-executor.ts). When all
// 3 are done, the tenant is marked deleted and an audit entry is written.
// Forward-only: no auto-rollback — failed steps stay failed for manual retry.

import type { PrismaClient, TenantDeletionStep } from '@prisma/client';

import { logger } from '../../../lib/logger.js';
import {
  NotFoundError,
  ValidationError,
  VersionConflictError,
} from '../../../lib/app-error.js';
import { writeAuditEntry } from './audit-log.service.js';
import {
  STEP_ORDER,
  executeStepWithRetry,
  type DeletionStepName,
} from './deletion-step-executor.js';

const STARTABLE_STATUSES = new Set(['active', 'suspended']);
const STUCK_STEP_TIMEOUT_MS = 5 * 60 * 1000;
const SYSTEM_ACTOR_ID = 'system';

export interface SagaStepSummary {
  step: string;
  status: string;
}

export interface DeletionSagaStartResult {
  deletionId: string;
  steps: SagaStepSummary[];
}

/** Starts the deletion saga. Returns a 202-compatible payload; step execution is async. */
export async function startDeletionSaga(
  prisma: PrismaClient,
  tenantId: string,
  expectedVersion: number,
  actorId: string
): Promise<DeletionSagaStartResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, status: true, version: true },
  });
  if (tenant === null) throw new NotFoundError('Tenant not found');
  if (!STARTABLE_STATUSES.has(tenant.status)) {
    throw new ValidationError(`Tenant in status '${tenant.status}' cannot be deleted`);
  }

  const updated = await prisma.tenant.updateMany({
    where: { id: tenantId, version: expectedVersion },
    data: { status: 'pending_deletion', version: { increment: 1 } },
  });
  if (updated.count === 0) {
    throw new VersionConflictError('Tenant version mismatch — re-read state and retry');
  }

  const steps = await Promise.all(
    STEP_ORDER.map((step) =>
      prisma.tenantDeletionStep.upsert({
        where: { tenantId_step: { tenantId, step } },
        create: { tenantId, step, status: 'pending' },
        update: { status: 'pending', attempts: 0, lastError: null },
        select: { id: true, step: true, status: true },
      })
    )
  );

  await writeAuditEntry(prisma, {
    actorId,
    action: 'tenant.delete',
    resourceType: 'tenant',
    resourceId: tenantId,
    tenantId,
    metadata: { slug: tenant.slug, phase: 'started', steps: steps.map((s) => s.step) },
  });

  logger.info({ tenantId, slug: tenant.slug, actorId }, 'Deletion saga started');

  setImmediate(() => {
    runSagaSteps(prisma, tenantId).catch((err) => {
      logger.error({ tenantId, err }, 'Deletion saga background executor crashed');
    });
  });

  return {
    deletionId: tenantId,
    steps: steps.map((s) => ({ step: s.step, status: s.status })),
  };
}

/**
 * Background executor: processes pending deletion steps sequentially. Skips
 * done steps; halts on a failed/in_progress step (manual retry or concurrent
 * executor owns it). When all 3 are done, marks the tenant deleted + audit.
 */
export async function runSagaSteps(prisma: PrismaClient, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, status: true },
  });
  if (tenant === null) {
    logger.warn({ tenantId }, 'Tenant vanished before saga run — aborting');
    return;
  }
  if (tenant.status !== 'pending_deletion') {
    logger.info({ tenantId, status: tenant.status }, 'Skipping saga — tenant not pending_deletion');
    return;
  }

  const allSteps = await prisma.tenantDeletionStep.findMany({ where: { tenantId } });

  for (const stepName of STEP_ORDER) {
    const step = allSteps.find((s) => s.step === stepName);
    if (step === undefined) continue;
    if (step.status === 'done') continue;
    if (step.status === 'failed' || step.status === 'in_progress') {
      logger.info(
        { tenantId, step: stepName, status: step.status },
        'Saga halted — step not pending'
      );
      return;
    }
    const ok = await executeStepWithRetry(prisma, step, tenant.slug);
    if (!ok) return;
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: 'deleted', version: { increment: 1 } },
  });
  await writeAuditEntry(prisma, {
    actorId: SYSTEM_ACTOR_ID,
    action: 'tenant.delete',
    resourceType: 'tenant',
    resourceId: tenantId,
    tenantId,
    metadata: { slug: tenant.slug, phase: 'completed' },
  });
  logger.info({ tenantId, slug: tenant.slug }, 'Deletion saga complete — tenant marked deleted');
}

/** Returns deletion steps for a tenant in saga order (schema_drop → realm_delete → bucket_delete). */
export async function getDeletionStatus(
  prisma: PrismaClient,
  tenantId: string
): Promise<TenantDeletionStep[]> {
  const steps = await prisma.tenantDeletionStep.findMany({ where: { tenantId } });
  return steps.sort(
    (a, b) =>
      STEP_ORDER.indexOf(a.step as DeletionStepName) -
      STEP_ORDER.indexOf(b.step as DeletionStepName)
  );
}

/**
 * Crash recovery (server startup): finds in_progress steps older than the
 * timeout (orphaned by a crash), resets them to pending, and re-launches the
 * background executor for each affected tenant.
 */
export async function startupSweep(prisma: PrismaClient): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_STEP_TIMEOUT_MS);
  const stuck = await prisma.tenantDeletionStep.findMany({
    where: { status: 'in_progress', updatedAt: { lt: cutoff } },
  });

  for (const step of stuck) {
    await prisma.tenantDeletionStep.update({
      where: { id: step.id },
      data: { status: 'pending' },
    });
    logger.warn(
      { stepId: step.id, tenantId: step.tenantId, step: step.step },
      'Reset stuck in_progress deletion step to pending'
    );
  }

  const tenantIds = new Set(stuck.map((s) => s.tenantId));
  for (const tenantId of tenantIds) {
    setImmediate(() => {
      runSagaSteps(prisma, tenantId).catch((err) => {
        logger.error({ tenantId, err }, 'Startup sweep saga executor crashed');
      });
    });
  }

  if (stuck.length > 0) {
    logger.info({ resetCount: stuck.length, tenantCount: tenantIds.size }, 'Startup sweep complete');
  }
}
