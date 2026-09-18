// unit/notification/email-queue-worker.test.ts
// Unit tests for the email queue worker retry/settle paths (CodeRabbit #2/#3):
// every settle is fenced by the row's lease_token, and a stale settle (0 rows
// — row re-claimed after lease expiry or purged by the GDPR saga) is ignored
// and never counted as a retry/dead-letter outcome. Pure unit tests — SMTP,
// config, DB mocked; a fake EmailQueueService injected.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendMailNow: vi.fn(),
}));

vi.mock('../../../lib/config.js', () => ({
  config: {
    NOTIFICATION_EMAIL_MAX_ATTEMPTS: 4,
    NOTIFICATION_EMAIL_BACKOFF_MS: 1_000,
    NOTIFICATION_EMAIL_WORKER_INTERVAL_MS: 1_000,
  },
}));
vi.mock('../../../lib/database.js', () => ({ prisma: {} }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../lib/email.js', () => ({ sendMailNow: mocks.sendMailNow }));

import { runTick } from '../../../modules/notification/email-queue-worker.js';

import type { EmailQueueService } from '../../../modules/notification/email-queue.service.js';
import type { EmailQueueRow } from '../../../modules/notification/types.js';

function row(overrides: Partial<EmailQueueRow> = {}): EmailQueueRow {
  return {
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
    claimedAt: null,
    leaseExpiresAt: null,
    leaseToken: 'tok-1',
    dedupeKey: null,
    ...overrides,
  };
}

function fakeQueue(settle: ReturnType<typeof vi.fn>): EmailQueueService {
  return {
    claim: vi.fn(async () => [row()]),
    settle,
  } as unknown as EmailQueueService;
}

describe('runTick — lease-fenced settles (CodeRabbit #2/#3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the row lease_token to settle(sent) on a successful send', async () => {
    mocks.sendMailNow.mockResolvedValue(undefined);
    const settle = vi.fn(async () => true);
    const result = await runTick(10, fakeQueue(settle));

    expect(settle).toHaveBeenCalledWith(
      'row-1',
      'tok-1',
      expect.objectContaining({ status: 'sent' })
    );
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.dead).toBe(0);
  });

  it('fences the failed retry settle with the row lease_token', async () => {
    mocks.sendMailNow.mockRejectedValue(new Error('EMAIL_SMTP_TIMEOUT'));
    const settle = vi.fn(async () => true);
    const result = await runTick(10, fakeQueue(settle));

    expect(settle).toHaveBeenCalledWith(
      'row-1',
      'tok-1',
      expect.objectContaining({ status: 'failed', attempts: 1 })
    );
    expect(result.failed).toBe(1);
  });

  it('does not count a stale failed-settle (row re-claimed/purged) as a retry', async () => {
    mocks.sendMailNow.mockRejectedValue(new Error('EMAIL_SMTP_TIMEOUT'));
    const settle = vi.fn(async () => false);
    const result = await runTick(10, fakeQueue(settle));

    expect(settle).toHaveBeenCalledWith(
      'row-1',
      'tok-1',
      expect.objectContaining({ status: 'failed' })
    );
    expect(result.failed).toBe(0);
    expect(result.dead).toBe(0);
  });

  it('dead-letters with a fenced settle when attempts reach the max', async () => {
    mocks.sendMailNow.mockRejectedValue(new Error('550 rejected'));
    const settle = vi.fn(async () => true);
    const queue = fakeQueue(settle);
    queue.claim = vi.fn(async () => [row({ attempts: 3 })]) as typeof queue.claim;
    const result = await runTick(10, queue);

    expect(settle).toHaveBeenCalledWith(
      'row-1',
      'tok-1',
      expect.objectContaining({ status: 'dead', attempts: 4 })
    );
    expect(result.dead).toBe(1);
  });
});
