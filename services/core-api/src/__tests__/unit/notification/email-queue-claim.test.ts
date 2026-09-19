// unit/notification/email-queue-claim.test.ts
// Unit tests for the email queue worker claim (fix 4 + CodeRabbit #4):
// claim() must (a) exclude rows whose tenant is not active (JOIN core.tenants,
// GDPR purge guard) and (b) stamp a per-batch lease_token used to fence every
// settle (mirrors event_outbox.claimOutboxEvents). Pure unit tests — Prisma
// client mocked, SQL + bound values captured.

import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { EmailQueueService } from '../../../modules/notification/email-queue.service.js';

import type { PrismaClient } from '@prisma/client';

function captureClient(
  rows: unknown[],
  executeResult = 0
): {
  client: PrismaClient;
  sql: () => string;
  values: () => unknown[];
} {
  let captured: { text: string; values: unknown[] } | null = null;
  const client = {
    $queryRaw: vi.fn(async (query: Prisma.Sql) => {
      const raw = query as unknown as { text: string; values: unknown[] };
      captured = { text: raw.text, values: raw.values };
      return rows;
    }),
    $executeRaw: vi.fn(async (query: Prisma.Sql) => {
      const raw = query as unknown as { text: string; values: unknown[] };
      captured = { text: raw.text, values: raw.values };
      return executeResult;
    }),
  } as unknown as PrismaClient;
  return {
    client,
    sql: () => captured?.text ?? '',
    values: () => captured?.values ?? [],
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('EmailQueueService.claim — active-tenant guard (fix 4)', () => {
  it('joins core.tenants and skips rows whose tenant is not active', async () => {
    const { client, sql } = captureClient([]);
    await new EmailQueueService(client).claim();

    expect(sql()).toContain('LEFT JOIN core.tenants AS tenant ON tenant.id = candidate.tenant_id');
    expect(sql()).toContain('candidate.tenant_id IS NULL');
    expect(sql()).toContain("tenant.status::text = 'active'");
  });
});

describe('EmailQueueService.claim — delivered_at marker guard (CodeRabbit #10)', () => {
  it('never re-claims rows whose delivered_at marker is set', async () => {
    const { client, sql } = captureClient([]);
    await new EmailQueueService(client).claim();

    // The guard sits at the WHERE level so BOTH candidate branches (due
    // pending/failed AND expired-lease sending) exclude delivered rows.
    expect(sql()).toContain('candidate.delivered_at IS NULL');
  });

  it('returns the delivered_at marker on each claimed row', async () => {
    const { client, sql } = captureClient([]);
    await new EmailQueueService(client).claim();

    expect(sql()).toContain('queue.delivered_at AS "deliveredAt"');
  });
});

describe('EmailQueueService.markDelivered/retireDelivered — effectively-once (CodeRabbit #10)', () => {
  it('markDelivered writes delivered_at fenced by the lease and the delivered_at IS NULL guard', async () => {
    const { client, sql, values } = captureClient([], 1);
    const marked = await new EmailQueueService(client).markDelivered('row-1', 'tok-1');

    expect(marked).toBe(true);
    expect(sql()).toContain('SET delivered_at = now()');
    expect(sql()).toContain('id = $1::uuid');
    expect(sql()).toContain('lease_token = $2::uuid');
    expect(sql()).toContain('delivered_at IS NULL');
    expect(values()).toEqual(['row-1', 'tok-1']);
  });

  it('markDelivered returns false on a stale claim (0 rows)', async () => {
    const { client } = captureClient([], 0);
    const marked = await new EmailQueueService(client).markDelivered('row-1', 'tok-1');
    expect(marked).toBe(false);
  });

  it('retireDelivered settles delivered-but-unsettled rows to sent without re-sending', async () => {
    const { client, sql, values } = captureClient([], 2);
    const now = new Date('2026-01-01T00:00:00Z');
    const retired = await new EmailQueueService(client).retireDelivered(now);

    expect(retired).toBe(2);
    expect(sql()).toContain("SET status = 'sent'");
    expect(sql()).toContain('sent_at = COALESCE(sent_at, delivered_at)');
    expect(sql()).toContain("status = 'sending'");
    expect(sql()).toContain('delivered_at IS NOT NULL');
    expect(sql()).toContain('lease_expires_at IS NOT NULL');
    expect(sql()).toContain('lease_expires_at <= $1::timestamptz');
    expect(sql()).not.toContain('WHERE id');
    expect(values()).toEqual([now]);
  });
});

describe('EmailQueueService.claim — lease fencing token (CodeRabbit #4)', () => {
  it('stamps a crypto.randomUUID() lease_token on every claimed row and returns it', async () => {
    const { client, sql, values } = captureClient([]);
    await new EmailQueueService(client).claim();

    // A fresh UUID is bound for the lease_token cast to uuid.
    const tokens = values().filter(
      (value): value is string => typeof value === 'string' && UUID_RE.test(value)
    );
    expect(tokens).toHaveLength(1);
    expect(sql()).toContain('lease_token = ');
    expect(sql()).toContain('::uuid');
    expect(sql()).toContain('queue.lease_token AS "leaseToken"');
  });

  it('returns the lease_token on each claimed row so the worker can fence its settle', async () => {
    const token = '99999999-9999-4999-8999-999999999999';
    const { client } = captureClient([
      {
        id: 'row-1',
        tenantId: null,
        toAddress: 'ada@example.com',
        subject: 'Invite',
        htmlBody: '<p>hi</p>',
        emailType: 'workspace.invite',
        status: 'sending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
        createdAt: new Date(),
        sentAt: null,
        deliveredAt: null,
        claimedAt: null,
        leaseExpiresAt: null,
        leaseToken: token,
        dedupeKey: null,
      },
    ]);
    const claimed = await new EmailQueueService(client).claim();
    expect(claimed[0]?.leaseToken).toBe(token);
  });
});
