// smoke-redpanda.test.ts
// Integration smoke test: Redpanda produce/consume and topic verification.
// Connects to real Docker Redpanda — no mock Kafka client.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Kafka, type Admin, type Producer, type Consumer } from 'kafkajs';

import { config } from '../lib/config.js';

const BROKERS = config.KAFKA_BROKERS.split(',');
const CORE_TOPICS = ['plexica.tenant.events', 'plexica.user.events', 'plexica.plugin.events'];
const TEST_TOPIC = 'plexica.tenant.events';
const GROUP_ID = `plexica-smoke-test-${Date.now()}`;

describe('Redpanda smoke test', () => {
  let kafka: Kafka;
  let admin: Admin;
  let producer: Producer;
  let consumer: Consumer;

  beforeAll(async () => {
    kafka = new Kafka({ brokers: BROKERS, clientId: 'smoke-test' });
    admin = kafka.admin();
    producer = kafka.producer();
    consumer = kafka.consumer({ groupId: GROUP_ID });

    await admin.connect();
    await producer.connect();
    await consumer.connect();
  });

  afterAll(async () => {
    await consumer.disconnect();
    await producer.disconnect();
    await admin.disconnect();
  });

  it('all 3 core topics exist', async () => {
    const metadata = await admin.fetchTopicMetadata({ topics: CORE_TOPICS });
    const existingTopics = metadata.topics.map((t) => t.name);
    for (const topic of CORE_TOPICS) {
      expect(existingTopics).toContain(topic);
    }
  });

  it('produces and consumes a message on plexica.tenant.events', async () => {
    // Use a unique testId to identify our message among any older messages on the topic.
    // fromBeginning: true avoids the offset-anchor race (KafkaJS + Redpanda: consumer.group_join
    // fires before the fetch offset is fully committed, so fromBeginning: false can silently miss
    // messages produced immediately after group_join).
    const testId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const testPayload = { type: 'smoke-test', testId, ts: Date.now() };
    let resolveConsumed!: () => void;
    let rejectConsumed!: (err: Error) => void;

    const consumePromise = new Promise<void>((resolve, reject) => {
      resolveConsumed = resolve;
      rejectConsumed = reject;
    });

    await consumer.subscribe({ topic: TEST_TOPIC, fromBeginning: true });

    void consumer
      .run({
        eachMessage: async ({ message }) => {
          if (message.value === null) return;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(message.value.toString()) as Record<string, unknown>;
          } catch {
            return; // ignore non-JSON messages from other test runs
          }
          if (parsed['testId'] === testId) {
            resolveConsumed();
          }
        },
      })
      .catch((err: unknown) => {
        rejectConsumed(err instanceof Error ? err : new Error(String(err)));
      });

    // Give the consumer a moment to start fetching before we produce
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

    await producer.send({
      topic: TEST_TOPIC,
      messages: [{ value: JSON.stringify(testPayload) }],
    });

    // Wait up to 20s for the message
    await Promise.race([
      consumePromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => {
          reject(new Error('Consumer timeout after 20s'));
        }, 20_000)
      ),
    ]);
  });
});
