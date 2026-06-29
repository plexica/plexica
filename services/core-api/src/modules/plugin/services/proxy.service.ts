// services/proxy.service.ts
// HTTP proxy to plugin backends with security controls.

import { ValidationError } from '../../../lib/app-error.js';
import { logger } from '../../../lib/logger.js';
import { PluginBackendUnreachableError } from '../errors.js';
import { shouldProbe, recordFailure, recordSuccess } from './health-check.service.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB

// Allowlisted response headers forwarded from plugins
const ALLOWED_RESPONSE_HEADERS = new Set([
  'content-type', 'content-length', 'content-encoding',
  'cache-control', 'etag', 'last-modified',
  'x-request-id', 'x-correlation-id',
]);

interface ProxyTarget {
  baseUrl: string;
  installId: string;
}

const devBackends = new Map<string, ProxyTarget>();

export function registerDevBackend(installId: string, backendUrl: string): void {
  devBackends.set(installId, { baseUrl: backendUrl, installId });
}

export function unregisterDevBackend(installId: string): void {
  devBackends.delete(installId);
}

export function getDevBackend(installId: string): ProxyTarget | undefined {
  return devBackends.get(installId);
}

/**
 * Normalizes the proxied path and rejects path traversal.
 */
function sanitizeProxyPath(url: string): string {
  const pathSuffix = url.replace(/^\/api\/v1\/plugins\/[^/]+\/proxy/, '');
  if (pathSuffix.includes('..') || pathSuffix.includes('//')) {
    throw new ValidationError('Invalid proxy path');
  }
  return pathSuffix;
}

export async function proxyRequest(
  request: FastifyRequest, reply: FastifyReply, target: ProxyTarget
): Promise<void> {
  const canProbe = await shouldProbe(target.installId);
  if (!canProbe) throw new PluginBackendUnreachableError(target.installId);

  const pathSuffix = sanitizeProxyPath(request.url);
  const targetUrl = `${target.baseUrl}${pathSuffix}`;

  const headers: Record<string, string> = {
    'Content-Type': (request.headers['content-type'] as string) || 'application/json',
    'X-Plexica-Tenant-Id': (request as any).tenantContext?.tenantId ?? '',
    'X-Plexica-User-Id': (request.user as any)?.id ?? '',
    'X-Plexica-Workspace-Id': (request as any).workspaceId ?? '',
    'X-Plexica-User-Role': ((request.user as any)?.roles?.[0]) ?? '',
    'X-Plexica-Correlation-Id': crypto.randomUUID(),
  };

  // Forward safe headers only — no JWT (Constitution Security §2)
  for (const h of ['accept', 'accept-language', 'if-none-match']) {
    const val = request.headers[h];
    if (val) headers[h] = val as string;
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      ...(request.method !== 'GET' && request.method !== 'HEAD' ? { body: JSON.stringify(request.body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });

    await recordSuccess(target.installId);
    reply.status(response.status);

    // Only forward allowlisted response headers
    for (const [key, value] of response.headers) {
      if (ALLOWED_RESPONSE_HEADERS.has(key.toLowerCase())) {
        reply.header(key, value);
      }
    }

    // Stream response with size limit
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      reply.header('content-length', String(MAX_RESPONSE_BYTES));
      reply.send(text.substring(0, MAX_RESPONSE_BYTES));
    } else {
      reply.send(text);
    }
  } catch (err) {
    await recordFailure(target.installId);
    const message = (err as Error).message;
    if (message.includes('timeout') || message.includes('abort')) {
      throw new PluginBackendUnreachableError(target.installId);
    }
    throw err;
  }
}
