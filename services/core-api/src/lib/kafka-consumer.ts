// lib/kafka-consumer.ts
// Consumer construction, rebalance state, readiness, guarded commit.

import { KafkaJS } from '@confluentinc/kafka-javascript';

import { kafkaClient } from './kafka-client.js';
import { isRetriableConsumerError } from './kafka-errors.js';
import { logger } from './logger.js';

import type { KafkaConsumer } from './kafka-client.js';

interface ConsumerState {
  generation: number;
  assignment: Set<string>;
  closing: boolean;
  handlers: Set<Promise<void>>;
}

const consumerStates = new WeakMap<KafkaConsumer, ConsumerState>();

function keyFor(topic: string, partition: number): string {
  return `${topic}:${partition}`;
}

function getState(consumer: KafkaConsumer): ConsumerState {
  let state = consumerStates.get(consumer);
  if (!state) {
    state = { generation: 0, assignment: new Set(), closing: false, handlers: new Set() };
    consumerStates.set(consumer, state);
  }
  return state;
}

export function createKafkaConsumer(
  groupId: string,
  options: { fromBeginning?: boolean } = {}
): KafkaConsumer {
  const state: ConsumerState = {
    generation: 0,
    assignment: new Set(),
    closing: false,
    handlers: new Set(),
  };
  const rebalanceCb = (
    error: unknown,
    assignment: Array<{ topic: string; partition: number }>
  ): void => {
    const err = error as { code?: number } | null;
    const code = err?.code;
    const { ErrorCodes } = KafkaJS;
    if (code === ErrorCodes.ERR__ASSIGN_PARTITIONS) {
      state.generation++;
      state.assignment.clear();
      for (const a of assignment ?? []) state.assignment.add(keyFor(a.topic, a.partition));
      logger.info({ code: 'KAFKA_REBALANCE_ASSIGN', groupId }, 'Consumer assigned');
      return;
    }
    if (code === ErrorCodes.ERR__REVOKE_PARTITIONS) {
      state.generation++;
      for (const a of assignment ?? []) state.assignment.delete(keyFor(a.topic, a.partition));
      logger.info({ code: 'KAFKA_REBALANCE_REVOKE', groupId }, 'Consumer revoked');
      return;
    }
    if (error) {
      logger.warn(
        { code: 'KAFKA_REBALANCE_ERROR', groupId, category: String(code ?? -1) },
        'Rebalance error'
      );
    }
  };

  const consumer = kafkaClient.consumer({
    kafkaJS: {
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      fromBeginning: options.fromBeginning ?? false,
      autoCommit: false,
    },
    rebalance_cb: rebalanceCb as unknown as Function,
  });
  consumerStates.set(consumer, state);
  return consumer;
}

export async function waitForConsumerAssignment(
  consumer: KafkaConsumer,
  timeoutMs = 15000
): Promise<void> {
  const state = getState(consumer);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (state.assignment.size > 0) return;
    try {
      const direct = consumer.assignment();
      if (direct.length > 0) {
        state.assignment.clear();
        for (const a of direct) state.assignment.add(keyFor(a.topic, a.partition));
        return;
      }
    } catch (e) {
      if (!isRetriableConsumerError(e)) throw e;
      logger.debug({ code: 'KAFKA_ASSIGNMENT_POLL_FAILED' }, 'Consumer assignment poll failed');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('KAFKA_CONSUMER_NOT_READY');
}

export function getConsumerGeneration(consumer: KafkaConsumer): number {
  return getState(consumer).generation;
}

export function isConsumerClosing(consumer: KafkaConsumer): boolean {
  return getState(consumer).closing;
}

export function markConsumerClosing(consumer: KafkaConsumer): void {
  getState(consumer).closing = true;
}

export async function commitOffsetGuarded(
  consumer: KafkaConsumer,
  topic: string,
  partition: number,
  nextOffset: string
): Promise<void> {
  const state = getState(consumer);
  const gen = state.generation;
  const key = keyFor(topic, partition);
  if (!state.assignment.has(key)) throw new Error('KAFKA_COMMIT_STALE_GENERATION');
  await consumer.commitOffsets([{ topic, partition, offset: nextOffset }]);
  if (state.generation !== gen || !state.assignment.has(key))
    throw new Error('KAFKA_COMMIT_STALE_GENERATION');
}

export function isAssigned(consumer: KafkaConsumer, topic: string, partition: number): boolean {
  return getState(consumer).assignment.has(keyFor(topic, partition));
}

export function trackHandler(consumer: KafkaConsumer, promise: Promise<void>): void {
  const state = getState(consumer);
  state.handlers.add(promise);
  void promise.finally(() => state.handlers.delete(promise)).catch(() => undefined);
}

function timeoutReject(timeoutMs: number): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('KAFKA_OWNED_HANDLERS_DRAIN_TIMEOUT')), timeoutMs);
    timer.unref?.();
  });
  // Clear the timer once the surrounding race settles; the promise then never settles.
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  return { promise, cancel };
}

export async function awaitOwnedHandlers(consumer: KafkaConsumer, timeoutMs = 5000): Promise<void> {
  // Bounded re-check loop: a handler registered after a snapshot is still
  // awaited on the next iteration (no drain snapshot race).
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const handlers = [...getState(consumer).handlers];
    if (handlers.length === 0) return;
    const timed = timeoutReject(Math.max(0, deadline - Date.now()));
    try {
      await Promise.race([Promise.allSettled(handlers), timed.promise]);
    } catch {
      // Drain iteration timed out; re-check the deadline on the next pass.
    } finally {
      timed.cancel();
    }
  }
}

export function processAndCommit(
  consumer: KafkaConsumer,
  topic: string,
  partition: number,
  offset: string,
  work: () => Promise<void>
): Promise<void> {
  const task = (async () => {
    const gen = getConsumerGeneration(consumer);
    await work();
    const nextOffset = (BigInt(offset) + 1n).toString();
    // Pre-check before commit: a rebalance that kept the partition assigned
    // would otherwise re-seek already-committed work (KJM-009). Never commit
    // stale work.
    if (getConsumerGeneration(consumer) !== gen || !isAssigned(consumer, topic, partition))
      throw new Error('KAFKA_COMMIT_STALE_GENERATION');
    await commitOffsetGuarded(consumer, topic, partition, nextOffset);
  })();
  trackHandler(consumer, task);
  return task;
}
