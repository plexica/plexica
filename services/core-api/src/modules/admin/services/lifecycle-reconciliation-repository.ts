import { randomUUID } from 'node:crypto';

import { Prisma } from '@prisma/client';

import type { PrismaClient, TenantStatus } from '@prisma/client';

export const LIFECYCLE_LEASE_MS = 30_000;

export interface ClaimedLifecycleOperation {
  id: string;
  tenantId: string;
  targetVersion: number;
  desiredStatus: TenantStatus;
  attempts: number;
  leaseToken: string;
}

export async function claimLifecycleOperation(
  prisma: PrismaClient,
  operationId?: string
): Promise<ClaimedLifecycleOperation | null> {
  const leaseToken = randomUUID();
  const idFilter = operationId
    ? Prisma.sql`AND candidate.id = ${operationId}::uuid`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<ClaimedLifecycleOperation[]>(Prisma.sql`
    UPDATE core.tenant_lifecycle_reconciliations AS operation
    SET status = 'in_progress', attempts = operation.attempts + 1,
        lease_token = ${leaseToken}::uuid,
        lease_expires_at = now() + (${LIFECYCLE_LEASE_MS} * interval '1 millisecond'),
        last_error_code = NULL, updated_at = now()
    FROM (
      SELECT candidate.id
      FROM core.tenant_lifecycle_reconciliations AS candidate
      JOIN core.tenants AS tenant ON tenant.id = candidate.tenant_id
      WHERE (
        (candidate.status IN ('pending', 'failed') AND candidate.available_at <= now())
        OR (candidate.status = 'in_progress' AND candidate.lease_expires_at <= now())
      )
      ${idFilter}
      AND NOT EXISTS (
        SELECT 1 FROM core.tenant_lifecycle_reconciliations AS active
        WHERE active.tenant_id = candidate.tenant_id
          AND active.id <> candidate.id
          AND active.status = 'in_progress'
          AND active.lease_expires_at > now()
      )
      ORDER BY candidate.available_at, candidate.created_at
      FOR UPDATE OF candidate, tenant SKIP LOCKED
      LIMIT 1
    ) AS claimed
    WHERE operation.id = claimed.id
    RETURNING operation.id, operation.tenant_id AS "tenantId",
      operation.target_version AS "targetVersion",
      operation.desired_status AS "desiredStatus", operation.attempts,
      operation.lease_token AS "leaseToken"
  `);
  return rows[0] ?? null;
}

export async function failLifecycleOperation(
  prisma: PrismaClient,
  operation: ClaimedLifecycleOperation,
  errorCode: string
): Promise<void> {
  const delaySeconds = Math.min(300, 2 ** Math.min(operation.attempts - 1, 8));
  await prisma.tenantLifecycleReconciliation.updateMany({
    where: { id: operation.id, status: 'in_progress', leaseToken: operation.leaseToken },
    data: {
      status: 'failed',
      availableAt: new Date(Date.now() + delaySeconds * 1_000),
      leaseToken: null,
      leaseExpiresAt: null,
      lastErrorCode: errorCode,
    },
  });
}
