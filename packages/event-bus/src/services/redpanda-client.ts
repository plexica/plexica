import { Kafka, Producer, Consumer, Admin, logLevel } from 'kafkajs';
import type { EventBusConfig, ClusterHealth, BrokerInfo } from '../types';

/**
 * Redpanda client wrapper around KafkaJS
 * Provides connection pooling, health checks, and configuration management
 */
export class RedpandaClient {
  private kafka: Kafka;
  private producer: Producer | null = null;
  private admin: Admin | null = null;
  private consumers: Map<string, Consumer> = new Map();
  private isConnected = false;

  constructor(private config: EventBusConfig) {
    this.kafka = new Kafka({
      clientId: config.clientId || 'plexica-event-bus',
      brokers: config.brokers,
      connectionTimeout: config.connectionTimeout || 10000,
      requestTimeout: config.requestTimeout || 30000,
      retry: {
        maxRetryTime: config.retry?.maxRetryTime || 30000,
        initialRetryTime: config.retry?.initialRetryTime || 300,
        factor: config.retry?.factor || 0.2,
        multiplier: config.retry?.multiplier || 2,
        retries: config.retry?.retries || 5,
      },
      ssl: config.ssl,
      sasl: config.sasl as any, // KafkaJS has strict union types
      logLevel: logLevel.INFO,
    });
  }

  /**
   * Initialize and connect producer
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Initialize producer
      this.producer = this.kafka.producer({
        idempotent: true, // Ensure exactly-once semantics
        maxInFlightRequests: 5,
        retry: {
          retries: 3,
          initialRetryTime: 100,
        },
      });

      await this.producer.connect();

      // Initialize admin client
      this.admin = this.kafka.admin();
      await this.admin.connect();

      this.isConnected = true;
      console.log('✅ Redpanda client connected successfully');
    } catch (error) {
      console.error('❌ Failed to connect to Redpanda:', error);
      throw error;
    }
  }

  /**
   * Disconnect all clients
   */
  async disconnect(): Promise<void> {
    try {
      if (this.producer) {
        await this.producer.disconnect();
        this.producer = null;
      }

      if (this.admin) {
        await this.admin.disconnect();
        this.admin = null;
      }

      const groupIds = Array.from(this.consumers.keys());
      for (const groupId of groupIds) {
        const consumer = this.consumers.get(groupId)!;
        await consumer.disconnect();
        console.log(`Disconnected consumer group: ${groupId}`);
      }

      this.consumers.clear();
      this.isConnected = false;
      console.log('✅ Redpanda client disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting Redpanda client:', error);
      throw error;
    }
  }

  /**
   * Get or create producer
   */
  getProducer(): Producer {
    if (!this.producer) {
      throw new Error('Producer not initialized. Call connect() first.');
    }
    return this.producer;
  }

  /**
   * Get or create admin client
   */
  getAdmin(): Admin {
    if (!this.admin) {
      throw new Error('Admin client not initialized. Call connect() first.');
    }
    return this.admin;
  }

  /**
   * Create or get consumer for a group
   */
  async getConsumer(groupId: string): Promise<Consumer> {
    if (this.consumers.has(groupId)) {
      return this.consumers.get(groupId)!;
    }

    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
      maxWaitTimeInMs: 100,
      retry: {
        retries: 5,
        initialRetryTime: 300,
      },
    });

    await consumer.connect();
    this.consumers.set(groupId, consumer);

    console.log(`✅ Created consumer for group: ${groupId}`);
    return consumer;
  }

  /**
   * Remove and disconnect a consumer
   */
  async removeConsumer(groupId: string): Promise<void> {
    const consumer = this.consumers.get(groupId);
    if (consumer) {
      await consumer.disconnect();
      this.consumers.delete(groupId);
      console.log(`✅ Removed consumer group: ${groupId}`);
    }
  }

  /**
   * Health check - verify cluster connectivity
   */
  async healthCheck(): Promise<ClusterHealth> {
    try {
      const admin = this.getAdmin();
      const cluster = await admin.describeCluster();

      const brokers: BrokerInfo[] = cluster.brokers.map((broker) => ({
        nodeId: broker.nodeId,
        host: broker.host,
        port: broker.port,
        rack: (broker as any).rack || undefined,
      }));

      return {
        healthy: brokers.length > 0,
        nodeCount: brokers.length,
        brokers,
      };
    } catch (error) {
      console.error('❌ Redpanda health check failed:', error);
      return {
        healthy: false,
        nodeCount: 0,
        brokers: [],
      };
    }
  }

  /**
   * Get connection status
   */
  isHealthy(): boolean {
    return this.isConnected && this.producer !== null && this.admin !== null;
  }

  /**
   * Get consumer count
   */
  getConsumerCount(): number {
    return this.consumers.size;
  }

  /**
   * Get all consumer group IDs
   */
  getConsumerGroupIds(): string[] {
    return Array.from(this.consumers.keys());
  }
}
