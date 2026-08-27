// lib/kafka-admin.ts
// Transient admin ownership, leader polling, lag normalization.

import { kafkaClient } from './kafka-client.js';
import { logger } from './logger.js';

import type { KafkaAdmin } from './kafka-client.js';

export class KafkaAdminConnectTimeoutError extends Error {
  readonly code = 'KAFKA_ADMIN_CONNECT_TIMEOUT';
  constructor() {
    super('Kafka admin connect timed out');
    this.name = 'TimeoutError';
  }
}

export async function withKafkaAdmin<T>(
  operation: (admin: KafkaAdmin) => Promise<T>,
  options: { connectTimeoutMs?: number } = {}
): Promise<T> {
  const admin = kafkaClient.admin();
  if (options.connectTimeoutMs !== undefined && options.connectTimeoutMs > 0) {
    await Promise.race([
      admin.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new KafkaAdminConnectTimeoutError()), options.connectTimeoutMs)
      ),
    ]);
  } else {
    await admin.connect();
  }
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
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      const metadata = await admin.fetchTopicMetadata({
        topics,
        timeout: Math.min(5000, remaining),
      });
      const allReady = topics.every((topic) => {
        const entry = metadata.find((m) => m.name === topic);
        if (!entry) return false;
        return entry.partitions.every((p) => p.leader >= 0 && p.leaderNode !== null);
      });
      if (allReady) return;
    } catch (error) {
      lastError = error;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, remaining)));
  }
  throw lastError ?? new Error('KAFKA_TOPIC_LEADERS_TIMEOUT');
}

export async function getConsumerGroupLag(
  admin: KafkaAdmin,
  groupId: string,
  topics: string[]
): Promise<number> {
  const groupOffsets = await admin.fetchOffsets({ groupId, topics });
  const committedByTopic = new Map<string, Map<number, bigint>>();
  for (const entry of groupOffsets) {
    const partitionMap = new Map<number, bigint>();
    for (const p of entry.partitions as Array<{ partition: number; offset: string }>) {
      if (p.offset === '-1' || p.offset === '') continue;
      try {
        const committed = BigInt(p.offset);
        if (committed >= 0n) partitionMap.set(p.partition, committed);
      } catch {
        // malformed offset — treat as missing, will use low watermark
      }
    }
    committedByTopic.set(entry.topic, partitionMap);
  }

  let totalLag = 0n;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  for (const topic of topics) {
    const highOffsets = await admin.fetchTopicOffsets(topic);
    const highMap = new Map<number, { high: bigint; low: bigint }>();
    for (const h of highOffsets) {
      highMap.set(h.partition, { high: BigInt(h.high), low: BigInt(h.low) });
    }
    const committedMap = committedByTopic.get(topic);
    for (const [partition, { high, low }] of highMap) {
      const committed = committedMap?.get(partition);
      const effective = committed === undefined ? low : committed;
      const lag = high > effective ? high - effective : 0n;
      totalLag += lag;
      if (totalLag > maxSafe) return Number.MAX_SAFE_INTEGER;
    }
  }
  return Number(totalLag);
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
