// deletion-saga-status.service.ts
// Ordered deletion saga status reads (S5-700).

import { STEP_ORDER, type DeletionStepName } from './deletion-step-executor.js';

import type { PrismaClient, TenantDeletionStep } from '@prisma/client';

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
