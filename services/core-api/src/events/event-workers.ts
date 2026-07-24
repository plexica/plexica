import { prisma } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import {
  startDlqConsumer,
  stopDlqConsumer,
} from '../modules/plugin/events/dlq-consumer.js';

import { provisionTenantEventKeys } from './event-key-service.js';
import { startOutboxPublisher, stopOutboxPublisher } from './outbox-publisher.js';

export async function startEventWorkers(): Promise<void> {
  await provisionTenantEventKeys(prisma);
  startOutboxPublisher();
  try {
    await startDlqConsumer();
  } catch {
    logger.error({ code: 'DLQ_BRIDGE_START_FAILED' }, 'DLQ bridge failed to start');
  }
}

export async function stopEventWorkers(): Promise<void> {
  await stopOutboxPublisher();
  await stopDlqConsumer();
}
