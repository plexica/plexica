// unit/notification/email-queue-settle.test.ts
// Unit tests for the lease-fenced settle (CodeRabbit #4, #10): every settle
// must predicate on id AND lease_token, the sent settle additionally requires
// the delivered_at marker (deliveredAt not null), and a 0-row update (stale
// claim — row re-claimed after lease expiry or already purged by the GDPR
// deletion saga) is logged and ignored (returns false). Pure unit tests —
// Prisma emailQueue.updateMany mocked, logger mocked.

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { settleEmailQueue } from '../../../modules/notification/email-queue-settle.js';

import type { PrismaClient } from '@prisma/client';

function dbWith(updateMany: ReturnType<typeof vi.fn>): PrismaClient {
  return { emailQueue: { updateMany } } as unknown as PrismaClient;
}

describe('settleEmailQueue — lease fencing (CodeRabbit #4)', () => {
  it('predicates every settle (sent/failed/dead) on id AND lease_token', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const db = dbWith(updateMany);

    await settleEmailQueue(db, 'row-1', 'tok-1', {
      status: 'sent',
      sentAt: new Date('2026-01-01'),
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'row-1', leaseToken: 'tok-1' }),
      })
    );

    await settleEmailQueue(db, 'row-1', 'tok-1', {
      status: 'failed',
      attempts: 1,
      nextAttemptAt: new Date('2026-01-02'),
      lastError: new Error('x'),
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'row-1', leaseToken: 'tok-1' }),
      })
    );

    await settleEmailQueue(db, 'row-1', 'tok-1', {
      status: 'dead',
      attempts: 4,
      lastError: new Error('x'),
    });
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'row-1', leaseToken: 'tok-1' }),
      })
    );
    expect(updateMany).toHaveBeenCalledTimes(3);
  });

  it('guards the sent settle on deliveredAt not null (delivery marker, CodeRabbit #10)', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    await settleEmailQueue(dbWith(updateMany), 'row-1', 'tok-1', {
      status: 'sent',
      sentAt: new Date('2026-01-01'),
    });

    // A row may only be settled to 'sent' once the delivered_at marker is
    // present — otherwise the delivered email would be reclassifiable/re-sent.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row-1', leaseToken: 'tok-1', deliveredAt: { not: null } },
      })
    );
  });

  it('clears the lease token and lease fields on settle so the row is not re-claimed', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    await settleEmailQueue(dbWith(updateMany), 'row-1', 'tok-1', {
      status: 'sent',
      sentAt: new Date('2026-01-01'),
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'sent',
          leaseToken: null,
          leaseExpiresAt: null,
          claimedAt: null,
        }),
      })
    );
  });

  it('returns true when the fenced update affects exactly one row', async () => {
    const settled = await settleEmailQueue(
      dbWith(vi.fn(async () => ({ count: 1 }))),
      'row-1',
      'tok-1',
      {
        status: 'sent',
        sentAt: new Date('2026-01-01'),
      }
    );
    expect(settled).toBe(true);
  });

  it('returns false and ignores the update on a stale claim (0-row update)', async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const settled = await settleEmailQueue(dbWith(updateMany), 'row-1', 'stale-tok', {
      status: 'sent',
      sentAt: new Date('2026-01-01'),
    });
    expect(settled).toBe(false);
    // No state was reclassified: the row is owned by the successor claim.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'row-1', leaseToken: 'stale-tok' }),
      })
    );
  });
});
