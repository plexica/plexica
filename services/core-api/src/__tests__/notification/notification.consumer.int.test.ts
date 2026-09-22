// notification.consumer.int.test.ts
// INT: notification consumer pipeline (features 006-01/05, ADR-035 §5.2) against
// a real stack — DB + Redis + real event encryption. Exercises the REAL
// handleNotificationMessage path: encrypt → decrypt → insert-ignore (F6) →
// 100/min/user cap (F5) → prefs → SSE + email. Covers invite → row + SSE < 2s,
// plugin emission, cap breach (row persisted, delivery suppressed, counter
// incremented), redelivery dedupe (single row, no quota on replay), DLQ.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { config } from '../../lib/config.js';
import { prisma } from '../../lib/database.js';
import { redis } from '../../lib/redis.js';
import { connectionManager } from '../../modules/notification/connection-manager.js';
import { cleanupTenant, seedTenant, seedUserProfile } from '../helpers/db.helpers.js';
import { ensureRedis, isDbReachable } from '../helpers/server.helpers.js';
import {
  asServerResponse,
  createFakeSseResponse,
  hasSseEvent,
  waitForSseEvent,
} from '../helpers/notification-sse.helpers.js';

import {
  capKey,
  CONSUMER_EMAIL,
  CONSUMER_USER_ID,
  ensureTenantEventKey,
  notificationCount,
  processInviteEvent,
  processPluginEvent,
} from './notification.int.helpers.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

const SLUG = 'notif-int-consumer';

// ensureRedis() reconnects the shared ioredis singleton if an earlier
// isolate:false file quit() it — the consumer pipeline drives the SSE cap
// counter (F5) through Redis, so the suite must not silently skip on a client
// that merely ended.
const skipIfNoStack = it.skipIf(!(await isDbReachable()) || !(await ensureRedis()));

let ctx: TenantContext;
let keyVersion: number;
let key: Buffer;

beforeAll(async () => {
  const seeded = await seedTenant(SLUG);
  ctx = seeded.tenantContext;
  await seedUserProfile(ctx, CONSUMER_USER_ID, CONSUMER_EMAIL, 'Consumer User', CONSUMER_USER_ID);
  const provisioned = await ensureTenantEventKey(prisma, ctx.tenantId);
  keyVersion = provisioned.keyVersion;
  key = provisioned.key;
});

afterAll(async () => {
  // Do NOT teardown the shared prisma/redis singletons here: the integration
  // project runs in one isolate:false fork, so $disconnect()/quit() would kill
  // the shared client for every later test file (Bug 1 — health.routes.int
  // broke because the redis probe got "Connection is closed."). Prisma reconnects
  // lazily and the next ensureRedis() reconnects Redis, so dropping the calls is
  // safe; cleanupTenant still purges the tenant + tenant-scoped outbox/DLQ rows.
  await prisma.emailQueue.deleteMany({ where: { tenantId: ctx.tenantId } });
  await cleanupTenant(SLUG);
});

describe('notification consumer (INT)', () => {
  skipIfNoStack('invite → persisted row + SSE delivered < 2s (NFR-006-2)', async () => {
    const res = createFakeSseResponse();
    const handle = connectionManager.connect(ctx.slug, CONSUMER_USER_ID, asServerResponse(res));
    try {
      const eventId = crypto.randomUUID();
      const started = Date.now();
      await processInviteEvent(ctx, keyVersion, key, { eventId, inviteeEmail: CONSUMER_EMAIL });
      await waitForSseEvent(res, 'notification');
      expect(Date.now() - started).toBeLessThan(2_000);
      expect(await notificationCount(ctx, eventId)).toBe(1);
    } finally {
      handle.close();
    }
  });

  skipIfNoStack('plugin emission → persisted row + SSE', async () => {
    const res = createFakeSseResponse();
    const handle = connectionManager.connect(ctx.slug, CONSUMER_USER_ID, asServerResponse(res));
    try {
      const eventId = crypto.randomUUID();
      await processPluginEvent(ctx, keyVersion, key, {
        eventId,
        type: 'plugin.crm.contact_created',
      });
      await waitForSseEvent(res, 'notification');
      expect(await notificationCount(ctx, eventId)).toBe(1);
    } finally {
      handle.close();
    }
  });

  skipIfNoStack(
    'cap breach (F5) — row persisted, delivery suppressed, counter incremented',
    async () => {
      const res = createFakeSseResponse();
      const handle = connectionManager.connect(ctx.slug, CONSUMER_USER_ID, asServerResponse(res));
      try {
        // Pre-seed the counter at the cap so the next new event breaches it.
        await redis.set(
          capKey(ctx.tenantId, CONSUMER_USER_ID),
          config.NOTIFICATION_CONSUMER_CAP_PER_MIN,
          'EX',
          60
        );

        const eventId = crypto.randomUUID();
        await processPluginEvent(ctx, keyVersion, key, {
          eventId,
          type: 'plugin.crm.contact_created',
        });

        expect(await notificationCount(ctx, eventId)).toBe(1);
        expect(hasSseEvent(res, 'notification')).toBe(false);
        expect(Number(await redis.get(capKey(ctx.tenantId, CONSUMER_USER_ID)))).toBe(
          config.NOTIFICATION_CONSUMER_CAP_PER_MIN + 1
        );
      } finally {
        await redis.del(capKey(ctx.tenantId, CONSUMER_USER_ID));
        handle.close();
      }
    }
  );

  skipIfNoStack(
    'redelivery dedupe (F6) — same event twice → one row, no quota on replay',
    async () => {
      const res = createFakeSseResponse();
      const handle = connectionManager.connect(ctx.slug, CONSUMER_USER_ID, asServerResponse(res));
      try {
        await redis.del(capKey(ctx.tenantId, CONSUMER_USER_ID));

        const eventId = crypto.randomUUID();
        await processPluginEvent(ctx, keyVersion, key, {
          eventId,
          type: 'plugin.crm.contact_created',
        });
        await waitForSseEvent(res, 'notification');
        const afterFirst = Number(await redis.get(capKey(ctx.tenantId, CONSUMER_USER_ID)));

        // Replay the SAME event_id → step-2 skip: no row, no SSE, no quota.
        const framesBefore = res.frames.length;
        await processPluginEvent(ctx, keyVersion, key, {
          eventId,
          type: 'plugin.crm.contact_created',
        });
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(await notificationCount(ctx, eventId)).toBe(1);
        expect(res.frames.length).toBe(framesBefore);
        expect(Number(await redis.get(capKey(ctx.tenantId, CONSUMER_USER_ID)))).toBe(afterFirst);
      } finally {
        await redis.del(capKey(ctx.tenantId, CONSUMER_USER_ID));
        handle.close();
      }
    }
  );

  skipIfNoStack('over-length plugin type → DLQ (permanent producer error, ADR-016)', async () => {
    const eventId = crypto.randomUUID();
    await processPluginEvent(ctx, keyVersion, key, {
      eventId,
      type: `plugin.crm.${'x'.repeat(70)}`,
    });

    const dlq = await prisma.deadLetterQueue.findFirst({ where: { eventId } });
    expect(dlq).not.toBeNull();
    await prisma.deadLetterQueue.deleteMany({ where: { eventId } });
  });
});
