// unit/notification/consumer-email.test.ts
// Unit tests for the notification email enqueue path (fixes 6 + 3):
// (a) the invitation lookup targets the SINGULAR `invitation` table — the
//     plural `invitations` would dead-letter every tenant-user invite (42P01),
// (b) renderInvitationHtml HTML-escapes tenantName and inviteUrl (CWE-79).
// Pure unit tests — enqueueEmailRaw/email renderer mocked, no DB/SMTP.

import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueEmailRaw: vi.fn(async (_db: unknown, _input: unknown) => 'row-1'),
  readPreferences: vi.fn(),
  resolveChannels: vi.fn(),
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../modules/notification/email-queue.service.js', () => ({
  enqueueEmailRaw: mocks.enqueueEmailRaw,
}));
vi.mock('../../../modules/notification/repository.js', () => ({
  readPreferences: mocks.readPreferences,
}));
vi.mock('../../../modules/notification/service.js', () => ({
  resolveChannels: mocks.resolveChannels,
}));

import { enqueueInviteEmail } from '../../../modules/notification/consumer-email.js';
import { renderInvitationHtml } from '../../../lib/email.js';

import type { RawSqlClient } from '../../../modules/notification/email-queue.service.js';

function captureClient(rows: Array<{ token: string }>): {
  client: RawSqlClient;
  sql: () => string;
} {
  let captured: { text: string } | null = null;
  const client = {
    $queryRaw: vi.fn(async (query: Prisma.Sql) => {
      const raw = query as unknown as { text: string; values: unknown[] };
      captured = { text: raw.text };
      return rows;
    }),
    $executeRaw: vi.fn(async () => 0),
  } as unknown as RawSqlClient;
  return { client, sql: () => captured?.text ?? '' };
}

const INPUT = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  inviteeEmail: 'ada@example.com',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  workspaceName: 'Acme',
  eventId: '33333333-3333-4333-8333-333333333333',
};

describe('enqueueInviteEmail — invitation table name (fix 6, 42P01 dead-letter)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries the singular invitation table, not invitations', async () => {
    const { client, sql } = captureClient([{ token: 'tok-1' }]);
    await enqueueInviteEmail(client, INPUT);

    expect(sql()).toContain('FROM invitation');
    expect(sql()).not.toContain('FROM invitations');
    expect(mocks.enqueueEmailRaw).toHaveBeenCalledTimes(1);
  });

  it('skips the enqueue when no pending invitation exists', async () => {
    const { client } = captureClient([]);
    await enqueueInviteEmail(client, INPUT);
    expect(mocks.enqueueEmailRaw).not.toHaveBeenCalled();
  });

  it('passes the raw workspaceName in the subject, escaped only in the HTML body', async () => {
    const { client } = captureClient([{ token: 'tok-1' }]);
    await enqueueInviteEmail(client, {
      ...INPUT,
      workspaceName: 'A & B "Acme" <acme>',
    });

    const args = mocks.enqueueEmailRaw.mock.calls[0]?.[1] as unknown as {
      subject: string;
      htmlBody: string;
    };
    expect(args.subject).toBe('You\'ve been invited to A & B "Acme" <acme>');
    expect(args.htmlBody).toContain('A &amp; B &quot;Acme&quot; &lt;acme&gt;');
    expect(args.htmlBody).not.toContain('<acme>');
  });
});

describe('renderInvitationHtml — HTML escaping (fix 3, CWE-79)', () => {
  it('escapes tenantName in the body text', () => {
    const html = renderInvitationHtml('https://x.test/invite/tok', '<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes inviteUrl in both the href attribute and the link text', () => {
    const html = renderInvitationHtml('https://x.test/invite?a=1&b=2', 'Acme');
    expect(html).toContain('href="https://x.test/invite?a=1&amp;b=2"');
    expect(html).toContain('>https://x.test/invite?a=1&amp;b=2</a>');
    expect(html).not.toContain('a=1&b=2');
  });
});
