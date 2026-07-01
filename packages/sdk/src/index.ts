// index.ts
// @plexica/sdk — Single PluginSDK class (per v2 Lesson #9).
// Events are dispatched via HTTP POST /_plexica/event (core dispatches to plugin backend).
// No direct Kafka connection — core manages all Kafka consumption/production.
// emitEvent uses HTTP POST to core API for event publishing.

import { SdkNotInitializedError, ApiCallError } from './errors.js';

import type { PluginConfig, PluginContext, PluginEvent, EventHandler } from './types.js';

export class PluginSDK {
  private config: PluginConfig;
  private handlers: Array<{ pattern: string; handler: EventHandler }> = [];
  private initialized = false;
  private dbPool: unknown = null;

  constructor(config: PluginConfig) {
    this.config = {
      ...config,
      apiUrl: config.apiUrl ?? process.env['CORE_API_URL'] ?? 'http://localhost:3001',
    };
    // Auto-populate platform-injected env vars without violating
    // exactOptionalPropertyTypes (only assign when defined).
    const svcToken = config.serviceToken ?? process.env['PLEXICA_SERVICE_TOKEN'];
    const instId = config.installId ?? process.env['PLEXICA_INSTALL_ID'];
    if (svcToken) this.config.serviceToken = svcToken;
    if (instId) this.config.installId = instId;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return; // Guard against double-init
    this.initialized = true;
  }

  async destroy(): Promise<void> {
    this.handlers = [];
    this.initialized = false;
    if (this.dbPool) {
      try {
        await (this.dbPool as { end: () => Promise<void> }).end();
      } catch { /* ignore */ }
      this.dbPool = null;
    }
  }

  /**
   * Register an event handler for a pattern.
   * Events are delivered by the platform core via HTTP POST /_plexica/event.
   * The plugin backend's HTTP handler calls dispatchEvent() to invoke handlers.
   */
  onEvent(pattern: string, handler: EventHandler): void {
    this.handlers.push({ pattern, handler });
  }

  /**
   * Dispatch an incoming event to registered handlers.
   * Called by the plugin backend's HTTP handler when core POSTs to /_plexica/event.
   */
  async dispatchEvent(event: PluginEvent): Promise<void> {
    if (!this.initialized) throw new SdkNotInitializedError();

    const matching = this.handlers.filter((entry) => this.matchesPattern(event.type, entry.pattern));
    await Promise.all(matching.map((entry) => entry.handler(event)));
  }

  private matchesPattern(eventType: string, pattern: string): boolean {
    if (pattern === eventType) return true;
    // Support glob-style patterns: "plexica.workspace.*" matches "plexica.workspace.created"
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return eventType.startsWith(prefix) && eventType.charAt(prefix.length) === '.';
    }
    return false;
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

  /**
   * Returns a database connection scoped to the plugin's declared tables.
   *
   * **Platform runtime**: returns a `pg.Pool` connected via the restricted
   * connection string from `dbConnectionString` or `DATABASE_URL` env var.
   *
   * **Non-platform environments**: throws an error. Use `callApi()` for data
   * operations during local development or testing.
   *
   * @throws {Error} if called outside the Plexica platform runtime
   */
  async getDb(): Promise<unknown> {
    if (this.dbPool) return this.dbPool;

    const connectionString = this.config.dbConnectionString ?? process.env['DATABASE_URL'];
    if (!connectionString) {
      throw new Error('getDb() requires the platform runtime. Use callApi() for development.');
    }

    try {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString, max: 5 });
      const client = await pool.connect();
      client.release();
      this.dbPool = pool;
      return pool;
    } catch (err: unknown) {
      throw new Error(`getDb() failed to connect: ${(err as Error).message}`);
    }
  }

  /**
   * Emits a custom event via the core API.
   * Uses HTTP POST to core's event endpoint (no direct Kafka connection).
   */
  async emitEvent(type: string, payload: unknown): Promise<void> {
    if (!this.initialized) throw new SdkNotInitializedError();

    const url = `${this.config.apiUrl.replace(/\/+$/, '')}/api/v1/events/emit`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // A5: prefer the platform-injected service token (plugin-backend path).
    // Fall back to a user access token if present (user-initiated path).
    if (this.config.serviceToken) {
      headers['X-Plugin-Service-Token'] = this.config.serviceToken;
    } else if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: `plugin.${this.config.slug}.${type}`,
        payload,
        timestamp: new Date().toISOString(),
        correlationId: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ApiCallError('POST', url, response.status, text.substring(0, 200));
    }
  }
}
