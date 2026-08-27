// lib/kafka-producer.ts
// Producer lifecycle state machine with terminal closed state and send tracking.

import { kafkaClient } from './kafka-client.js';
import { logger } from './logger.js';

import type { KafkaProducer } from './kafka-client.js';

const activeSends = new Set<Promise<unknown>>();

/** Thrown by getProducer() once disconnectKafka() has been called. */
export class KafkaProducerClosedError extends Error {
  readonly code = 'KAFKA_PRODUCER_CLOSED';

  constructor() {
    super('Kafka producer is closed — the process is shutting down');
    this.name = 'KafkaProducerClosedError';
  }
}

let producer: KafkaProducer | null = null;
let connecting: Promise<KafkaProducer> | null = null;

let closed = false;
let closing: Promise<void> | null = null;
let generation = 0;
export async function getProducer(): Promise<KafkaProducer> {
  if (closed) throw new KafkaProducerClosedError();
  if (producer) return producer;

  // Guard against concurrent initialization (race condition fix)
  if (connecting) return connecting;

  const p = kafkaClient.producer({
    kafkaJS: {
      allowAutoTopicCreation: true,
      acks: -1,
      retry: { retries: 3, initialRetryTime: 100 },
    },
    'linger.ms': 0,
  });
  const myGeneration = ++generation;

  connecting = (async () => {
    try {
      await p.connect();
    } catch (err) {
      if (generation === myGeneration) connecting = null;
      await p.disconnect().catch(() => undefined);
      throw err;
    }

    // Shutdown ran while we were connecting: do NOT publish this instance as
    // the live producer. disconnectKafka() awaits this promise and tears the
    // returned instance down.
    if (generation !== myGeneration || closed) return p;

    producer = p;
    connecting = null;
    logger.info('Kafka producer connected');
    return p;
  })();

  return connecting;
}

export function registerSend(promise: Promise<unknown>): void {
  if (closed) throw new KafkaProducerClosedError();
  activeSends.add(promise);
  void promise.finally(() => activeSends.delete(promise));
}

export function initKafka(): void {
  if (closed) return;
  void getProducer().catch((err: unknown) => {
    if (err instanceof KafkaProducerClosedError) return;
    logger.error(
      { code: 'KAFKA_PRODUCER_WARMUP_FAILED' },
      'Kafka producer warm-up failed — will retry on first emit'
    );
  });
}

export function disconnectKafka(): Promise<void> {
  // Entered synchronously, before any await: a getProducer() racing this
  // teardown must be rejected, not served with a brand-new connection.
  closed = true;
  closing ??= teardownProducer();
  return closing;
}

async function teardownProducer(): Promise<void> {
  const active = producer;
  const pending = connecting;

  generation++;
  producer = null;
  connecting = null;

  const SHUTDOWN_DEADLINE_MS = 30000;
  const DISCONNECT_BUDGET_MS = 5000;
  const deadline = Date.now() + SHUTDOWN_DEADLINE_MS - DISCONNECT_BUDGET_MS;

  // Settle in-flight sends and pending connect within deadline, then disconnect.
  const pendingSends = [...activeSends];
  const pendingConnects: Promise<unknown>[] = pending ? [pending.catch(() => null)] : [];
  const toSettle = [...pendingSends, ...pendingConnects];
  if (toSettle.length > 0) {
    const remaining = Math.max(0, deadline - Date.now());
    await Promise.allSettled(
      toSettle.map((p) =>
        remaining > 0
          ? Promise.race([
              p,
              new Promise((_, r) =>
                setTimeout(() => r(new Error('SHUTDOWN_DRAIN_TIMEOUT')), remaining)
              ),
            ]).catch(() => undefined)
          : Promise.resolve()
      )
    );
  }

  if (active) {
    try {
      await active.disconnect();
      logger.info('Kafka producer disconnected');
    } catch {
      logger.warn({ code: 'KAFKA_PRODUCER_DISCONNECT_FAILED' }, 'Kafka producer disconnect failed');
    }
  }

  if (!pending) return;

  const inFlight = await pending.catch(() => null);
  if (inFlight && inFlight !== active) {
    try {
      await inFlight.disconnect();
      logger.info('Kafka producer disconnected');
    } catch {
      logger.warn({ code: 'KAFKA_PRODUCER_DISCONNECT_FAILED' }, 'Kafka producer disconnect failed');
    }
  }

  // Settle any send rejections that resulted from disconnect.
  await Promise.allSettled([...activeSends].map((p) => p.catch(() => undefined)));
}

export function isKafkaProducerClosed(): boolean {
  return closed;
}
export function resetKafkaProducerForTests(): void {
  generation++;
  producer = null;
  connecting = null;
  closing = null;
  closed = false;
  activeSends.clear();
}
