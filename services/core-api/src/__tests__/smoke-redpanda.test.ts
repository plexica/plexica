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
    const testPayload = { type: 'smoke-test', ts: Date.now() };
    const received: unknown[] = [];

    await consumer.subscribe({ topic: TEST_TOPIC, fromBeginning: false });

    // Wait for the consumer to join the group and receive partition assignment
    // before producing, to avoid the offset-anchor race (fromBeginning: false means
    // messages produced before assignment is anchored are silently missed).
    const groupJoined = new Promise<void>((resolve) => {
      consumer.on('consumer.group_join', () => { resolve(); });
    });

    // Start consuming in background
    const consumePromise = new Promise<void>((resolve) => {
      void consumer.run({
        eachMessage: async ({ message }) => {
          if (message.value !== null) {
            received.push(JSON.parse(message.value.toString()) as unknown);
            resolve();
          }
        },
      });
    });

    // Wait for group join before producing
    await groupJoined;

    await producer.send({
      topic: TEST_TOPIC,
      messages: [{ value: JSON.stringify(testPayload) }],
    });

    // Wait up to 20s for the message
    await Promise.race([
      consumePromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => { reject(new Error('Consumer timeout')); }, 20_000)
      ),
    ]);

    expect(received.length).toBeGreaterThanOrEqual(1);
    const msg = received[received.length - 1] as Record<string, unknown>;
    expect(msg['type']).toBe('smoke-test');
  });
});
