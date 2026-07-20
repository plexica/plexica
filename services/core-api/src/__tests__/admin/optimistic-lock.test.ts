// optimistic-lock.test.ts
// Unit tests for withOptimisticLock — verifies the version-check + increment
// logic and ConflictError (409) on version mismatch.
//
// Uses a mock Prisma client: $transaction runs the callback synchronously with
// a fake tx whose $executeRaw returns a configurable row count. This isolates
// the lock logic from the database (a real DB integration test lives elsewhere).

import { describe, expect, it, vi } from 'vitest';

import { ConflictError } from '../../lib/app-error.js';
import { withOptimisticLock } from '../../modules/admin/lib/optimistic-lock.js';

interface FakeTx {
  $executeRaw: ReturnType<typeof vi.fn>;
}

function makeMockPrisma(rowsAffected: number): {
  prisma: unknown;
  tx: FakeTx;
} {
  const tx: FakeTx = {
    $executeRaw: vi.fn().mockResolvedValue(rowsAffected),
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: FakeTx) => Promise<unknown>) => cb(tx)),
  };
  return { prisma, tx };
}

describe('withOptimisticLock', () => {
  it('version match → runs mutation, increments version, returns result', async () => {
    const { prisma, tx } = makeMockPrisma(1);
    const mutationPayload = { status: 'suspended' };
    const mutation = vi.fn().mockResolvedValue(mutationPayload);

    const out = await withOptimisticLock(
      prisma as never,
      'tenant-abc',
      3,
      mutation
    );

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(mutation).toHaveBeenCalledOnce();
    expect(mutation).toHaveBeenCalledWith(tx);
    expect(out).toEqual({ result: mutationPayload, newVersion: 4 });
  });

  it('passes tenantId and expectedVersion into the UPDATE WHERE clause', async () => {
    const { prisma, tx } = makeMockPrisma(1);
    const mutation = vi.fn().mockResolvedValue('ok');

    await withOptimisticLock(prisma as never, 'tenant-xyz', 7, mutation);

    const call = tx.$executeRaw.mock.calls[0]!;
    // Tagged template call: first arg is the SQL string array, rest are params.
    expect(call[0]).toBeInstanceOf(Array);
    const sql = (call[0] as string[]).join('$param');
    expect(sql).toContain('UPDATE core.tenants');
    expect(sql).toContain('version = version + 1');
    expect(sql).toContain('WHERE id = $param::uuid AND version = $param');
    expect(call[1]).toBe('tenant-xyz');
    expect(call[2]).toBe(7);
  });

  it('version mismatch (0 rows) → throws ConflictError mapped to 409 CONFLICT', async () => {
    const { prisma } = makeMockPrisma(0);
    const mutation = vi.fn().mockResolvedValue('should-not-run');

    await expect(
      withOptimisticLock(prisma as never, 'tenant-abc', 3, mutation)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    expect(mutation).not.toHaveBeenCalled();
  });

  it('version mismatch throws a ConflictError instance', async () => {
    const { prisma } = makeMockPrisma(0);
    const mutation = vi.fn();

    await expect(
      withOptimisticLock(prisma as never, 'tenant-abc', 1, mutation)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
