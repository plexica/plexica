// index.ts
// @plexica/sdk — Single PluginSDK class (per v2 Lesson #9).

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
  private subscriptions = new Map<string, EventHandler>();
  private initialized = false;

  constructor(config: PluginConfig) {
    this.config = {
      ...config,
      kafkaBrokers: config.kafkaBrokers ?? process.env['KAFKA_BROKERS'] ?? 'localhost:9092',
      apiUrl: config.apiUrl ?? process.env['CORE_API_URL'] ?? 'http://localhost:3001',
    };
  }

  async initialize(eventPatterns?: string[]): Promise<void> {
    if (this.initialized) return; // Guard against double-init

    const brokers = this.config.kafkaBrokers.split(',').filter((b) => b.length > 0);
    if (brokers.length === 0) {
      throw new Error('KAFKA_BROKERS is empty — check plugin configuration');
    }

    const kafka = new Kafka({
      clientId: `plugin-${this.config.pluginId}`,
      brokers,
    });

    // Connect producer for emitEvent
    this.kafkaProducer = kafka.producer();
    await this.kafkaProducer.connect();

    // Connect consumer for onEvent — subscribe to declared patterns
    if (eventPatterns && eventPatterns.length > 0) {
      this.kafkaConsumer = kafka.consumer({
        groupId: `plugin-${this.config.pluginId}`,
        sessionTimeout: 30_000,
      });
      await this.kafkaConsumer.connect();

      for (const pattern of eventPatterns) {
        await this.kafkaConsumer.subscribe({ topic: pattern, fromBeginning: false });
      }

      this.kafkaConsumer.run({
        eachMessage: async ({ topic, message }) => {
          const event: PluginEvent = JSON.parse(message.value?.toString() ?? '{}');
          const handler = this.subscriptions.get(topic) ?? this.subscriptions.get(event.type);
          if (handler) {
            await handler(event);
          }
        },
      });
    }

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
    this.subscriptions.clear();
    this.initialized = false;
  }

  onEvent(pattern: string, handler: EventHandler): void {
    if (!this.initialized) throw new SdkNotInitializedError();
    this.subscriptions.set(pattern, handler);
  }

  async callApi(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.initialized) throw new SdkNotInitializedError();

    const url = `${this.config.apiUrl.replace(/\/+$/, '')}/${path.replace(/^\//, '')}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Inject auth token
    if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    }

    // Inject X-Plexica context headers per DR-20/ADR-019
    const ctx = this.config.plexicaHeaders;
    if (ctx) {
      if (ctx.tenantId) headers['X-Plexica-Tenant-Id'] = ctx.tenantId;
      if (ctx.userId) headers['X-Plexica-User-Id'] = ctx.userId;
      if (ctx.workspaceId) headers['X-Plexica-Workspace-Id'] = ctx.workspaceId;
      if (ctx.role) headers['X-Plexica-User-Role'] = ctx.role;
      if (ctx.correlationId) headers['X-Plexica-Correlation-Id'] = ctx.correlationId;
    }

    const response = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiCallError(method, path, response.status, text.substring(0, 200));
    }

    return response;
  }

  getContext(): PluginContext {
    const ctx = this.config.plexicaHeaders;
    return {
      tenantId: ctx?.tenantId ?? this.config.tenantId,
      userId: ctx?.userId ?? '',
      workspaceId: ctx?.workspaceId ?? this.config.workspaceId ?? null,
      role: ctx?.role ?? 'viewer',
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

    // Use the type as-is — plugin should provide the full event name
    // (e.g., "crm.contact.created" → becomes "plugin.crm.contact.created")
    const topic = `plugin.${this.config.pluginId}.${type}`;

    await this.kafkaProducer.send({
      topic,
      messages: [
        {
          key: this.config.pluginId,
          value: JSON.stringify({
            type: topic,
            payload,
            timestamp: new Date().toISOString(),
            correlationId: crypto.randomUUID(),
          }),
        },
      ],
    });
  }
}
