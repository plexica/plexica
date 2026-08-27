// lib/kafka-admin.ts
// Transient admin ownership, leader polling, lag normalization.

import { KafkaJS } from '@confluentinc/kafka-javascript';

import { kafkaClient } from './kafka-client.js';
import { logger } from './logger.js';

import type { KafkaAdmin } from './kafka-client.js';

export async function withKafkaAdmin<T>(operation: (admin: KafkaAdmin) => Promise<T>): Promise<T> {
  const admin = kafkaClient.admin();
  await admin.connect();
  try {
    return await operation(admin);
  } finally {
    try {
      await admin.disconnect();
    } catch {
      logger.warn({ code: 'KAFKA_ADMIN_DISCONNECT_FAILED' }, 'Kafka admin disconnect failed');
    }
  }
}

export async function waitForTopicLeaders(
  admin: KafkaAdmin,
  topics: string[],
  timeoutMs = 10000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const metadata = await admin.fetchTopicMetadata({ topics, timeout: 5000 });
      const allReady = topics.every((topic) => {
        const entry = metadata.find((m) => m.name === topic);
        if (!entry) return false;
        return entry.partitions.every((p) => p.leader >= 0 && p.leaderNode !== null);
      });
      if (allReady) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error('KAFKA_TOPIC_LEADERS_TIMEOUT');
}

export async function getConsumerGroupLag(
  admin: KafkaAdmin,
  groupId: string,
  topics: string[]
): Promise<number> {
  const groupOffsets = await admin.fetchOffsets({ groupId, topics });
  let totalLag = 0;
  for (const topicEntry of groupOffsets) {
    const highOffsets = await admin.fetchTopicOffsets(topicEntry.topic);
    const highMap = new Map<number, bigint>();
    for (const h of highOffsets) highMap.set(h.partition, BigInt(h.high));

    for (const partition of topicEntry.partitions as Array<{ partition: number; offset: string }>) {
      const high = highMap.get(partition.partition);
      if (high === undefined) continue;
      const committedRaw = partition.offset;
      const committed = committedRaw === '-1' || committedRaw === '' ? null : BigInt(committedRaw);
      const lag = committed === null || committed < 0 ? high : high - committed;
      totalLag += Number(lag > 0 ? lag : 0n);
    }
  }
  return totalLag;
}

export async function probeKafkaAdmin(
  timeoutMs = 200
): Promise<{ status: 'ok' | 'timeout' | 'error' }> {
  try {
    await withKafkaAdmin(async (admin) => {
      await admin.listTopics({ timeout: timeoutMs });
    });
    return { status: 'ok' };
  } catch (error) {
    const { category } = await import('./kafka-errors.js').then((m) => m.classifyKafkaError(error));
    if (category === 'timeout' || (error instanceof Error && error.name === 'TimeoutError')) {
      return { status: 'timeout' };
    }
    logger.warn({ code: 'KAFKA_HEALTH_PROBE_FAILED', category }, 'Kafka health probe failed');
    return { status: 'error' };
  }
}
