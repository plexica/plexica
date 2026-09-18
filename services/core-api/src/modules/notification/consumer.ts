// consumer.ts
// Notification Kafka consumer — group `plexica-notification-consumer` on
// `plexica.workspace.invite` + `plexica.notification` (ADR-035, 006-01).
// Each message is decrypted, run through the ordered pipeline (consumer-pipeline),
// retried 3× with backoff on transient failures, then dead-lettered (ADR-016).

import { prisma } from '../../lib/database.js';
import { decryptWireEvent } from '../../events/event-crypto.js';
import { wireEventEnvelopeSchema } from '../../events/event-envelope.js';
import { getTenantEventKey } from '../../events/event-key-service.js';
import { createConsumer, Topics } from '../../lib/kafka.js';
import {
  awaitOwnedHandlers,
  commitOffsetGuarded,
  getConsumerGeneration,
  isAssigned,
  trackHandler,
  waitForConsumerAssignment,
} from '../../lib/kafka-consumer.js';
import { isRetriablePrismaError } from '../../lib/kafka-errors.js';
import { disconnectConsumerWithBudget } from '../../lib/kafka-shutdown.js';
import { logger } from '../../lib/logger.js';

import {
  moveToNotificationDlq,
  dlqErrorDetail,
  moveWireToNotificationDlq,
} from './consumer-dlq.js';
import { processNotificationEvent } from './consumer-pipeline.js';

import type { SourceCoordinates } from '../../events/dlq-contract.js';
import type { DomainEventEnvelope } from '../../events/event-envelope.js';
import type { KafkaConsumer } from '../../lib/kafka-client.js';

const CONSUMER_GROUP_ID = 'plexica-notification-consumer';
const NOTIFICATION_TOPICS = [Topics.workspace('invite'), Topics.notification];
const RETRY_BACKOFF_MS = [100, 500] as const;
const MAX_RETRIES = 3;
const STALE_GEN = 'KAFKA_COMMIT_STALE_GENERATION';

let consumer: KafkaConsumer | null = null;
let isRunning = false;

export async function handleNotificationMessage(input: {
  value: string;
  source: SourceCoordinates;
}): Promise<void> {
  let wire;
  try {
    wire = wireEventEnvelopeSchema.parse(JSON.parse(input.value));
  } catch {
    // Malformed envelope is permanent poison — log and commit (skip). Nothing
    // to dead-letter: no valid event identity to record.
    logger.error(
      {
        topic: input.source.topic,
        partition: input.source.partition,
        offset: input.source.offset,
        code: 'NOTIF_ENVELOPE_MALFORMED',
      },
      'Malformed notification envelope skipped'
    );
    return;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: wire.tenantId },
    select: { status: true },
  });
  if (tenant?.status !== 'active') return;

  let event: DomainEventEnvelope;
  try {
    const key = await getTenantEventKey(prisma, wire.tenantId, wire.encryption.keyVersion);
    event = decryptWireEvent(wire, key);
  } catch (error) {
    if (isRetriablePrismaError(error)) throw error;
    // Permanent decrypt failure — dead-letter from the wire metadata (available
    // before decryption) instead of committing silently: the event is a poison
    // record for admin review (ADR-016). Never commit a decrypt failure.
    await moveWireToNotificationDlq(wire, input.source, 'NOTIF_DECRYPT_FAILED');
    return;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0)
      await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[attempt - 1]));
    try {
      await processNotificationEvent(event, input.source);
      return;
    } catch (error) {
      if (!isRetriablePrismaError(error)) {
        // Non-retriable failure on this attempt — record the real attempt count
        // (attempt + 1, first attempt = 1), not a hardcoded exhaustion value.
        await moveToNotificationDlq(
          event,
          input.source,
          'NOTIFICATION_PROCESS_FAILED',
          dlqErrorDetail('NOTIF_PROCESS_FAILED', error),
          attempt + 1
        );
        return;
      }
      logger.warn(
        { eventId: event.eventId, attempt: attempt + 1, code: 'NOTIF_PROCESS_FAILED' },
        'Notification processing failed — will retry'
      );
    }
  }
  await moveToNotificationDlq(
    event,
    input.source,
    'NOTIFICATION_PROCESS_FAILED',
    'NOTIF_PROCESS_FAILED:retries-exhausted',
    MAX_RETRIES
  );
}

export async function startNotificationConsumer(): Promise<void> {
  if (isRunning) return;
  const activeConsumer = createConsumer(CONSUMER_GROUP_ID);
  try {
    await activeConsumer.connect();
    await activeConsumer.subscribe({ topics: NOTIFICATION_TOPICS });
    await activeConsumer.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: ({ topic, partition, message }) => {
        const offset = message.offset;
        const nextOffset = (BigInt(offset) + 1n).toString();
        const generation = getConsumerGeneration(activeConsumer);
        const stale = (): boolean =>
          getConsumerGeneration(activeConsumer) !== generation ||
          !isAssigned(activeConsumer, topic, partition);
        const task = (async () => {
          try {
            await handleNotificationMessage({
              value: message.value?.toString() ?? '',
              source: { topic, partition, offset },
            });
            if (stale()) throw new Error(STALE_GEN);
            await commitOffsetGuarded(activeConsumer, topic, partition, nextOffset);
          } catch (error) {
            if (String((error as Error).message ?? '').includes(STALE_GEN)) throw error;
            logger.error(
              { topic, partition, offset, code: 'NOTIF_CONSUMER_TRANSIENT', err: String(error) },
              'Notification consumer transient failure'
            );
            throw error;
          }
        })();
        trackHandler(activeConsumer, task);
        return task;
      },
    });
    await waitForConsumerAssignment(activeConsumer, 15000);
  } catch (error) {
    try {
      await awaitOwnedHandlers(activeConsumer);
      await disconnectConsumerWithBudget(activeConsumer);
    } catch {
      // ignore cleanup errors on a failed start
    }
    throw error;
  }
  consumer = activeConsumer;
  isRunning = true;
  logger.info('Notification consumer started');
}

export async function stopNotificationConsumer(): Promise<void> {
  if (!consumer) return;
  try {
    await awaitOwnedHandlers(consumer);
    await disconnectConsumerWithBudget(consumer);
  } catch {
    logger.error(
      { code: 'NOTIF_CONSUMER_DISCONNECT_FAILED' },
      'Failed to disconnect notification consumer'
    );
  }
  consumer = null;
  isRunning = false;
}
