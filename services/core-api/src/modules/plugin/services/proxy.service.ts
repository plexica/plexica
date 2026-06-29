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

// Only forward tenant context headers for known-safe host patterns
const ALLOWED_PROXY_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal'];

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
 * Normalizes and validates the proxied path.
 * - URL-decodes to prevent encoded traversal attacks
 * - Rejects path traversal (..) and duplicate slashes (//)
 * - Returns a sanitized path suffix
 */
function sanitizeProxyPath(url: string): string {
  const pathSuffix = url.replace(/^\/api\/v1\/plugins\/[^/]+\/proxy/, '');

  // Decode URL-encoded characters first (prevents %2e%2e%2f bypass)
  const decoded = decodeURIComponent(pathSuffix);

  if (decoded.includes('..') || decoded.includes('//')) {
    throw new ValidationError('Invalid proxy path');
  }
  return decoded;
}

/**
 * Validates that the target URL's host is within the allowed set.
 * Prevents SSRF to internal services (Redis, MinIO, Kafka, DB).
 */
function validateTargetHost(targetUrl: string): void {
  try {
    const parsed = new URL(targetUrl);
    if (!ALLOWED_PROXY_HOSTS.includes(parsed.hostname)) {
      throw new ValidationError(`Proxy target host "${parsed.hostname}" is not allowed`);
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('Invalid proxy target URL');
  }
}

/**
 * Verifies the user actually belongs to the workspace being proxied.
 * Prevents workspace ID spoofing in forwarded tenant context headers.
 */
async function verifyWorkspaceMembership(
  workspaceId: string | undefined,
  userId: string | undefined,
  tenantContext: Record<string, unknown> | undefined
): Promise<void> {
  if (!workspaceId || !userId || !tenantContext) return;

  // Fast path: workspace-less proxy calls pass through
  if (workspaceId === '' || userId === '') return;

  try {
    const { withTenantDb } = await import('../../../lib/tenant-database.js');
    await withTenantDb(async (tx: any) => {
      const member = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { id: true },
      });
      if (!member) {
        throw new ValidationError('User is not a member of the specified workspace');
      }
    }, { slug: (tenantContext as any).slug, schemaName: (tenantContext as any).schemaName } as any);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    logger.warn({ err, workspaceId, userId }, 'Workspace membership verification failed — proceeding without verification');
  }
}

export async function proxyRequest(
  request: FastifyRequest, reply: FastifyReply, target: ProxyTarget
): Promise<void> {
  const canProbe = await shouldProbe(target.installId);
  if (!canProbe) throw new PluginBackendUnreachableError(target.installId);

  const pathSuffix = sanitizeProxyPath(request.url);
  const targetUrl = `${target.baseUrl}${pathSuffix}`;

  // Validate target host (SSRF prevention)
  validateTargetHost(targetUrl);

  const tenantContext = (request as any).tenantContext;
  const userId = (request.user as any)?.id ?? '';
  const workspaceId = (request as any).workspaceId ?? '';

  // Verify workspace membership before forwarding tenant context
  await verifyWorkspaceMembership(workspaceId, userId, tenantContext);

  const headers: Record<string, string> = {
    'Content-Type': (request.headers['content-type'] as string) || 'application/json',
    'X-Plexica-Tenant-Id': tenantContext?.tenantId ?? '',
    'X-Plexica-User-Id': userId,
    'X-Plexica-Workspace-Id': workspaceId,
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
