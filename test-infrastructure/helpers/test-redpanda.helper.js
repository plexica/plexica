"use strict";
/**
 * Test Redpanda Helper
 *
 * Provides utilities for interacting with the test Redpanda instance:
 * - Topic management (create, delete, list)
 * - Message operations (produce, consume)
 * - Consumer group management
 * - Topic metadata and configuration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRedpanda = exports.TestRedpandaHelper = void 0;
const kafkajs_1 = require("kafkajs");
class TestRedpandaHelper {
    static instance;
    kafka;
    producer = null;
    admin = null;
    consumers = new Map();
    constructor() {
        const brokers = (process.env.REDPANDA_BROKERS || 'localhost:9095').split(',');
        const clientId = process.env.KAFKA_CLIENT_ID || 'plexica-test-client';
        this.kafka = new kafkajs_1.Kafka({
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
    static getInstance() {
        if (!TestRedpandaHelper.instance) {
            TestRedpandaHelper.instance = new TestRedpandaHelper();
        }
        return TestRedpandaHelper.instance;
    }
    /**
     * Get Kafka instance
     */
    getKafka() {
        return this.kafka;
    }
    /**
     * Get or create producer
     */
    async getProducer() {
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
    async getAdmin() {
        if (!this.admin) {
            this.admin = this.kafka.admin();
            await this.admin.connect();
        }
        return this.admin;
    }
    /**
     * Get or create consumer for a group
     */
    async getConsumer(groupId) {
        if (!this.consumers.has(groupId)) {
            const consumer = this.kafka.consumer({
                groupId,
                sessionTimeout: 30000,
                heartbeatInterval: 3000,
            });
            await consumer.connect();
            this.consumers.set(groupId, consumer);
        }
        return this.consumers.get(groupId);
    }
    /**
     * Create a topic
     */
    async createTopic(topicName, config = {}) {
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
    async deleteTopic(topicName) {
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
    async listTopics() {
        const admin = await this.getAdmin();
        return await admin.listTopics();
    }
    /**
     * Get topic metadata
     */
    async getTopicMetadata(topicName) {
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
    async produceMessage(topic, message) {
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
    async produceMessages(topic, messages) {
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
    async consumeMessages(topic, options) {
        const consumer = await this.getConsumer(options.groupId);
        const messages = [];
        const timeout = options.timeout || 5000;
        const maxMessages = options.maxMessages || 100;
        await consumer.subscribe({
            topics: [topic],
            fromBeginning: options.fromBeginning ?? true,
        });
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                consumer.stop().then(() => resolve(messages));
            }, timeout);
            consumer
                .run({
                eachMessage: async ({ topic, partition, message }) => {
                    const parsedMessage = {
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
    async consumeMessagesOnce(topic, options) {
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
        const messages = [];
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
                const timeoutId = setTimeout(async () => {
                    if (!resolved) {
                        resolved = true;
                        try {
                            await consumer.disconnect();
                        }
                        catch { }
                        resolve(messages);
                    }
                }, timeout);
                consumer
                    .run({
                    eachMessage: async ({ topic, partition, message }) => {
                        if (resolved)
                            return;
                        const parsedMessage = {
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
                                    consumer.disconnect().catch(() => { });
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
                            .catch(() => { })
                            .then(() => reject(error));
                    }
                });
            });
        }
        catch (error) {
            try {
                await consumer.disconnect();
            }
            catch { }
            throw error;
        }
    }
    /**
     * Parse message value (try JSON, fallback to string)
     */
    parseMessageValue(value) {
        if (!value)
            return null;
        const stringValue = value.toString();
        try {
            return JSON.parse(stringValue);
        }
        catch {
            return stringValue;
        }
    }
    /**
     * List all consumer groups
     */
    async listConsumerGroups() {
        const admin = await this.getAdmin();
        const groups = await admin.listGroups();
        return groups.groups;
    }
    /**
     * Delete a consumer group
     */
    async deleteConsumerGroup(groupId) {
        const admin = await this.getAdmin();
        await admin.deleteGroups([groupId]);
    }
    /**
     * Get consumer group offsets
     */
    async getConsumerGroupOffsets(groupId, topic) {
        const admin = await this.getAdmin();
        return await admin.fetchOffsets({
            groupId,
            topics: [topic],
        });
    }
    /**
     * Reset consumer group offsets (start from beginning)
     */
    async resetConsumerGroupOffsets(groupId, topic) {
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
    async cleanupAllTopics() {
        const topics = await this.listTopics();
        const testTopics = topics.filter((t) => t.startsWith('events.') || t.startsWith('test.') || t.startsWith('plexica.'));
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
    async cleanupAllConsumerGroups() {
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
    async createTenantTopic(tenantSlug, eventType, config = {}) {
        const topicName = `events.${tenantSlug}.${eventType}`;
        await this.createTopic(topicName, config);
        return topicName;
    }
    /**
     * Delete all topics for a tenant
     */
    async deleteTenantTopics(tenantSlug) {
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
    async disconnect() {
        // Disconnect all consumers
        for (const [groupId, consumer] of this.consumers.entries()) {
            try {
                await consumer.disconnect();
            }
            catch (error) {
                console.warn(`Failed to disconnect consumer ${groupId}:`, error);
            }
        }
        this.consumers.clear();
        // Disconnect producer
        if (this.producer) {
            try {
                await this.producer.disconnect();
            }
            catch (error) {
                console.warn('Failed to disconnect producer:', error);
            }
            this.producer = null;
        }
        // Disconnect admin
        if (this.admin) {
            try {
                await this.admin.disconnect();
            }
            catch (error) {
                console.warn('Failed to disconnect admin:', error);
            }
            this.admin = null;
        }
    }
    /**
     * Health check - verify connection to Redpanda
     */
    async healthCheck() {
        try {
            const admin = await this.getAdmin();
            await admin.listTopics();
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.TestRedpandaHelper = TestRedpandaHelper;
// Export singleton instance
exports.testRedpanda = TestRedpandaHelper.getInstance();
