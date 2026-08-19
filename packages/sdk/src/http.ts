// http.ts
// HTTP helpers for plugin → core API communication.
// Extracted from PluginSDK to keep index.ts under the 200-line constitution limit.

import { ApiCallError } from './errors.js';

import type { PluginConfig } from './types.js';

/**
 * Injects X-Plexica context headers and auth into outbound calls to core.
 */
export class PluginHttp {
  constructor(private readonly config: PluginConfig) {}

  /**
   * Make an authenticated API call to the core platform.
   * Injects X-Plexica-* context headers and Bearer token per ADR-019.
   * @throws {ApiCallError} on non-2xx response.
   */
  async callApi(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${this.config.apiUrl.replace(/\/+$/, '')}/${path.replace(/^\//, '')}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (this.config.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    }

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

  /**
   * Emit a custom event via core's event endpoint.
   * The event type is automatically prefixed with `plugin.<slug>.`.
   * Prefers the platform-injected service token; falls back to user JWT.
   * @throws {ApiCallError} on non-2xx response.
   */
  async emitEvent(type: string, payload: unknown): Promise<void> {
    const url = `${this.config.apiUrl.replace(/\/+$/, '')}/api/v1/events/emit`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

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
