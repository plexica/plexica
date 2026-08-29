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

/**
 * Main SDK class for Plexica plugin backends.
 *
 * Provides a unified interface for:
 * - Event subscription and dispatch (via HTTP, no direct Kafka)
 * - Authenticated API calls to the core platform
 * - Scoped database access to plugin-declared tables
 * - Context extraction (tenant, user, workspace, role)
 *
 * @example
 * ```typescript
 * const sdk = new PluginSDK({ pluginId: 'crm', slug: 'crm', tenantId: 'acme' });
 * await sdk.initialize();
 * sdk.onEvent('tenant.created', async (event) => { ... });
 * await sdk.destroy();
 * ```
 */
export class PluginSDK {
  private config: PluginConfig;
  private handlers: Array<{ pattern: string; handler: EventHandler }> = [];
  private initialized = false;
  private readonly db: PluginDb;
  private readonly http: PluginHttp;

  /**
   * Creates a new PluginSDK instance.
   *
   * @param config - Plugin configuration including IDs, credentials, and optional callbacks
   */
  constructor(config: PluginConfig) {
    this.config = {
      ...config,
      apiUrl: config.apiUrl ?? process.env['CORE_API_URL'] ?? 'http://localhost:3001',
    };
    const svcToken = config.serviceToken ?? process.env['PLEXICA_SERVICE_TOKEN'];
    const instId = config.installId ?? process.env['PLEXICA_INSTALL_ID'];
    if (svcToken) this.config.serviceToken = svcToken;
    if (instId) this.config.installId = instId;
    this.db = new PluginDb(config.onError === undefined ? {} : { onError: config.onError });
    this.http = new PluginHttp(this.config);
  }

  /**
   * Initializes the SDK. Must be called before using event/API methods.
   * Idempotent - safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  /**
   * Shuts down the SDK, clearing event handlers and closing database connections.
   * Should be called during plugin backend graceful shutdown.
   */
  async destroy(): Promise<void> {
    this.handlers = [];
    this.initialized = false;
    await this.db.close();
  }

  /**
   * Register an event handler for a specific event type or pattern.
   * Supports wildcard matching with `.*` suffix (e.g., 'tenant.*' matches 'tenant.created').
   *
   * @param pattern - Event type or glob pattern to match
   * @param handler - Async callback to invoke when matching events are dispatched
   *
   * @example
   * sdk.onEvent('tenant.created', async (event) => { console.log(event.payload); });
   * sdk.onEvent('workspace.*', async (event) => { ... });
   */
  onEvent(pattern: string, handler: EventHandler): void {
    this.handlers.push({ pattern, handler });
  }

  /**
   * Dispatch an incoming event to all matching registered handlers.
   * Called by the platform when events are delivered via POST /_plexica/event.
   * Handlers run concurrently (Promise.all).
   *
   * @param event - Event object received from the platform
   * @throws {SdkNotInitializedError} if SDK not initialized
   */
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

  /**
   * Authenticated API call to core.
   *
   * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param path - API path relative to core API base URL
   * @param body - Optional request body (will be JSON-serialized)
   * @returns Response object from fetch
   * @throws {ApiCallError} on non-2xx response
   * @throws {SdkNotInitializedError} if SDK not initialized
   */
  async callApi(method: string, path: string, body?: unknown): Promise<Response> {
    if (!this.initialized) throw new SdkNotInitializedError();
    return this.http.callApi(method, path, body);
  }

  /**
   * Emit a custom event via the core platform.
   * Event type is automatically prefixed with `plugin.<slug>.`.
   *
   * @param type - Event type suffix (will be prefixed automatically)
   * @param payload - Event payload data
   * @throws {ApiCallError} on non-2xx response
   * @throws {SdkNotInitializedError} if SDK not initialized
   */
  async emitEvent(type: string, payload: unknown): Promise<void> {
    if (!this.initialized) throw new SdkNotInitializedError();
    return this.http.emitEvent(type, payload);
  }

  /**
   * Extract the current request context (tenant, user, workspace, role).
   * Context is derived from platform-injected headers or fallback config values.
   *
   * @returns Current plugin execution context
   */
  getContext(): PluginContext {
    const ctx = this.config.plexicaHeaders;
    return {
      tenantId: ctx?.tenantId ?? this.config.tenantId,
      userId: ctx?.userId ?? '',
      workspaceId: ctx?.workspaceId ?? this.config.workspaceId ?? null,
      role: ctx?.role ?? 'viewer',
    };
  }

  /**
   * Get a typed pg.Pool scoped to the plugin's declared tables.
   * The pool is connected via the platform-injected restricted role.
   *
   * @returns PostgreSQL connection pool
   * @throws {DbAccessError} if no connection string is available
   */
  async getDb(): Promise<Pool> {
    return this.db.getPool(this.requireConnStr());
  }

  /**
   * Execute a parameterized SQL query against the plugin's declared tables.
   *
   * @param sql - SQL query with $1, $2, etc. placeholders
   * @param params - Query parameters
   * @returns Array of result rows
   * @throws {DbAccessError} if database operation fails
   */
  async query(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    return this.db.query(this.requireConnStr(), sql, params);
  }

  /**
   * Execute a parameterized SQL query and return only the first row, or null.
   *
   * @param sql - SQL query with $1, $2, etc. placeholders
   * @param params - Query parameters
   * @returns First result row, or null if no results
   * @throws {DbAccessError} if database operation fails
   */
  async queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
    return this.db.queryOne(this.requireConnStr(), sql, params);
  }

  private requireConnStr(): string {
    const cs = this.config.dbConnectionString ?? process.env['DATABASE_URL'];
    if (!cs) throw new DbAccessError('DB operations require the platform runtime.');
    return cs;
  }
}
