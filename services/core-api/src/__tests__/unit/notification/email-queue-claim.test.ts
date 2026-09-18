// unit/notification/email-queue-claim.test.ts
// Unit tests for the email queue worker claim (fix 4): claim() must exclude
// rows whose tenant is not active (JOIN core.tenants), so a row can never be
// claimed/sent for a pending_deletion tenant after the GDPR purge step. Pure
// unit tests — Prisma client mocked, SQL captured.

import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { EmailQueueService } from '../../../modules/notification/email-queue.service.js';

import type { PrismaClient } from '@prisma/client';

function captureClient(rows: unknown[]): {
  client: PrismaClient;
  sql: () => string;
} {
  let captured: { text: string } | null = null;
  const client = {
    $queryRaw: vi.fn(async (query: Prisma.Sql) => {
      const raw = query as unknown as { text: string; values: unknown[] };
      captured = { text: raw.text };
      return rows;
    }),
  } as unknown as PrismaClient;
  return { client, sql: () => captured?.text ?? '' };
}

describe('EmailQueueService.claim — active-tenant guard (fix 4)', () => {
  it('joins core.tenants and skips rows whose tenant is not active', async () => {
    const { client, sql } = captureClient([]);
    await new EmailQueueService(client).claim();

    expect(sql()).toContain('LEFT JOIN core.tenants AS tenant ON tenant.id = candidate.tenant_id');
    expect(sql()).toContain('candidate.tenant_id IS NULL');
    expect(sql()).toContain("tenant.status::text = 'active'");
  });
});
