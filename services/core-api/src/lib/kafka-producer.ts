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

    // Shutdown ran while we were connecting: tear the returned instance down.
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
  void promise.finally(() => activeSends.delete(promise)).catch(() => undefined);
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
  // Entered synchronously: racing getProducer() must be rejected, not served fresh.
  closed = true;
  closing ??= teardownProducer();
  return closing;
}

const SHUTDOWN_BUDGET_EXHAUSTED = Symbol('SHUTDOWN_BUDGET_EXHAUSTED');

type BudgetResult<T> = T | typeof SHUTDOWN_BUDGET_EXHAUSTED;

async function withBudget<T>(budgetMs: number, promise: Promise<T>): Promise<BudgetResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<typeof SHUTDOWN_BUDGET_EXHAUSTED>((resolve) => {
        timer = setTimeout(() => resolve(SHUTDOWN_BUDGET_EXHAUSTED), Math.max(0, budgetMs));
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function warnShutdownDeadlineExceeded(message: string): void {
  logger.warn({ code: 'SHUTDOWN_DEADLINE_EXCEEDED' }, message);
}

async function disconnectSafely(instance: KafkaProducer): Promise<void> {
  try {
    await instance.disconnect();
    logger.info('Kafka producer disconnected');
  } catch {
    logger.warn({ code: 'KAFKA_PRODUCER_DISCONNECT_FAILED' }, 'Kafka producer disconnect failed');
  }
}

async function teardownProducer(): Promise<void> {
  const active = producer;
  const pending = connecting;

  generation++;
  producer = null;
  connecting = null;

  const SHUTDOWN_DEADLINE_MS = 30000;
  const DISCONNECT_BUDGET_MS = 5000;
  const deadline = Date.now() + SHUTDOWN_DEADLINE_MS;
  const drainDeadline = deadline - DISCONNECT_BUDGET_MS;

  // Global bounded drain for in-flight sends and the pending connect.
  const toSettle = [...activeSends, ...(pending ? [pending.catch(() => null)] : [])];
  const drainBudget = Math.max(0, drainDeadline - Date.now());
  if (toSettle.length > 0 && drainBudget > 0) {
    await withBudget(
      drainBudget,
      Promise.allSettled(toSettle.map((p) => p.catch(() => undefined)))
    );
  }

  // Bound remaining steps by the hard shutdown deadline; a hung native
  // connect (KJM-NFR-005) must not stall shutdown.
  const inFlight = await withBudget(
    Math.max(0, deadline - Date.now()),
    pending?.catch(() => null) ?? Promise.resolve(null)
  );
  if (inFlight === SHUTDOWN_BUDGET_EXHAUSTED) {
    warnShutdownDeadlineExceeded('awaiting connect settle');
  }

  if (active) {
    const outcome = await withBudget(Math.max(0, deadline - Date.now()), disconnectSafely(active));
    if (outcome === SHUTDOWN_BUDGET_EXHAUSTED) {
      warnShutdownDeadlineExceeded('disconnecting producer');
    }
  }

  if (inFlight !== SHUTDOWN_BUDGET_EXHAUSTED && inFlight && inFlight !== active) {
    const outcome = await withBudget(
      Math.max(0, deadline - Date.now()),
      disconnectSafely(inFlight)
    );
    if (outcome === SHUTDOWN_BUDGET_EXHAUSTED) {
      warnShutdownDeadlineExceeded('disconnecting in-flight connect');
    }
  }

  // Settle any send rejections from disconnect, bounded by the shutdown deadline.
  const settled = await withBudget(
    Math.max(0, deadline - Date.now()),
    Promise.allSettled([...activeSends].map((p) => p.catch(() => undefined)))
  );
  if (settled === SHUTDOWN_BUDGET_EXHAUSTED) {
    warnShutdownDeadlineExceeded('settling in-flight sends');
  }

  // A connect settling after the budget exhausted must still be torn down;
  // late rejections are handled by the IIFE, late success would leak a socket.
  if (inFlight === SHUTDOWN_BUDGET_EXHAUSTED) {
    void pending
      ?.then((p) => (p && p !== active ? p.disconnect().catch(() => undefined) : undefined))
      .catch(() => undefined);
  }
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
