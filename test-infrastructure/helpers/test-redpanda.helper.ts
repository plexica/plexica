/**
 * Test Redpanda Helper
 *
 * Provides utilities for interacting with the test Redpanda instance:
 * - Topic management (create, delete, list)
 * - Message operations (produce, consume)
 * - Consumer group management
 * - Topic metadata and configuration
 */

import { Kafka, Producer, Consumer, Admin, IHeaders } from 'kafkajs';
import { sanitizeTimeoutMs } from './safe-timeout.helper';

// Workaround: kafkajs RequestQueue may schedule a setTimeout with a negative
// delay when throttledUntil is far in the past. That causes Node to emit
// TimeoutNegativeWarning. Patch the prototype in test environment to ensure
// scheduled delays are non-negative. This keeps tests quiet and avoids noise
// during integration/E2E runs.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RequestQueue = require('kafkajs/src/network/requestQueue');
  if (RequestQueue && RequestQueue.prototype && !RequestQueue.prototype.__patchedForTests) {
    const original = RequestQueue.prototype.scheduleCheckPendingRequests;
    RequestQueue.prototype.scheduleCheckPendingRequests = function patchedSchedule() {
      try {
        let scheduleAt = this.throttledUntil - Date.now();
        if (!this.throttleCheckTimeoutId) {
          if (this.pending.length > 0) {
            // prefer a short delay when there are pending requests
            scheduleAt = scheduleAt > 0 ? scheduleAt : 10; // CHECK_PENDING_REQUESTS_INTERVAL
          } else {
            // fallback to a small non-negative delay
            scheduleAt = scheduleAt > 0 ? scheduleAt : 10;
          }

          // sanitize and clamp schedule to safe integer range before scheduling
          const delayMs = Math.max(1, sanitizeTimeoutMs(scheduleAt));

          this.throttleCheckTimeoutId = setTimeout(() => {
            this.throttleCheckTimeoutId = null;
            this.checkPendingRequests();
          }, delayMs);
        }
      } catch (err) {
        // If anything goes wrong, fallback to original implementation
        try {
          return original.call(this);
        } catch (_) {
          /* ignore */
        }
      }
    };
    RequestQueue.prototype.__patchedForTests = true;
  }
} catch (e) {
  // Best-effort only; if require fails (e.g., different install layout) ignore.
}

export interface TopicConfig {
  partitions?: number;
  replicationFactor?: number;
  configEntries?: { name: string; value: string }[];
}

export interface ProduceMessageOptions {
  key?: string;
  value: any;
  headers?: IHeaders;
  partition?: number;
}

export interface ConsumeMessagesOptions {
  groupId: string;
  fromBeginning?: boolean;
  timeout?: number;
  maxMessages?: number;
}

export interface TopicMetadata {
  name: string;
  partitions: Array<{
    partitionId: number;
    leader: number;
    replicas: number[];
    isr: number[];
  }>;
}

export interface ConsumedMessage {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: any;
  headers: IHeaders;
  timestamp: string;
}

export class TestRedpandaHelper {
  private static instance: TestRedpandaHelper;
  private kafka: Kafka;
  private producer: Producer | null = null;
  private admin: Admin | null = null;
  private consumers: Map<string, Consumer> = new Map();

