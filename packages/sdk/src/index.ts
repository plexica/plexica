// index.ts
// @plexica/sdk — Single PluginSDK class (per v2 Lesson #9).
// Events: dispatched via HTTP POST /_plexica/event (core → plugin backend).
// No direct Kafka connection — core manages all Kafka consumption/production.
// DB: delegated to PluginDb (db.ts) — returns a typed pg.Pool.
// HTTP: delegated to PluginHttp (http.ts) — callApi/emitEvent to core.
// Dogfooded by examples/plugins/crm since 2026-08-18 (ADR-019 adoption).

import { SdkNotInitializedError, DbAccessError } from './errors.js';
import { PluginDb } from './db.js';
import { PluginHttp } from './http.js';

import type { Pool } from 'pg';
import type { PluginConfig, PluginContext, PluginEvent, EventHandler } from './types.js';

// Re-export public types so consumers can import them from '@plexica/sdk'.
export type { PluginConfig, PluginContext, PluginEvent, EventHandler };
// Re-export error classes and DB helper for advanced use.
export { DbAccessError, ApiCallError, SdkNotInitializedError } from './errors.js';
export { PluginDb } from './db.js';

export class PluginSDK {
  private config: PluginConfig;
  private handlers: Array<{ pattern: string; handler: EventHandler }> = [];
  private initialized = false;
  private readonly db: PluginDb;
  private readonly http: PluginHttp;

  constructor(config: PluginConfig) {
    this.config = {
      ...config,
      apiUrl: config.apiUrl ?? process.env['CORE_API_URL'] ?? 'http://localhost:3001',
    };
    const svcToken = config.serviceToken ?? process.env['PLEXICA_SERVICE_TOKEN'];
    const instId = config.installId ?? process.env['PLEXICA_INSTALL_ID'];
    if (svcToken) this.config.serviceToken = svcToken;
    if (instId) this.config.installId = instId;
    this.db = new PluginDb(
      config.onError === undefined ? {} : { onError: config.onError },
    );
    this.http = new PluginHttp(this.config);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async destroy(): Promise<void> {
    this.handlers = [];
    this.initialized = false;
    await this.db.close();
  }

  /** Register an event handler for a pattern (supports glob `.*` suffix). */
  onEvent(pattern: string, handler: EventHandler): void {
    this.handlers.push({ pattern, handler });
  }

  /** Dispatch an incoming event to matching registered handlers. */
  async dispatchEvent(event: PluginEvent): Promise<void> {
    if (!this.initialized) throw new SdkNotInitializedError();
    const matching = this.handlers.filter((e) => this.matches(event.type, e.pattern));
    await Promise.all(matching.map((e) => e.handler(event)));
  }

  private matches(eventType: string, pattern: string): boolean {
    if (pattern === eventType) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix) && eventType.charAt(prefix.length) === '.';
    }
    return false;
  }

  /** Authenticated API call to core. @throws {ApiCallError} on non-2xx. */
  async callApi(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.initialized) throw new SdkNotInitializedError();
    return this.http.callApi(method, path, body);
  }

  /** Emit a custom event (type auto-prefixed with `plugin.<slug>.`). */
  async emitEvent(type: string, payload: unknown): Promise<void> {
    if (!this.initialized) throw new SdkNotInitializedError();
    return this.http.emitEvent(type, payload);
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

  /** Typed pg.Pool scoped to the plugin's declared tables. @throws {DbAccessError} */
  async getDb(): Promise<Pool> {
    return this.db.getPool(this.requireConnStr());
  }

  /** Parameterized query against the plugin's declared tables. */
  async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    return this.db.query(this.requireConnStr(), sql, params);
  }

  /** Parameterized query returning the first row, or null. */
  async queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
    return this.db.queryOne(this.requireConnStr(), sql, params);
  }

  private requireConnStr(): string {
    const cs = this.config.dbConnectionString ?? process.env['DATABASE_URL'];
    if (!cs) throw new DbAccessError('DB operations require the platform runtime.');
    return cs;
  }
}
