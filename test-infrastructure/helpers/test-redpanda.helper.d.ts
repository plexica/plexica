/**
 * Test Redpanda Helper
 *
 * Provides utilities for interacting with the test Redpanda instance:
 * - Topic management (create, delete, list)
 * - Message operations (produce, consume)
 * - Consumer group management
 * - Topic metadata and configuration
 */
import { Kafka, IHeaders } from 'kafkajs';
export interface TopicConfig {
    partitions?: number;
    replicationFactor?: number;
    configEntries?: {
        name: string;
        value: string;
    }[];
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
export declare class TestRedpandaHelper {
    private static instance;
    private kafka;
    private producer;
    private admin;
    private consumers;
    private constructor();
    /**
     * Get singleton instance
     */
    static getInstance(): TestRedpandaHelper;
    /**
     * Get Kafka instance
     */
    getKafka(): Kafka;
    /**
     * Get or create producer
     */
    private getProducer;
    /**
     * Get or create admin client
     */
    private getAdmin;
    /**
     * Get or create consumer for a group
     */
    private getConsumer;
    /**
     * Create a topic
     */
    createTopic(topicName: string, config?: TopicConfig): Promise<void>;
    /**
     * Delete a topic
     */
    deleteTopic(topicName: string): Promise<void>;
    /**
     * List all topics
     */
    listTopics(): Promise<string[]>;
    /**
     * Get topic metadata
     */
    getTopicMetadata(topicName: string): Promise<TopicMetadata>;
    /**
     * Produce a message to a topic
     */
    produceMessage(topic: string, message: ProduceMessageOptions): Promise<void>;
    /**
     * Produce multiple messages to a topic
     */
    produceMessages(topic: string, messages: ProduceMessageOptions[]): Promise<void>;
    /**
     * Consume messages from a topic
     *
     * NOTE: This method subscribes to the topic and waits for messages.
     * If you're testing message production, make sure to either:
     * 1. Produce messages AFTER calling this (use timeout to wait), OR
     * 2. Use fromBeginning: true to consume existing messages
     */
    consumeMessages(topic: string, options: ConsumeMessagesOptions): Promise<ConsumedMessage[]>;
    /**
     * Consume messages from a topic (one-time use)
     *
     * This creates a dedicated consumer, consumes messages, and disconnects.
     * Better for testing scenarios where you produce THEN consume.
     *
     * For long-running consumers, use consumeMessages() instead.
     */
    consumeMessagesOnce(topic: string, options: ConsumeMessagesOptions): Promise<ConsumedMessage[]>;
    /**
     * Parse message value (try JSON, fallback to string)
     */
    private parseMessageValue;
    /**
     * List all consumer groups
     */
    listConsumerGroups(): Promise<{
        groupId: string;
    }[]>;
    /**
     * Delete a consumer group
     */
    deleteConsumerGroup(groupId: string): Promise<void>;
    /**
     * Get consumer group offsets
     */
    getConsumerGroupOffsets(groupId: string, topic: string): Promise<any>;
    /**
     * Reset consumer group offsets (start from beginning)
     */
    resetConsumerGroupOffsets(groupId: string, topic: string): Promise<void>;
    /**
     * Clean up all test topics (topics starting with "events." or "test.")
     */
    cleanupAllTopics(): Promise<void>;
    /**
     * Clean up all test consumer groups
     */
    cleanupAllConsumerGroups(): Promise<void>;
    /**
     * Create a tenant-specific topic
     * Naming convention: events.{tenantSlug}.{eventType}
     */
    createTenantTopic(tenantSlug: string, eventType: string, config?: TopicConfig): Promise<string>;
    /**
     * Delete all topics for a tenant
     */
    deleteTenantTopics(tenantSlug: string): Promise<void>;
    /**
     * Disconnect all clients
     */
    disconnect(): Promise<void>;
    /**
     * Health check - verify connection to Redpanda
     */
    healthCheck(): Promise<boolean>;
}
export declare const testRedpanda: TestRedpandaHelper;
