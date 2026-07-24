// Startup discovery and delayed lease recovery for every pending deletion.

import { logger } from '../../../lib/logger.js';

import { STEP_ORDER, type DeletionStepName } from './deletion-step-executor.js';
import { runSagaSteps } from './deletion-saga-runner.service.js';

import type { PrismaClient, TenantDeletionStep } from '@prisma/client';

export type SagaScheduler = (task: () => void, delayMs: number) => void;
export type SagaRunner = (prisma: PrismaClient, tenantId: string) => Promise<void>;

const defaultScheduler: SagaScheduler = (task, delayMs) => {
  if (delayMs <= 0) {
    setImmediate(task);
    return;
  }
  const timer = setTimeout(task, delayMs);
  timer.unref();
};

function firstIncomplete(steps: TenantDeletionStep[]): TenantDeletionStep | undefined {
  return [...steps]
    .sort(
      (a, b) =>
        STEP_ORDER.indexOf(a.step as DeletionStepName) -
        STEP_ORDER.indexOf(b.step as DeletionStepName)
    )
    .find((step) => step.status !== 'done');
}

function scheduleResume(
  prisma: PrismaClient,
  tenantId: string,
  scheduler: SagaScheduler,
  delayMs: number,
  runner: SagaRunner
): void {
  scheduler(() => {
    void resumePendingTenant(prisma, tenantId, scheduler, runner).catch(() => {
      logger.error({ tenantId }, 'Deletion recovery task failed');
    });
  }, delayMs);
}

export async function resumePendingTenant(
  prisma: PrismaClient,
  tenantId: string,
  scheduler: SagaScheduler = defaultScheduler,
  runner: SagaRunner = runSagaSteps
): Promise<void> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, status: 'pending_deletion' },
    select: { id: true },
  });
  if (tenant === null) return;

  const steps = await prisma.tenantDeletionStep.findMany({ where: { tenantId } });
  const step = firstIncomplete(steps);
  if (step === undefined) {
    await runner(prisma, tenantId);
    return;
  }
  if (step.status === 'failed') return;
  if (step.status === 'pending') {
    await runner(prisma, tenantId);
    return;
  }

  const expiresAt = step.leaseExpiresAt?.getTime() ?? 0;
  const remaining = expiresAt - Date.now();
  if (remaining > 0) {
    scheduleResume(prisma, tenantId, scheduler, remaining, runner);
    return;
  }

  const released = await prisma.tenantDeletionStep.updateMany({
    where: {
      id: step.id,
      status: 'in_progress',
      leaseToken: step.leaseToken,
      leaseExpiresAt: step.leaseExpiresAt,
    },
    data: { status: 'pending', leaseToken: null, leaseExpiresAt: null },
  });
  if (released.count === 0) {
    scheduleResume(prisma, tenantId, scheduler, 0, runner);
    return;
  }

  logger.warn({ tenantId, stepId: step.id }, 'Expired deletion step lease recovered');
  await runner(prisma, tenantId);
}

export async function startupSweep(
  prisma: PrismaClient,
  scheduler: SagaScheduler = defaultScheduler,
  runner: SagaRunner = runSagaSteps
): Promise<number> {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'pending_deletion' },
    select: { id: true },
  });
  for (const tenant of tenants) scheduleResume(prisma, tenant.id, scheduler, 0, runner);
  if (tenants.length > 0) {
    logger.info({ tenantCount: tenants.length }, 'Pending deletion recovery scheduled');
  }
  return tenants.length;
}
