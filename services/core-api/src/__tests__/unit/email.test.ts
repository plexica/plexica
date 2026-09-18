// unit/email.test.ts
// Unit tests for lib/email.ts subject handling (CodeRabbit round-2): the SMTP
// subject must carry the RAW tenant name while renderInvitationHtml keeps the
// HTML body escaped — HTML-escaping a plain-text subject shows `A &amp; B`.
// Pure unit tests — EmailQueueService enqueue mocked, no DB/SMTP.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(async (_input: unknown) => 'row-1'),
}));

vi.mock('../../lib/config.js', () => ({
  config: {
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_FROM: 'no-reply@plexica.local',
    INVITATION_EXPIRY_DAYS: 7,
  },
}));
vi.mock('../../lib/database.js', () => ({ prisma: {} }));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../modules/notification/email-queue.service.js', () => ({
  EmailQueueService: class {
    async enqueue(input: unknown): Promise<string> {
      return mocks.enqueue(input);
    }
  },
}));

import { sendInvitationEmail } from '../../lib/email.js';

describe('sendInvitationEmail — raw subject, escaped HTML body', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the raw tenantName in the subject, escaped only in the HTML body', async () => {
    await sendInvitationEmail('ada@example.com', 'https://x.test/invite/tok', 'A & B "Acme"');

    const input = mocks.enqueue.mock.calls[0]?.[0] as unknown as {
      subject: string;
      htmlBody: string;
    };
    expect(input.subject).toBe('You\'ve been invited to A & B "Acme"');
    expect(input.htmlBody).toContain('A &amp; B &quot;Acme&quot;');
    expect(input.htmlBody).not.toContain('A & B "Acme"');
  });

  it('keeps the inviteUrl escaped in the HTML body, raw in no subject field', async () => {
    await sendInvitationEmail('ada@example.com', 'https://x.test/invite?a=1&b=2', 'Acme');

    const input = mocks.enqueue.mock.calls[0]?.[0] as unknown as {
      subject: string;
      htmlBody: string;
    };
    expect(input.subject).toBe("You've been invited to Acme");
    expect(input.htmlBody).toContain('a=1&amp;b=2');
    expect(input.htmlBody).not.toContain('a=1&b=2');
  });
});
