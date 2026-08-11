// lib/kafka-producer.ts
// Producer lifecycle state machine, extracted from kafka.ts (Rule 4: 200 lines).
//
// State machine
// -------------
//   idle ──getProducer()──▶ connecting ──resolved──▶ connected
//                               │ rejected
//                               ▼
//                             idle  (retried lazily on the next emit)
//
//   idle | connecting | connected ──disconnectKafka()──▶ closed  (TERMINAL)
//
// `closed` is terminal for the lifetime of the process. Without it, a send
// racing the shutdown window — the interval between clearing the slots and
// awaiting the in-flight connect — observes two empty slots, opens a fresh
// producer and wins the generation check, leaving a live, connected producer
// that nobody ever disconnects. Tests re-arm the module with
// resetKafkaProducerForTests().

import { kafkaClient } from './kafka-client.js';
import { logger } from './logger.js';

import type { KafkaProducer } from './kafka-client.js';

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

// Terminal flag + memoised teardown. `closing` is intentionally never cleared:
// late callers await the already-settled promise instead of racing a second
// teardown or believing shutdown finished while the first one is still running.
let closed = false;
let closing: Promise<void> | null = null;

// Bumped by disconnectKafka(). An in-flight connect compares its own value
// against this counter to detect that a shutdown orphaned its producer.
let generation = 0;

/**
 * Returns the shared connected producer, opening it on first use.
 *
 * Rejects with KafkaProducerClosedError once shutdown has started; callers
 * must treat that as a send failure (the outbox then keeps the event pending
 * and republishes it after the restart) rather than as a silent success.
 */
export async function getProducer(): Promise<KafkaProducer> {
  if (closed) throw new KafkaProducerClosedError();
  if (producer) return producer;

  // Guard against concurrent initialization (race condition fix)
  if (connecting) return connecting;

  const p = kafkaClient.producer({ allowAutoTopicCreation: true });
  const myGeneration = ++generation;

  connecting = (async () => {
    try {
      await p.connect();
    } catch (err) {
      // Only clear the slot if it is still ours — a newer attempt may own it.
      if (generation === myGeneration) connecting = null;
      // kafkajs retains partial broker/socket state on a failed connect. The
      // instance is discarded here, so release that state explicitly.
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

/**
 * Starts the producer connection in the background so the first emit does not
 * pay the TCP + handshake cost (noticeable on cold CI runners).
 *
 * Must be called explicitly from the application bootstrap: importing this
 * module has no network side effects, which keeps it usable from unit tests.
 * Never throws — a failed warm-up is logged and the connection is retried
 * lazily on the first emit. A no-op once the module is closed.
 */
export function initKafka(): void {
  if (closed) return;
  void getProducer().catch((err: unknown) => {
    if (err instanceof KafkaProducerClosedError) return;
    logger.error({ err }, 'Kafka producer warm-up failed — will retry on first emit');
  });
}

/**
 * Tears down the producer and enters the terminal `closed` state.
 *
 * Both `producer` and `connecting` must be cleared: leaving a resolved
 * `connecting` behind would make the next getProducer() hand out the
 * already-disconnected instance forever. Also covers shutdown racing an
 * in-flight warm-up.
 */
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

  if (active) {
    await active.disconnect();
    logger.info('Kafka producer disconnected');
  }

  if (!pending) return;

  // Connection still in flight. Wait for it to settle, then tear it down.
  // A rejection was already logged by the initiating caller; swallow it here
  // so shutdown never produces an unhandled rejection.
  const inFlight = await pending.catch(() => null);
  if (inFlight && inFlight !== active) {
    await inFlight.disconnect();
    logger.info('Kafka producer disconnected');
  }
}

/** True once disconnectKafka() has been called. */
export function isKafkaProducerClosed(): boolean {
  return closed;
}

/**
 * Leaves the terminal state and drops all module state. Test-only: production
 * code must never reopen Kafka after shutdown.
 */
export function resetKafkaProducerForTests(): void {
  generation++;
  producer = null;
  connecting = null;
  closing = null;
  closed = false;
}
