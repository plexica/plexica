// unit/notification/email-queue.service.test.ts
// Unit tests for email-queue.service.ts primitives (features 006-03, ADR-035):
// (a) the enqueue SQL keeps the correct ON CONFLICT target so the 42P10 Blocker
//     (partial unique index vs bare conflict target) cannot silently regress,
// (b) last_error sanitization strips SMTP-embedded recipient PII (fix 2),
// (c) redactEmail masking. Pure unit tests — no DB, mocked logger.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  enqueueEmailRaw,
  redactEmail,
  sanitizeEmailError,
} from '../../../modules/notification/email-queue.service.js';

import type { RawSqlClient } from '../../../modules/notification/email-queue.service.js';

function captureClient(rows: Array<{ id: string }>): {
  client: RawSqlClient;
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
    $executeRaw: vi.fn(async () => 0),
  } as unknown as RawSqlClient;
  return {
    client,
    sql: () => captured?.text ?? '',
    values: () => captured?.values ?? [],
  };
}

describe('enqueueEmailRaw — ON CONFLICT target (42P10 Blocker guard)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the bare (dedupe_key) conflict target — compatible with a NON-partial unique index', async () => {
    const { client, sql } = captureClient([{ id: 'row-1' }]);
    const id = await enqueueEmailRaw(client, {
      toAddress: 'ada@example.com',
      subject: 'invite',
      htmlBody: '<p>hi</p>',
      emailType: 'workspace.invite',
      eventId: '22222222-2222-4222-8222-222222222222',
    });

    expect(id).toBe('row-1');
    // A partial index (`WHERE dedupe_key IS NOT NULL`) cannot be inferred by a
    // bare `ON CONFLICT (dedupe_key)` (PG 42P10). Migration 013 must therefore
    // stay a plain unique index; the SQL below is the contract to keep in sync.
    expect(sql()).toContain('ON CONFLICT (dedupe_key) DO NOTHING');
    expect(sql()).toContain('INSERT INTO core.email_queue');
  });

  it('binds the eventId as the dedupe_key value', async () => {
    const { client, values } = captureClient([]);
    const eventId = '22222222-2222-4222-8222-222222222222';
    await enqueueEmailRaw(client, {
      toAddress: 'ada@example.com',
      subject: 'invite',
      htmlBody: '<p>hi</p>',
      emailType: 'workspace.invite',
      eventId,
    });
    expect(values()).toContain(eventId);
  });

  it('returns null when the row conflicts (ON CONFLICT DO NOTHING → no row)', async () => {
    const { client } = captureClient([]);
    const id = await enqueueEmailRaw(client, {
      toAddress: 'ada@example.com',
      subject: 'invite',
      htmlBody: '<p>hi</p>',
      emailType: 'workspace.invite',
      eventId: '22222222-2222-4222-8222-222222222222',
    });
    expect(id).toBeNull();
  });

  it('accepts a NULL dedupe_key (non-event email) and still uses the bare conflict target', async () => {
    const { client, sql, values } = captureClient([{ id: 'row-2' }]);
    const id = await enqueueEmailRaw(client, {
      toAddress: 'ada@example.com',
      subject: 'invite',
      htmlBody: '<p>hi</p>',
      emailType: 'workspace.invite',
    });
    expect(id).toBe('row-2');
    expect(sql()).toContain('ON CONFLICT (dedupe_key) DO NOTHING');
    // NULL dedupe_key is bound as a value (plain unique indexes allow NULLs).
    expect(values()).toContain(null);
  });
});

describe('sanitizeEmailError — last_error PII guard (fix 2)', () => {
  it('masks recipient PII embedded in an SMTP 5xx message', () => {
    const error = new Error('550 5.1.1 <alice@example.com>: Recipient address rejected');
    const detail = sanitizeEmailError(error);
    expect(detail).toContain('a***@example.com');
    expect(detail).not.toContain('alice@example.com');
    expect(detail).toContain('Error'); // name retained for diagnosability
  });

  it('keeps a bounded length (≤ 512) and includes the driver code when present', () => {
    const error = new Error('x'.repeat(2000));
    (error as { code?: string }).code = 'EDNS';
    const detail = sanitizeEmailError(error);
    expect(detail.length).toBeLessThanOrEqual(512);
    expect(detail).toContain('EDNS');
  });

  it('falls back safely for non-Error inputs', () => {
    expect(sanitizeEmailError('raw string')).toContain('raw string');
    expect(sanitizeEmailError(null)).toBeTruthy();
  });

  it('masks every address when multiple are present', () => {
    const error = new Error('relay failed for bob@corp.com then alice@example.com');
    const detail = sanitizeEmailError(error);
    expect(detail).not.toContain('bob@corp.com');
    expect(detail).not.toContain('alice@example.com');
  });
});

describe('redactEmail', () => {
  it('masks the local part, keeps the domain', () => {
    expect(redactEmail('alice@example.com')).toBe('a***@example.com');
    expect(redactEmail('no-at-sign')).toBe('***');
  });
});

describe('migration 013 — dedupe index stays a plain unique index (42P10 guard on the real artifact)', () => {
  const migrationPath = resolve(
    process.cwd(),
    'prisma/migrations/013_email_queue_lease/migration.sql'
  );

  function dedupeIndexStatement(): string {
    return readFileSync(migrationPath, 'utf-8')
      .split('\n')
      .map((line) => line.trim())
      .filter(
        (line) => line.startsWith('CREATE UNIQUE INDEX') || line.startsWith('ON core.email_queue')
      )
      .join(' ')
      .replace(/\s+/g, ' ');
  }

  it('declares email_queue_dedupe_key_key as a NON-partial unique index on (dedupe_key)', () => {
    const statement = dedupeIndexStatement();
    expect(statement).toContain('email_queue_dedupe_key_key');
    expect(statement).toContain('ON core.email_queue (dedupe_key)');
    expect(statement).not.toContain('WHERE');
  });

  it('matches the index name Prisma generates for the @unique @map("dedupe_key") field', () => {
    const schemaSql = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf-8');
    expect(schemaSql).toMatch(/dedupeKey\s+String\?\s+@unique\s+@map\("dedupe_key"\)/);
    expect(dedupeIndexStatement()).toContain('email_queue_dedupe_key_key');
  });
});
