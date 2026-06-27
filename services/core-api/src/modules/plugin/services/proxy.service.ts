// services/proxy.service.ts
// HTTP proxy to plugin backends. Routes requests to container (prod) or local process (dev).
// Injects auth/tenant context headers per DR-20/ADR-019.

import { ValidationError } from '../../../lib/app-error.js';
import { PluginBackendUnreachableError } from '../errors.js';
import { shouldProbe, recordFailure, recordSuccess } from './health-check.service.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

interface ProxyTarget {
  baseUrl: string;
  installId: string;
}

// Dev-mode registered backends (in-memory)
const devBackends = new Map<string, ProxyTarget>();

export function registerDevBackend(slug: string, backendUrl: string): void {
  devBackends.set(slug, { baseUrl: backendUrl, installId: `dev-${slug}` });
}

export function unregisterDevBackend(slug: string): void {
  devBackends.delete(slug);
}

export function getDevBackend(slug: string): ProxyTarget | undefined {
  return devBackends.get(slug);
}

/**
 * Proxies an HTTP request to a plugin backend.
 * Used when @fastify/http-proxy is not available or for dev mode.
 */
export async function proxyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  target: ProxyTarget
): Promise<void> {
  // Circuit breaker check
  const canProbe = await shouldProbe(target.installId);
  if (!canProbe) {
    throw new PluginBackendUnreachableError(target.installId);
  }

  const targetUrl = `${target.baseUrl}${request.url.replace(/^\/api\/v1\/plugins\/[^/]+\/proxy/, '')}`;

  const ctx = (request as unknown as Record<string, unknown>).tenantContext as
    { tenantId?: string; slug?: string } | undefined;

  // Build proxied request with auth headers
  const headers: Record<string, string> = {
    'Content-Type': (request.headers['content-type'] as string) || 'application/json',
    'X-Plexica-Tenant-Id': ctx?.tenantId ?? ctx?.slug ?? '',
    'X-Plexica-User-Id': (request.user as unknown as Record<string, string>)?.id ?? '',
    'X-Plexica-Workspace-Id': (request as unknown as Record<string, unknown>)?.workspaceId as string ?? '',
    'X-Plexica-User-Role': ((request.user as unknown as Record<string, string[]>).roles?.[0]) ?? '',
    'X-Plexica-Correlation-Id': crypto.randomUUID(),
  };

  // Forward relevant headers
  const forwardHeaders = ['authorization', 'accept', 'accept-language', 'if-none-match'];
  for (const h of forwardHeaders) {
    const val = request.headers[h];
    if (val) headers[h] = val as string;
  }

  try {
    const fetchBody = ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : JSON.stringify(request.body);

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      ...(fetchBody ? { body: fetchBody } : {}),
      signal: AbortSignal.timeout(10_000),
    } as RequestInit);

    // Record success for circuit breaker
    await recordSuccess(target.installId);

    // Forward response
    reply.status(response.status);
    for (const [key, value] of response.headers) {
      // Skip transfer-encoding as Fastify handles it
      if (key.toLowerCase() === 'transfer-encoding') continue;
      reply.header(key, value);
    }
    reply.send(await response.text());
  } catch (err) {
    await recordFailure(target.installId);
    const message = (err as Error).message;
    if (message.includes('timeout') || message.includes('abort')) {
      throw new PluginBackendUnreachableError(target.installId);
    }
    throw err;
  }
}
