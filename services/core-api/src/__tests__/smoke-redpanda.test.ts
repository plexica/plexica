// smoke-redpanda.test.ts
// Integration smoke test: Redpanda produce/consume and topic verification.
// Requires real Redpanda — no skip, no mock.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KafkaJS } from '@confluentinc/kafka-javascript';

import { config } from '../lib/config.js';
import { parseKafkaBrokers } from '../lib/kafka-client.js';

const BROKERS = parseKafkaBrokers(config.KAFKA_BROKERS);
const CORE_TOPICS = ['plexica.tenant.events', 'plexica.user.events', 'plexica.plugin.events'];

describe('Redpanda smoke test', () => {
  let kafka: InstanceType<typeof KafkaJS.Kafka>;
  let admin: KafkaJS.Admin;

  beforeAll(async () => {
    kafka = new KafkaJS.Kafka({ kafkaJS: { brokers: BROKERS, clientId: 'smoke-test' } });
    admin = kafka.admin();
    await admin.connect();
    const existing = await admin.listTopics();
    for (const topic of CORE_TOPICS) {
      if (!existing.includes(topic)) {
        await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
      }
    }
    // Wait for leaders on core topics without waitForLeaders flag.
    let ready = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      let meta;
      try {
        meta = await admin.fetchTopicMetadata({ topics: CORE_TOPICS });
      } catch {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const readyNow = CORE_TOPICS.every((t) => {
        const entry = meta.find((m) => m.name === t);
        return entry ? entry.partitions.every((p) => p.leader >= 0 && p.leaderNode) : false;
      });
      if (readyNow) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready) throw new Error('Core topic leaders not ready after 10s');
  });

  afterAll(async () => {
    await admin?.disconnect().catch(() => undefined);
  });

  it('all 3 core topics exist', async () => {
    const metadata = await admin.fetchTopicMetadata({ topics: CORE_TOPICS });
    const existing = metadata.map((t) => t.name);
    for (const topic of CORE_TOPICS) expect(existing).toContain(topic);
  });

  it('produces and consumes a message with assignment gate and cleanup', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const topic = `plexica.smoke.${suffix}`;
    const groupId = `plexica-smoke-test-${suffix}`;
    const testId = `smoke-${suffix}`;
    const payload = { type: 'smoke-test', testId, ts: Date.now() };

    const tKafka = new KafkaJS.Kafka({
      kafkaJS: { brokers: BROKERS, clientId: `smoke-${suffix}` },
    });
    const tAdmin: KafkaJS.Admin = tKafka.admin();
    const producer: KafkaJS.Producer = tKafka.producer({ kafkaJS: { acks: -1 }, 'linger.ms': 0 });
    const consumer: KafkaJS.Consumer = tKafka.consumer({
      kafkaJS: { groupId, autoCommit: false, fromBeginning: true },
    });

    await tAdmin.connect();
    await tAdmin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }] });
    // Leader gate
    let leaderReady = false;
    const leaderDeadline = Date.now() + 10000;
    while (Date.now() < leaderDeadline) {
      let meta;
      try {
        meta = await tAdmin.fetchTopicMetadata({ topics: [topic] });
      } catch {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      const part = meta[0]?.partitions[0];
      if (part?.leaderNode) {
        leaderReady = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!leaderReady) {
      await tAdmin.disconnect().catch(() => undefined);
      throw new Error(`Leader not ready for topic ${topic}`);
    }

    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topics: [topic] });

    let resolveConsumed!: () => void;
    let rejectConsumed!: (e: Error) => void;
    const consumed = new Promise<void>((resolve, reject) => {
      resolveConsumed = resolve;
      rejectConsumed = reject;
    });

    await consumer.run({
      partitionsConsumedConcurrently: 1,
      eachMessage: async ({ topic: t, partition, message }) => {
        if (message.value === null) return;
        try {
          const parsed = JSON.parse(message.value.toString()) as Record<string, unknown>;
          if (parsed['testId'] === testId) {
            const nextOffset = (BigInt(message.offset) + 1n).toString();
            await consumer.commitOffsets([{ topic: t, partition, offset: nextOffset }]);
            resolveConsumed();
          }
        } catch (e) {
          rejectConsumed(e instanceof Error ? e : new Error(String(e)));
          throw e;
        }
      },
    });

    // Assignment gate instead of fixed sleep
    let assigned = false;
    const assignDeadline = Date.now() + 15000;
    while (Date.now() < assignDeadline) {
      if ((consumer.assignment() as unknown[]).length > 0) {
        assigned = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!assigned) {
      await consumer.disconnect().catch(() => undefined);
      await producer.disconnect().catch(() => undefined);
      await tAdmin.deleteTopics({ topics: [topic] }).catch(() => undefined);
      await tAdmin.disconnect().catch(() => undefined);
      throw new Error(`Consumer assignment timeout for ${topic}`);
    }

    try {
      await producer.send({ topic, messages: [{ value: JSON.stringify(payload) }] });
      await Promise.race([
        consumed,
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Consumer timeout after 20s')), 20000)
        ),
      ]);
    } finally {
      await consumer.disconnect().catch(() => undefined);
      await producer.disconnect().catch(() => undefined);
      await tAdmin.deleteTopics({ topics: [topic] }).catch(() => undefined);
      await tAdmin.disconnect().catch(() => undefined);
    }
  });
});
