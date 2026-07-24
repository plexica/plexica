import { domainEventEnvelopeSchema, buildDomainEvent } from '../../../events/event-envelope.js';
import { dlqPayloadAsJson, dlqPayloadSchema } from '../../../events/dlq-contract.js';
import { encryptDomainEvent } from '../../../events/event-crypto.js';
import { ensureTenantEventKey } from '../../../events/event-key-service.js';
import { ConflictError } from '../../../lib/app-error.js';
import { prisma } from '../../../lib/database.js';
import { sendKafkaEnvelope, Topics } from '../../../lib/kafka.js';
import { logger } from '../../../lib/logger.js';
import { PluginNotFoundError } from '../errors.js';

import type { PrismaClient } from '@prisma/client';
import type { DlqPayload } from '../../../events/dlq-contract.js';
import type { WireEventEnvelope } from '../../../events/event-envelope.js';

const RETRY_CLAIM_TTL_MS = 60_000;
type DlqClient = Pick<PrismaClient, 'deadLetterQueue'>;
type SendEvent = (
  topic: string,
  event: WireEventEnvelope,
  options?: { headers?: Record<string, string>; partition?: number }
) => Promise<void>;

export async function moveToDlq(
  input: DlqPayload,
  db: PrismaClient = prisma,
  send: SendEvent = sendKafkaEnvelope
): Promise<void> {
  const payload = dlqPayloadSchema.parse(input);
  const tenant = await db.tenant.findUnique({
    where: { id: payload.tenantId }, select: { status: true },
  });
  if (tenant?.status !== 'active') throw new Error('TENANT_NOT_ACTIVE');
  const { keyVersion, key } = await ensureTenantEventKey(db, payload.tenantId);
  const dlqEvent = buildDomainEvent({
    eventId: payload.event.eventId,
    type: 'plexica.plugin.delivery.failed',
    tenantId: payload.tenantId,
    producer: { kind: 'core', id: 'core' },
    correlationId: payload.event.correlationId,
    causationId: payload.event.eventId,
    payload: dlqPayloadAsJson(payload),
  });
  const current = await db.tenant.findUnique({
    where: { id: payload.tenantId }, select: { status: true },
  });
  if (current?.status !== 'active') throw new Error('TENANT_NOT_ACTIVE');
  await send(Topics.dlq, encryptDomainEvent(dlqEvent, keyVersion, key), {
    headers: {
      'plugin-install-id': payload.installId,
      'original-topic': payload.source.topic,
      'original-partition': String(payload.source.partition),
      'original-offset': payload.source.offset,
    },
  });
  logger.debug(
    { eventId: payload.event.eventId, tenantId: payload.tenantId },
    'Encrypted DLQ event published'
  );
}

export async function retryDlqEntry(
  db: PrismaClient,
  id: string,
  now = new Date(),
  send: SendEvent = sendKafkaEnvelope
): Promise<void> {
  const staleBefore = new Date(now.getTime() - RETRY_CLAIM_TTL_MS);
  const claim = await db.deadLetterQueue.updateMany({
    where: { id, OR: [{ status: 'pending' }, { status: 'retrying', resolvedAt: { lt: staleBefore } }] },
    data: { status: 'retrying', resolvedAt: now },
  });
  if (claim.count !== 1) await throwClaimError(db, id);
  const entry = await db.deadLetterQueue.findUnique({ where: { id } });
  if (!entry) throw new PluginNotFoundError(`DLQ entry ${id}`);

  try {
    const tenant = await db.tenant.findUnique({
      where: { id: entry.tenantId }, select: { status: true },
    });
    if (tenant?.status !== 'active') throw new Error('TENANT_NOT_ACTIVE');
    const event = domainEventEnvelopeSchema.parse(entry.payload);
    if (event.eventId !== entry.eventId || event.tenantId !== entry.tenantId) {
      throw new Error('DLQ_IDENTITY_MISMATCH');
    }
    const { keyVersion, key } = await ensureTenantEventKey(db, entry.tenantId);
    await send(entry.originalTopic, encryptDomainEvent(event, keyVersion, key), {
      partition: entry.originalPartition,
      headers: { 'dlq-retry': 'true' },
    });
  } catch (error) {
    await db.deadLetterQueue.updateMany({
      where: { id, status: 'retrying', resolvedAt: now },
      data: { status: 'pending', resolvedAt: null },
    });
    throw error;
  }
  const finalized = await db.deadLetterQueue.updateMany({
    where: { id, status: 'retrying', resolvedAt: now },
    data: { status: 'retried', resolvedAt: new Date(), retryCount: { increment: 1 } },
  });
  if (finalized.count !== 1) throw new Error('DLQ_RETRY_LEASE_LOST');
  logger.info({ id, eventId: entry.eventId }, 'DLQ entry retried');
}

export async function dismissDlqEntry(db: DlqClient, id: string): Promise<void> {
  const dismissed = await db.deadLetterQueue.updateMany({
    where: { id, status: 'pending' },
    data: { status: 'dismissed', resolvedAt: new Date() },
  });
  if (dismissed.count !== 1) await throwClaimError(db, id);
}

async function throwClaimError(db: DlqClient, id: string): Promise<never> {
  const entry = await db.deadLetterQueue.findUnique({ where: { id }, select: { status: true } });
  if (!entry) throw new PluginNotFoundError(`DLQ entry ${id}`);
  throw new ConflictError(`DLQ entry ${id} is ${entry.status} and cannot be changed`);
}
