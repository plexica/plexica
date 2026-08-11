// audit-transaction-guard.test.ts
// Regression guard for the "audit write poisons the surrounding transaction"
// bug (SQLSTATE 25P02). The constraint cannot be expressed in the type system
// (see lib/tenant-database.ts for the feasibility evidence), so it is enforced
// at runtime — and that enforcement is what this file locks down.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { config } from '../../lib/config.js';
import { assertNonTransactionalDb, isTransactionClient } from '../../lib/tenant-database.js';
import { updateMaterializedPaths } from '../../modules/workspace/repository.js';
import { writeAuditLog } from '../../modules/audit-log/writer.js';

import type { AuditLogEntry } from '../../modules/audit-log/types.js';

const ENTRY: AuditLogEntry = {
  actorId: 'user-1',
  actionType: 'workspace.created',
  targetType: 'workspace',
  targetId: 'ws-1',
};

/**
 * Shapes verified against the generated tenant client: an interactive
 * transaction client exposes $queryRaw/$executeRaw but NOT $transaction,
 * $connect, $disconnect or $extends.
 */
function makeTxClient(): Record<string, unknown> {
  return {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    workspace: { update: vi.fn() },
  };
}

function makePlainClient(): Record<string, unknown> {
  return {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    $transaction: vi.fn().mockResolvedValue([]),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    workspace: { update: vi.fn() },
  };
}

describe('isTransactionClient', () => {
  it('detects an interactive transaction client', () => {
    expect(isTransactionClient(makeTxClient())).toBe(true);
  });

  it('does not flag a normal Prisma client', () => {
    expect(isTransactionClient(makePlainClient())).toBe(false);
  });

  it('does not flag plain test doubles that are not Prisma clients', () => {
    // Requiring $queryRaw is what keeps hand-rolled mocks out of the guard.
    expect(isTransactionClient({ auditLog: { create: vi.fn() } })).toBe(false);
  });

  it.each([[null], [undefined], ['a string'], [42]])('does not flag %p', (value) => {
    expect(isTransactionClient(value)).toBe(false);
  });
});

describe('assertNonTransactionalDb', () => {
  const originalNodeEnv = config.NODE_ENV;

  afterEach(() => {
    config.NODE_ENV = originalNodeEnv;
  });

  it('throws outside production when handed a transaction client', () => {
    expect(() => assertNonTransactionalDb(makeTxClient(), 'someCaller')).toThrow(
      /someCaller received an interactive \$transaction client/
    );
  });

  it('throws in production too — logging and continuing would be the exact silent data-loss scenario this guard exists to prevent', () => {
    config.NODE_ENV = 'production';
    expect(() => assertNonTransactionalDb(makeTxClient(), 'someCaller')).toThrow(
      /someCaller received an interactive \$transaction client/
    );
  });

  it('mentions the silent-rollback consequence so the message is actionable', () => {
    expect(() => assertNonTransactionalDb(makeTxClient(), 'someCaller')).toThrow(/25P02/);
  });

  it('is a no-op for a non-transactional client', () => {
    expect(() => assertNonTransactionalDb(makePlainClient(), 'someCaller')).not.toThrow();
  });

  it('is a no-op for a non-transactional client in production too', () => {
    config.NODE_ENV = 'production';
    expect(() => assertNonTransactionalDb(makePlainClient(), 'someCaller')).not.toThrow();
  });
});

describe('writeAuditLog transaction safety', () => {
  it('refuses a transaction client instead of poisoning the transaction', async () => {
    const tx = makeTxClient();
    await expect(writeAuditLog(tx, ENTRY)).rejects.toThrow(/writeAuditLog received an interactive/);
    // The INSERT must not be attempted at all — issuing it is what aborts the tx.
    expect((tx['auditLog'] as { create: ReturnType<typeof vi.fn> }).create).not.toHaveBeenCalled();
  });

  it('writes normally on a non-transactional client', async () => {
    const db = makePlainClient();
    await expect(writeAuditLog(db, ENTRY)).resolves.toBeUndefined();
    expect((db['auditLog'] as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalledOnce();
  });

  it('still swallows database failures on a non-transactional client', async () => {
    const db = makePlainClient();
    (db['auditLog'] as { create: ReturnType<typeof vi.fn> }).create.mockRejectedValue(
      new Error('db down')
    );
    // Audit logging is observational here: it must not fail the business action.
    await expect(writeAuditLog(db, ENTRY)).resolves.toBeUndefined();
  });
});

describe('updateMaterializedPaths transaction safety', () => {
  it('refuses a transaction client rather than throwing an opaque TypeError', async () => {
    await expect(updateMaterializedPaths(makeTxClient(), [])).rejects.toThrow(
      /updateMaterializedPaths received an interactive/
    );
  });

  it('opens its own batch transaction on a non-transactional client', async () => {
    const db = makePlainClient();
    await updateMaterializedPaths(db, [{ id: 'ws-1', materializedPath: '/a/b' }]);
    expect(db['$transaction']).toHaveBeenCalledOnce();
  });
});
