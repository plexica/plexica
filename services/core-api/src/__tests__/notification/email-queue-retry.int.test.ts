// email-queue-retry.int.test.ts
// INT (feature 006-03, review M3): the email retry STATE MACHINE is exercised
// against a real core.email_queue (real rows) and a REAL rejecting SMTP target
// (a local listener answering the greeting with 421). The plan (§10.2)
// classifies this as integration; the tests under src/__tests__/unit are
// mocked, so this drives pending → failed(backoff) → … → dead end-to-end.
//
// Isolation: rows are scoped to a tenant with status 'suspended' — the dev
// worker's claim excludes suspended tenants, and a tenant-scoped claim
// (helpers/email-queue-tenant-scope.helper.ts) claims exactly these rows for
// runTick. Backoff is written by runTick for real, but the clock is
// fast-forwarded between ticks (next_attempt_at → epoch 0) to avoid waiting
// 1s/4s/16s.

import { createServer } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { config } from '../../lib/config.js';
import { prisma } from '../../lib/database.js';
import { EmailQueueService } from '../../modules/notification/email-queue.service.js';
import { runTick } from '../../modules/notification/email-queue-worker.js';
import { TenantScopedEmailQueueService } from '../helpers/email-queue-tenant-scope.helper.js';
import { isDbReachable } from '../helpers/server.helpers.js';

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:net';

const SLUG = `email-queue-retry-${process.pid}`;

const skipIfNoDb = it.skipIf(!(await isDbReachable()));

let tenantId = '';
let rejectingMta: Server;
let service: TenantScopedEmailQueueService;
let originalHost: string;
let originalPort: number;

beforeAll(async () => {
  originalHost = config.SMTP_HOST;
  originalPort = config.SMTP_PORT;

  // Accepts the connection, answers the SMTP greeting with 421, and hangs up.
  rejectingMta = createServer((socket) => {
    socket.write('421 Service not available\r\n');
    socket.destroy();
  });
  await new Promise<void>((resolve) => rejectingMta.listen(0, '127.0.0.1', () => resolve()));
  const address = rejectingMta.address() as AddressInfo;
  config.SMTP_HOST = '127.0.0.1';
  config.SMTP_PORT = address.port;

  const tenant = await prisma.tenant.create({
    data: { slug: SLUG, name: 'Email queue retry test', status: 'suspended' },
  });
  tenantId = tenant.id;
  service = new TenantScopedEmailQueueService(prisma, tenantId);
});

afterAll(async () => {
  await new Promise<void>((resolve) => rejectingMta.close(() => resolve()));
  config.SMTP_HOST = originalHost;
  config.SMTP_PORT = originalPort;
  await prisma.emailQueue.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

/** Fast-forwards the fixture row so the next tick can claim it again. */
async function makeDue(id: string): Promise<void> {
  await prisma.emailQueue.update({
    where: { id },
    data: { nextAttemptAt: new Date(0) },
  });
}

describe('email queue retry state machine (INT, real DB + rejecting SMTP)', () => {
  skipIfNoDb('pending → failed with backoff → dead after max attempts, on real rows', async () => {
    const eventId = crypto.randomUUID();
    const id = await new EmailQueueService(prisma).enqueue({
      tenantId,
      toAddress: 'retry-int@test.plexica.io',
      subject: `retry-int ${eventId}`,
      htmlBody: '<p>retry state machine</p>',
      emailType: 'notification',
      eventId,
    });
    expect(id).not.toBeNull();
    const rowId = id as string;

    try {
      const maxAttempts = config.NOTIFICATION_EMAIL_MAX_ATTEMPTS;
      if (maxAttempts >= 2) {
        // Tick 1 — first send fails → failed, attempts 1, backoff scheduled.
        const t1 = await runTick(10, service);
        expect(t1.failed).toBe(1);
        expect(t1.dead).toBe(0);
        let row = await prisma.emailQueue.findUniqueOrThrow({ where: { id: rowId } });
        expect(row.status).toBe('failed');
        expect(row.attempts).toBe(1);
        // Backoff: next_attempt_at is in the future (base × 4^0 = 1s by default).
        expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
        expect(row.lastError).not.toBeNull();

        // Ticks 2..maxAttempts-1 — attempts increment on each retry after
        // backoff elapses. Derived from config (default 4 → ticks 2-3), never
        // hardcoded (review finding): CI overrides NOTIFICATION_EMAIL_MAX_ATTEMPTS
        // and the suite must trace the same state machine there.
        for (let expected = 2; expected < maxAttempts; expected++) {
          await makeDue(rowId);
          const tick = await runTick(10, service);
          expect(tick.failed).toBe(1);
          row = await prisma.emailQueue.findUniqueOrThrow({ where: { id: rowId } });
          expect(row.status).toBe('failed');
          expect(row.attempts).toBe(expected);
        }

        // Final tick — attempts maxAttempts >= max → dead-lettered.
        await makeDue(rowId);
        const tLast = await runTick(10, service);
        expect(tLast.dead).toBe(1);
        row = await prisma.emailQueue.findUniqueOrThrow({ where: { id: rowId } });
        expect(row.status).toBe('dead');
        expect(row.attempts).toBe(maxAttempts);
        expect(row.lastError).not.toBeNull();
      } else {
        // maxAttempts=1 is a legal config (z.min(1)): the first failure IS the
        // last — the row dead-letters immediately, no intermediate retry tick.
        const t1 = await runTick(10, service);
        expect(t1.dead).toBe(1);
        expect(t1.failed).toBe(0);
        const row = await prisma.emailQueue.findUniqueOrThrow({ where: { id: rowId } });
        expect(row.status).toBe('dead');
        expect(row.attempts).toBe(maxAttempts);
        expect(row.lastError).not.toBeNull();
      }

      // A dead row is never re-claimed by the worker.
      await makeDue(rowId);
      const t5 = await runTick(10, service);
      expect(t5.sent + t5.failed + t5.dead).toBe(0);
    } finally {
      await prisma.emailQueue.deleteMany({ where: { id: rowId } });
    }
  });
});
