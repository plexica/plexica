// optimistic-lock.ts
// Reusable optimistic locking helper for tenant status transitions.
// Implements ADR-022 Decision 4 — concurrent admin actions on the same tenant
// are serialized via a version column on core.tenants.
//
// Flow:
//   1. Start a transaction.
//   2. UPDATE core.tenants SET version = version + 1
//        WHERE id = $tenantId AND version = $expectedVersion
//   3. If 0 rows affected → another writer won; throw ConflictError (409).
//   4. If 1 row affected → run the caller's mutation inside the same tx.
//   5. Return { result, newVersion: expectedVersion + 1 }.

import { ConflictError } from '../../../lib/app-error.js';

import type { PrismaClient, Prisma } from '@prisma/client';


export interface OptimisticLockResult<T> {
  result: T;
  newVersion: number;
}

export async function withOptimisticLock<T>(
  prisma: PrismaClient,
  tenantId: string,
  expectedVersion: number,
  mutation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<OptimisticLockResult<T>> {
  return prisma.$transaction(async (tx) => {
    const rowsAffected = await tx.$executeRaw`
      UPDATE core.tenants
      SET version = version + 1
      WHERE id = ${tenantId}::uuid AND version = ${expectedVersion}
    `;

    if (rowsAffected === 0) {
      throw new ConflictError(
        `Version mismatch: expected ${expectedVersion} for tenant ${tenantId}`
      );
    }

    const result = await mutation(tx);
    return { result, newVersion: expectedVersion + 1 };
  });
}
