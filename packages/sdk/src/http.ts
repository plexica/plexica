// http.ts
// HTTP helpers for plugin → core API communication.
// Extracted from PluginSDK to keep index.ts under the 200-line constitution limit.

import { ApiCallError } from './errors.js';
import { assertSecureApiUrl, trimTrailingSlashes } from './url-guard.js';

import type { EmitNotificationInput, EmitNotificationResult } from './types.js';
import type { PluginConfig } from './types.js';

/**
 * Injects X-Plexica context headers and auth into outbound calls to core.
 */
export class PluginHttp {
  constructor(private readonly config: PluginConfig) {
    // CWE-319 guard (see url-guard.ts): reject cleartext non-loopback apiUrl
    // for ANY PluginHttp entry point (PluginSDK + standalone emitNotification).
    // Idempotent — safe if PluginSDK's constructor also validated the URL.
    // Single-label internal http: hosts require an explicit allowlist
    // (ADR-035/CWE-319, F9).
    assertSecureApiUrl(config.apiUrl, {
      allowHttpHosts: config.allowHttpHosts ?? [],
      allowHttpInternal: config.allowHttpInternal ?? false,
    });
  }

  /**
   * Make an authenticated API call to the core platform.
   * Injects X-Plexica-* context headers and Bearer token per ADR-019.
   * @throws {ApiCallError} on non-2xx response.
   */
  async callApi(method: string, path: string, body?: unknown): Promise<Response> {
    const url = `${trimTrailingSlashes(this.config.apiUrl)}/${path.replace(/^\//, '')}`;
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
    const url = `${trimTrailingSlashes(this.config.apiUrl)}/api/v1/events/emit`;
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

  /**
   * Emit a notification via core's notification endpoint (feature 006-05,
   * ADR-035 Decision 5). The type is automatically prefixed with
   * `plugin.<slug>.`. Prefers the platform-injected service token; falls back
   * to user JWT (same auth as emitEvent).
   * The core generates the `notificationId` at emission and returns it
   * synchronously; persistence + SSE delivery are asynchronous.
   * @throws {ApiCallError} on non-2xx response.
   */
  async emitNotification(input: EmitNotificationInput): Promise<EmitNotificationResult> {
    const url = `${trimTrailingSlashes(this.config.apiUrl)}/api/v1/notifications/emit`;
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
        userId: input.userId,
        type: `plugin.${this.config.slug}.${input.type}`,
        titleKey: input.titleKey,
        ...(input.titleParams !== undefined ? { titleParams: input.titleParams } : {}),
        ...(input.bodyKey !== undefined ? { bodyKey: input.bodyKey } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
        timestamp: new Date().toISOString(),
        correlationId: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // ADR-035 Decision 5 contract: emit returns exactly `202 { status:
    // "accepted", notificationId }`. Reject EVERY other status — including
    // other 2xx (e.g. 200) — before attempting to parse the body (F8). The
    // ApiCallError built from the non-202 response is the same as any other
    // API failure.
    if (response.status !== 202) {
      const text = await response.text();
      throw new ApiCallError('POST', url, response.status, text.substring(0, 200));
    }
    // Defensive parse: a 202 that is not valid JSON (or lacks the contract
    // field) is a contract violation, not an HTTP failure — parse defensively
    // so a raw SyntaxError never leaks, and build the error without claiming
    // the HTTP status was a failure.
    const body = (await response.json().catch(() => null)) as { notificationId?: unknown } | null;
    if (!body || typeof body.notificationId !== 'string' || body.notificationId.length === 0) {
      throw new ApiCallError(
        'POST',
        url,
        202,
        'Emit response missing notificationId',
        `Notification emit contract violation: 202 response from ${url} is missing a valid notificationId`
      );
    }
    return { notificationId: body.notificationId };
  }
}
