// index.ts
// @plexica/sdk — Single PluginSDK class (per v2 Lesson #9).
// Constructor injection pattern. One class, all plugin APIs.

import { Kafka, type Consumer, type Producer } from 'kafkajs';
import {
  SdkNotInitializedError,
  EventSubscriptionError,
  ApiCallError,
  DbAccessError,
} from './errors.js';

import type { PluginConfig, PluginContext, PluginEvent, EventHandler } from './types.js';

export class PluginSDK {
  private config: PluginConfig;
  private kafkaConsumer: Consumer | null = null;
  private kafkaProducer: Producer | null = null;
  private dbClient: unknown = null;
  private subscriptions = new Map<string, EventHandler>();
  private initialized = false;

  constructor(config: PluginConfig) {
    this.config = {
      ...config,
      kafkaBrokers: config.kafkaBrokers ?? process.env['KAFKA_BROKERS'] ?? 'localhost:9092',
      apiUrl: config.apiUrl ?? process.env['CORE_API_URL'] ?? 'http://localhost:3001',
    };
  }

  async initialize(): Promise<void> {
    // Connect to Kafka for event streaming
    const kafka = new Kafka({
      clientId: `plugin-${this.config.pluginId}`,
      brokers: this.config.kafkaBrokers.split(','),
    });

    this.kafkaProducer = kafka.producer();
    await this.kafkaProducer.connect();

    this.initialized = true;
  }

  async destroy(): Promise<void> {
    if (this.kafkaConsumer) {
      await this.kafkaConsumer.disconnect();
      this.kafkaConsumer = null;
    }
    if (this.kafkaProducer) {
      await this.kafkaProducer.disconnect();
      this.kafkaProducer = null;
    }
    this.initialized = false;
  }

  onEvent(pattern: string, handler: EventHandler): void {
    if (!this.initialized) throw new SdkNotInitializedError();
    if (this.subscriptions.has(pattern)) {
      throw new EventSubscriptionError(pattern, 'Handler already registered for this pattern');
    }
    this.subscriptions.set(pattern, handler);
  }

  async callApi(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.initialized) throw new SdkNotInitializedError();

    const url = `${this.config.apiUrl.replace(/\/+$/, '')}/${path.replace(/^\//, '')}`;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiCallError(method, path, response.status, text.substring(0, 200));
    }

    return response;
  }

  getContext(): PluginContext {
    return {
      tenantId: this.config.tenantId,
      userId: '',
      workspaceId: this.config.workspaceId ?? null,
      role: 'viewer',
    };
  }

  getDb(): never {
    throw new DbAccessError(
      'Direct database access is only available inside the platform runtime. ' +
        'Use callApi() for data operations.'
    );
  }

  async emitEvent(type: string, payload: unknown): Promise<void> {
    if (!this.initialized) throw new SdkNotInitializedError();
    if (!this.kafkaProducer) throw new SdkNotInitializedError();

    await this.kafkaProducer.send({
      topic: `plugin.${this.config.pluginId}.${type}`,
      messages: [
        {
          key: this.config.pluginId,
          value: JSON.stringify({
            type: `plugin.${this.config.pluginId}.${type}`,
            payload,
            timestamp: new Date().toISOString(),
            correlationId: crypto.randomUUID(),
          }),
        },
      ],
    });
  }
}
