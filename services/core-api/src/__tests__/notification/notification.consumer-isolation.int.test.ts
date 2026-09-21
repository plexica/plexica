// notification.consumer-isolation.int.test.ts
// INT (review M1): two-tenant isolation through the REAL consumer pipeline.
// A tenant B plugin-emission notification must never reach tenant A's SSE
// connections — even when both tenants share the same userId — and the row must
// land only in tenant B's schema. AGENTS.md Security §1 (#1 invariant) +
// ADR-035 §6 "cross-tenant delivery is integration-tested". The unit-level
// ConnectionManager isolation is covered in src/__tests__/unit/
// notification-connection-manager.test.ts.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { connectionManager } from '../../modules/notification/connection-manager.js';
import { cleanupTenant, seedTenant, seedUserProfile } from '../helpers/db.helpers.js';
import { isDbReachable, isRedisReachable } from '../helpers/server.helpers.js';
import {
  asServerResponse,
  createFakeSseResponse,
  hasSseEvent,
  waitForSseEvent,
} from '../helpers/notification-sse.helpers.js';

import {
  CONSUMER_EMAIL,
  CONSUMER_USER_ID,
  ensureTenantEventKey,
  notificationCount,
  processPluginEvent,
} from './notification.int.helpers.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

const SLUG_A = 'notif-int-iso-a';
const SLUG_B = 'notif-int-iso-b';

const skipIfNoStack = it.skipIf(!(await isDbReachable()) || !(await isRedisReachable()));

let ctxA: TenantContext;
let ctxB: TenantContext;

beforeAll(async () => {
  const seededA = await seedTenant(SLUG_A);
  ctxA = seededA.tenantContext;
  await seedUserProfile(ctxA, CONSUMER_USER_ID, CONSUMER_EMAIL, 'Consumer A', CONSUMER_USER_ID);
  const seededB = await seedTenant(SLUG_B);
  ctxB = seededB.tenantContext;
  // Same userId in B as in A — a cross-tenant bleed in the pools or the
  // consumer pipeline would surface here.
  await seedUserProfile(ctxB, CONSUMER_USER_ID, CONSUMER_EMAIL, 'Consumer B', CONSUMER_USER_ID);
});

afterAll(async () => {
  await prisma.emailQueue.deleteMany({ where: { tenantId: ctxB.tenantId } });
  await cleanupTenant(SLUG_A);
  await cleanupTenant(SLUG_B);
  await prisma.$disconnect();
});

describe('notification consumer tenant isolation (INT, M1)', () => {
  skipIfNoStack(
    'tenant B notification never reaches tenant A connections, and the row lands only in B',
    async () => {
      const provisionedB = await ensureTenantEventKey(prisma, ctxB.tenantId);
      const resA = createFakeSseResponse();
      const resB = createFakeSseResponse();
      const handleA = connectionManager.connect(
        ctxA.slug,
        CONSUMER_USER_ID,
        asServerResponse(resA)
      );
      const handleB = connectionManager.connect(
        ctxB.slug,
        CONSUMER_USER_ID,
        asServerResponse(resB)
      );
      try {
        const eventId = crypto.randomUUID();
        await processPluginEvent(ctxB, provisionedB.keyVersion, provisionedB.key, {
          eventId,
          type: 'plugin.crm.contact_created',
        });

        await waitForSseEvent(resB, 'notification');
        expect(hasSseEvent(resA, 'notification')).toBe(false);
        expect(resA.frames.length).toBe(0);
        expect(await notificationCount(ctxB, eventId)).toBe(1);
        expect(await notificationCount(ctxA, eventId)).toBe(0);
      } finally {
        handleA.close();
        handleB.close();
      }
    }
  );
});
