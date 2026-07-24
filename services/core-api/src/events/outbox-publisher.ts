import { prisma } from '../lib/database.js';
import { sendKafkaEnvelope } from '../lib/kafka.js';
import { logger } from '../lib/logger.js';

import { encryptDomainEvent } from './event-crypto.js';
import { ensureTenantEventKey } from './event-key-service.js';
import {
  acknowledgeOutboxEvent,
  claimOutboxEvents,
  getOutboxMetrics,
  releaseOutboxEvent,
} from './outbox-repository.js';

import type { PrismaClient } from '@prisma/client';
import type { WireEventEnvelope } from './event-envelope.js';

type SendEvent = (topic: string, event: WireEventEnvelope) => Promise<void>;

export async function publishOutboxBatch(
  db: PrismaClient = prisma,
  send: SendEvent = sendKafkaEnvelope
): Promise<{ published: number; failed: number }> {
  const events = await claimOutboxEvents(db);
  let published = 0;
  let failed = 0;
  for (const event of events) {
    try {
      const tenant = await db.tenant.findUnique({
        where: { id: event.tenantId },
        select: { status: true },
      });
      if (tenant?.status !== 'active') throw new Error('TENANT_NOT_ACTIVE');
      const { keyVersion, key } = await ensureTenantEventKey(db, event.tenantId);
      const wire = encryptDomainEvent({
        eventId: event.eventId,
        type: event.type,
        schemaVersion: event.schemaVersion,
        tenantId: event.tenantId,
        occurredAt: event.occurredAt,
        producer: event.producer,
        correlationId: event.correlationId,
        causationId: event.causationId,
        payload: event.payload,
      }, keyVersion, key);
      const current = await db.tenant.findUnique({
        where: { id: event.tenantId },
        select: { status: true },
      });
      if (current?.status !== 'active') throw new Error('TENANT_NOT_ACTIVE');
      await send(event.topic, wire);
      if (!(await acknowledgeOutboxEvent(db, event.eventId, event.leaseToken))) {
        throw new Error('OUTBOX_LEASE_LOST');
      }
      published++;
    } catch {
      failed++;
      await releaseOutboxEvent(db, event, 'EVENT_PUBLISH_FAILED');
      logger.warn(
        { eventId: event.eventId, tenantId: event.tenantId, code: 'EVENT_PUBLISH_FAILED' },
        'Outbox event publication deferred'
      );
    }
  }
  return { published, failed };
}

let interval: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;

function scheduleBatch(): void {
  if (running) return;
  running = publishOutboxBatch()
    .then(async ({ published, failed }) => {
      if (published > 0 || failed > 0) {
        logger.info({ published, failed }, 'Outbox publisher batch completed');
      }
      const metrics = await getOutboxMetrics(prisma);
      if (metrics.pending > 0) logger.info(metrics, 'Outbox backlog metrics');
    })
    .catch(() => logger.error({ code: 'OUTBOX_BATCH_FAILED' }, 'Outbox publisher batch failed'))
    .finally(() => {
      running = undefined;
    });
}

export function startOutboxPublisher(periodMs = 1_000): void {
  if (interval) return;
  scheduleBatch();
  interval = setInterval(scheduleBatch, periodMs);
  interval.unref();
}

export async function stopOutboxPublisher(): Promise<void> {
  if (interval) clearInterval(interval);
  interval = undefined;
  await running;
}
