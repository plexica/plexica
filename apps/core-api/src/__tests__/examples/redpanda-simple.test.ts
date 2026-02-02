/**
 * Simple Redpanda Test
 * Basic smoke test to verify Redpanda is working
 */

import { describe, it, expect } from 'vitest';
import { Kafka } from 'kafkajs';

describe('Redpanda Basic Test', () => {
  it('should connect to Redpanda and produce/consume a message', async () => {
    const kafka = new Kafka({
      clientId: 'test-simple',
      brokers: ['localhost:9095'],
      retry: {
        retries: 3,
      },
    });

    const admin = kafka.admin();
    const producer = kafka.producer();
    const consumer = kafka.consumer({ groupId: 'test-simple-group' });

    try {
      // Connect
      await admin.connect();
      await producer.connect();
      await consumer.connect();

      // Create topic
      const topicName = `test-simple-${Date.now()}`;
      await admin.createTopics({
        topics: [
          {
            topic: topicName,
            numPartitions: 1,
            replicationFactor: 1,
          },
        ],
      });

      // Subscribe BEFORE producing
      await consumer.subscribe({ topics: [topicName], fromBeginning: true });

      const receivedMessages: any[] = [];
      const messagePromise = new Promise((resolve) => {
        consumer.run({
          eachMessage: async ({ message }) => {
            receivedMessages.push(message.value?.toString());
            resolve(null);
          },
        });
      });

      // Give consumer time to be ready
      await new Promise((r) => setTimeout(r, 1000));

      // Produce message
      await producer.send({
        topic: topicName,
        messages: [{ value: 'Hello Redpanda!' }],
      });

      // Wait for message with timeout
      await Promise.race([
        messagePromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000)),
      ]);

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toBe('Hello Redpanda!');

      // Cleanup
      await consumer.disconnect();
      await producer.disconnect();
      await admin.deleteTopics({ topics: [topicName] });
      await admin.disconnect();
    } catch (error) {
      await consumer.disconnect();
      await producer.disconnect();
      await admin.disconnect();
      throw error;
    }
  }, 15000); // 15s timeout
});
