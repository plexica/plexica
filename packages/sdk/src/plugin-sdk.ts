// plugin-sdk.ts
// The PluginSDK class — one class per plugin backend (spec §7.6 "SDK Plugin
// v2", docs/01-SPECIFICHE.md; v2 Lesson #9: single SDK class, no Kafka).
//
// Events: dispatched via HTTP POST /_plexica/event (core → plugin backend).
// DB/HTTP delegated to PluginDb (db.ts) and PluginHttp (http.ts). No direct
// Kafka connection — core manages Kafka consumption/production.

import { SdkNotInitializedError, DbAccessError } from './errors.js';
import { PluginDb } from './db.js';
import { PluginHttp } from './http.js';
import { assertSecureApiUrl } from './url-guard.js';

import type { Pool } from 'pg';
import type { PluginConfig, PluginContext, PluginEvent, EventHandler } from './types.js';

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
   * @param config - Plugin configuration (IDs, credentials, callbacks)
   */
  constructor(config: PluginConfig) {
    this.config = {
      ...config,
      // `||` not `??`: an empty apiUrl must fall back to the loopback dev
      // default, and only that default is allowed over cleartext HTTP.
      apiUrl: config.apiUrl || process.env['CORE_API_URL'] || 'http://localhost:3001',
    };
    // CWE-319 guard (see url-guard.ts): reject cleartext non-loopback apiUrl.
    assertSecureApiUrl(this.config.apiUrl);
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
   * Register an event handler for an event type or `.*` glob pattern.
   *
   * @param pattern - Event type or glob pattern (e.g. 'tenant.*')
   * @param handler - Async callback invoked for matching dispatched events
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
   * @param method - HTTP method
   * @param path - API path relative to the core API base URL
   * @param body - Optional request body (JSON-serialized)
   * @returns Response from fetch
   * @throws {ApiCallError} on non-2xx; {SdkNotInitializedError} if not initialized
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
