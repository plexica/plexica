// lib/kafka-consumer.ts
// Consumer construction, rebalance state, readiness, guarded commit.

import { KafkaJS } from '@confluentinc/kafka-javascript';

import { kafkaClient } from './kafka-client.js';
import { logger } from './logger.js';

import type { KafkaConsumer } from './kafka-client.js';

interface ConsumerState {
  generation: number;
  assignment: Set<string>;
  closing: boolean;
}

const consumerStates = new WeakMap<KafkaConsumer, ConsumerState>();

function keyFor(topic: string, partition: number): string {
  return `${topic}:${partition}`;
}

function getState(consumer: KafkaConsumer): ConsumerState {
  let state = consumerStates.get(consumer);
  if (!state) {
    state = { generation: 0, assignment: new Set(), closing: false };
    consumerStates.set(consumer, state);
  }
  return state;
}

export function createKafkaConsumer(
  groupId: string,
  options: { fromBeginning?: boolean } = {}
): KafkaConsumer {
  const state: ConsumerState = { generation: 0, assignment: new Set(), closing: false };
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
    } catch {}
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
  try {
    await consumer.commitOffsets([{ topic, partition, offset: nextOffset }]);
  } catch (error) {
    throw error;
  }
  if (state.generation !== gen || !state.assignment.has(key))
    throw new Error('KAFKA_COMMIT_STALE_GENERATION');
}

export function isAssigned(consumer: KafkaConsumer, topic: string, partition: number): boolean {
  return getState(consumer).assignment.has(keyFor(topic, partition));
}