  private constructor() {
    const brokers = (process.env.REDPANDA_BROKERS || 'localhost:9095').split(',');
    const clientId = process.env.KAFKA_CLIENT_ID || 'plexica-test-client';

    this.kafka = new Kafka({
      clientId,
      brokers,
      retry: {
        retries: 3,
        initialRetryTime: 100,
        maxRetryTime: 30000,
      },
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TestRedpandaHelper {
    if (!TestRedpandaHelper.instance) {
      TestRedpandaHelper.instance = new TestRedpandaHelper();
    }
    return TestRedpandaHelper.instance;
  }

  /**
   * Get Kafka instance
   */
  getKafka(): Kafka {
    return this.kafka;
  }

  /**
   * Get or create producer
   */
  private async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer({
        allowAutoTopicCreation: false,
        transactionTimeout: 30000,
      });
      await this.producer.connect();
    }
    return this.producer;
  }

  /**
   * Get or create admin client
   */
  private async getAdmin(): Promise<Admin> {
    if (!this.admin) {
      this.admin = this.kafka.admin();
      await this.admin.connect();
    }
    return this.admin;
  }

  /**
   * Get or create consumer for a group
   */
  private async getConsumer(groupId: string): Promise<Consumer> {
    if (!this.consumers.has(groupId)) {
      const consumer = this.kafka.consumer({
        groupId,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
      });
      await consumer.connect();
      this.consumers.set(groupId, consumer);
    }
    return this.consumers.get(groupId)!;
  }

  /**
   * Create a topic
   */
  async createTopic(topicName: string, config: TopicConfig = {}): Promise<void> {
    const admin = await this.getAdmin();

    const topics = await admin.listTopics();
    if (topics.includes(topicName)) {
      return; // Topic already exists
    }

    await admin.createTopics({
      topics: [
        {
          topic: topicName,
          numPartitions: config.partitions || 3,
          replicationFactor: config.replicationFactor || 1,
          configEntries: config.configEntries || [],
        },
      ],
      waitForLeaders: true,
      timeout: 10000,
    });
  }

  /**
   * Delete a topic
   */
  async deleteTopic(topicName: string): Promise<void> {
    const admin = await this.getAdmin();

    const topics = await admin.listTopics();
    if (!topics.includes(topicName)) {
      return; // Topic doesn't exist
    }

    await admin.deleteTopics({
      topics: [topicName],
      timeout: 10000,
    });
  }

  /**
   * List all topics
   */
  async listTopics(): Promise<string[]> {
    const admin = await this.getAdmin();
    return await admin.listTopics();
  }

  /**
   * Get topic metadata
   */
  async getTopicMetadata(topicName: string): Promise<TopicMetadata> {
    const admin = await this.getAdmin();

    const metadata = await admin.fetchTopicMetadata({
      topics: [topicName],
    });

    const topic = metadata.topics[0];
    if (!topic) {
      throw new Error(`Topic ${topicName} not found`);
    }

    return {
      name: topic.name,
      partitions: topic.partitions.map((p) => ({
        partitionId: p.partitionId,
        leader: p.leader,
        replicas: p.replicas,
        isr: p.isr,
      })),
    };
  }

  /**
   * Produce a message to a topic
   */
  async produceMessage(topic: string, message: ProduceMessageOptions): Promise<void> {
    const producer = await this.getProducer();

    const value = typeof message.value === 'string' ? message.value : JSON.stringify(message.value);

    await producer.send({
      topic,
      messages: [
        {
          key: message.key,
          value,
          headers: message.headers,
          partition: message.partition,
        },
      ],
    });
  }

  /**
   * Produce multiple messages to a topic
   */
  async produceMessages(topic: string, messages: ProduceMessageOptions[]): Promise<void> {
    const producer = await this.getProducer();

    const kafkaMessages = messages.map((msg) => {
      const value = typeof msg.value === 'string' ? msg.value : JSON.stringify(msg.value);

      return {
        key: msg.key,
        value,
        headers: msg.headers,
        partition: msg.partition,
      };
    });

    await producer.send({
      topic,
      messages: kafkaMessages,
    });
  }

  /**
   * Consume messages from a topic
   *
   * NOTE: This method subscribes to the topic and waits for messages.
   * If you're testing message production, make sure to either:
   * 1. Produce messages AFTER calling this (use timeout to wait), OR
   * 2. Use fromBeginning: true to consume existing messages
   */
  async consumeMessages(
    topic: string,
    options: ConsumeMessagesOptions
  ): Promise<ConsumedMessage[]> {
    const consumer = await this.getConsumer(options.groupId);
    const messages: ConsumedMessage[] = [];
    const timeout = options.timeout || 5000;
    const maxMessages = options.maxMessages || 100;

    await consumer.subscribe({
      topics: [topic],
      fromBeginning: options.fromBeginning ?? true,
    });

    return new Promise((resolve, reject) => {
      const safeTimeout = sanitizeTimeoutMs(timeout);
      const timeoutId = setTimeout(() => {
        consumer.stop().then(() => resolve(messages));
      }, safeTimeout);

      consumer
        .run({
          eachMessage: async ({ topic, partition, message }) => {
            const parsedMessage: ConsumedMessage = {
              topic,
              partition,
              offset: message.offset,
              key: message.key ? message.key.toString() : null,
              value: this.parseMessageValue(message.value),
              headers: message.headers || {},
              timestamp: message.timestamp,
            };

            messages.push(parsedMessage);

            if (messages.length >= maxMessages) {
              clearTimeout(timeoutId);
              await consumer.stop();
              resolve(messages);
            }
          },
        })
        .catch(reject);
    });
  }

  /**
   * Consume messages from a topic (one-time use)
   *
   * This creates a dedicated consumer, consumes messages, and disconnects.
   * Better for testing scenarios where you produce THEN consume.
   *
   * For long-running consumers, use consumeMessages() instead.
   */
  async consumeMessagesOnce(
    topic: string,
    options: ConsumeMessagesOptions
  ): Promise<ConsumedMessage[]> {
    // Create a truly unique consumer for this operation
    const uniqueGroupId = `test-${topic.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const consumer = this.kafka.consumer({
      groupId: uniqueGroupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      retry: {
        retries: 5,
      },
    });

    const messages: ConsumedMessage[] = [];
    const timeout = options.timeout || 10000; // Increased default to 10s
    const maxMessages = options.maxMessages || 100;
    const fromBeginning = options.fromBeginning ?? true;

    try {
      await consumer.connect();

      // Subscribe to the topic
      await consumer.subscribe({
        topics: [topic],
        fromBeginning,
      });

      return await new Promise((resolve, reject) => {
        let resolved = false;

        const safeTimeout = sanitizeTimeoutMs(timeout);
        const timeoutId = setTimeout(async () => {
          if (!resolved) {
            resolved = true;
            try {
              await consumer.disconnect();
            } catch {}
            resolve(messages);
          }
        }, safeTimeout);

        consumer
          .run({
            eachMessage: async ({ topic, partition, message }) => {
              if (resolved) return;

              const parsedMessage: ConsumedMessage = {
                topic,
                partition,
                offset: message.offset,
                key: message.key ? message.key.toString() : null,
                value: this.parseMessageValue(message.value),
                headers: message.headers || {},
                timestamp: message.timestamp,
              };

              messages.push(parsedMessage);

              if (messages.length >= maxMessages) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeoutId);
                  // Resolve immediately, disconnect in background
                  setImmediate(() => {
                    consumer.disconnect().catch(() => {});
                  });
                  resolve(messages);
                }
              }
            },
          })
          .catch((error) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              consumer
                .disconnect()
                .catch(() => {})
                .then(() => reject(error));
            }
          });
      });
    } catch (error) {
      try {
        await consumer.disconnect();
      } catch {}
      throw error;
    }
  }

  /**
   * Parse message value (try JSON, fallback to string)
   */
  private parseMessageValue(value: Buffer | null): any {
    if (!value) return null;

    const stringValue = value.toString();
    try {
      return JSON.parse(stringValue);
    } catch {
      return stringValue;
    }
  }

  /**
   * List all consumer groups
   */
  async listConsumerGroups(): Promise<{ groupId: string }[]> {
    const admin = await this.getAdmin();
    const groups = await admin.listGroups();
    return groups.groups;
  }

  /**
   * Delete a consumer group
   */
  async deleteConsumerGroup(groupId: string): Promise<void> {
    const admin = await this.getAdmin();
    await admin.deleteGroups([groupId]);
  }

  /**
   * Get consumer group offsets
   */
  async getConsumerGroupOffsets(groupId: string, topic: string): Promise<any> {
    const admin = await this.getAdmin();
    return await admin.fetchOffsets({
      groupId,
      topics: [topic],
    });
  }

  /**
   * Reset consumer group offsets (start from beginning)
   */
  async resetConsumerGroupOffsets(groupId: string, topic: string): Promise<void> {
    const admin = await this.getAdmin();

    // Get topic metadata to find partitions
    const metadata = await this.getTopicMetadata(topic);

    // Reset all partitions to offset 0
    const offsets = metadata.partitions.map((p) => ({
      partition: p.partitionId,
      offset: '0',
    }));

    await admin.setOffsets({
      groupId,
      topic,
      partitions: offsets,
    });
  }

  /**
   * Clean up all test topics (topics starting with "events." or "test.")
   */
  async cleanupAllTopics(): Promise<void> {
    const topics = await this.listTopics();
    const testTopics = topics.filter(
      (t) => t.startsWith('events.') || t.startsWith('test.') || t.startsWith('plexica.')
    );

    if (testTopics.length > 0) {
      const admin = await this.getAdmin();
      await admin.deleteTopics({
        topics: testTopics,
        timeout: 10000,
      });
    }
  }

  /**
   * Clean up all test consumer groups
   */
  async cleanupAllConsumerGroups(): Promise<void> {
    const groups = await this.listConsumerGroups();
    const testGroups = groups
      .map((g) => g.groupId)
      .filter((g) => g.startsWith('test-') || g.startsWith('plexica-test-'));

    if (testGroups.length > 0) {
      const admin = await this.getAdmin();
      await admin.deleteGroups(testGroups);
    }
  }

  /**
   * Create a tenant-specific topic
   * Naming convention: events.{tenantSlug}.{eventType}
   */
  async createTenantTopic(
    tenantSlug: string,
    eventType: string,
    config: TopicConfig = {}
  ): Promise<string> {
    const topicName = `events.${tenantSlug}.${eventType}`;
    await this.createTopic(topicName, config);
    return topicName;
  }

  /**
   * Delete all topics for a tenant
   */
  async deleteTenantTopics(tenantSlug: string): Promise<void> {
    const topics = await this.listTopics();
    const tenantTopics = topics.filter((t) => t.startsWith(`events.${tenantSlug}.`));

    if (tenantTopics.length > 0) {
      const admin = await this.getAdmin();
      await admin.deleteTopics({
        topics: tenantTopics,
        timeout: 10000,
      });
    }
  }

  /**
   * Disconnect all clients
   */
  async disconnect(): Promise<void> {
    // Disconnect all consumers
    for (const [groupId, consumer] of this.consumers.entries()) {
      try {
        await consumer.disconnect();
      } catch (error) {
        console.warn(`Failed to disconnect consumer ${groupId}:`, error);
      }
    }
    this.consumers.clear();

    // Disconnect producer
    if (this.producer) {
      try {
        await this.producer.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect producer:', error);
      }
      this.producer = null;
    }

    // Disconnect admin
    if (this.admin) {
      try {
        await this.admin.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect admin:', error);
      }
      this.admin = null;
    }
  }

  /**
   * Health check - verify connection to Redpanda
   */
  async healthCheck(): Promise<boolean> {
    try {
      const admin = await this.getAdmin();
      await admin.listTopics();
      return true;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const testRedpanda = TestRedpandaHelper.getInstance();
