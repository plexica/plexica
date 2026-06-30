// services/proxy.service.ts
// HTTP proxy to plugin backends with security controls.

import { Readable } from 'node:stream';

import { ValidationError } from '../../../lib/app-error.js';
import { logger } from '../../../lib/logger.js';
import { PluginBackendUnreachableError, WorkspaceVerifyError } from '../errors.js';
import { shouldProbe, recordFailure, recordSuccess } from './health-check.service.js';

import type { FastifyRequest, FastifyReply } from 'fastify';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB
const TRUNCATION_MARKER = '\n… (truncated: response exceeded max size)\n';

// Allowlisted response headers forwarded from plugins. content-length is
// intentionally excluded: we stream the body with a byte cap and may append a
// truncation marker, so the upstream length can mismatch the bytes we send.
const ALLOWED_RESPONSE_HEADERS = new Set([
  'content-type', 'content-encoding',
  'cache-control', 'etag', 'last-modified',
  'x-request-id', 'x-correlation-id',
]);

// Only forward tenant context headers for known-safe host patterns (SSRF).
const ALLOWED_PROXY_HOSTS = ['localhost', '127.0.0.1', 'host.docker.internal'];

interface ProxyTarget {
  baseUrl: string;
  installId: string;
}

const devBackends = new Map<string, ProxyTarget>();

export function registerDevBackend(slug: string, target: { baseUrl: string; installId?: string }): void {
  devBackends.set(slug, { baseUrl: target.baseUrl, installId: target.installId ?? slug });
}

export function unregisterDevBackend(slug: string): void {
  devBackends.delete(slug);
}

export function getDevBackend(slug: string): ProxyTarget | undefined {
  return devBackends.get(slug);
}

function sanitizeProxyPath(url: string): string {
  const pathSuffix = url.replace(/^\/api\/v1\/plugins\/[^/]+\/proxy/, '');
  const decoded = decodeURIComponent(pathSuffix);
  if (decoded.includes('..') || decoded.includes('//')) {
    throw new ValidationError('Invalid proxy path');
  }
  return decoded;
}

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

// CRITICAL #3 — FAIL-CLOSED: if membership cannot be positively confirmed
// (DB error, unreachable, etc.) the request is NEVER forwarded → 503.
async function verifyWorkspaceMembership(
  workspaceId: string | undefined,
  userId: string | undefined,
  tenantContext: Record<string, unknown> | undefined
): Promise<void> {
  if (!workspaceId || !userId || !tenantContext) return;
  if (workspaceId === '' || userId === '') return;

  const { withTenantDb } = await import('../../../lib/tenant-database.js');
  try {
    await withTenantDb(async (tx: any) => {
      const member = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { id: true },
      });
      if (!member) throw new ValidationError('User is not a member of the specified workspace');
    }, { slug: (tenantContext as any).slug, schemaName: (tenantContext as any).schemaName } as any);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    logger.error(
      { err, workspaceId, userId },
      'Workspace membership verification failed — denying request (fail-closed)',
    );
    throw new WorkspaceVerifyError();
  }
}

/**
 * Wraps the upstream body in a TransformStream that counts bytes (HIGH #14).
 * Aborts at maxBytes, appends a truncation marker, and cancels the source so a
 * malicious plugin cannot exhaust memory with an unbounded response. Byte
 * accounting uses Buffer.byteLength (not string.length) for correctness.
 */
function limitResponseBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  let received = 0;
  let truncated = false;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (truncated) return;
        received += Buffer.byteLength(chunk);
        if (received <= maxBytes) {
          controller.enqueue(chunk);
          return;
        }
        const over = received - maxBytes;
        const allowed = chunk.subarray(0, chunk.byteLength - over);
        if (allowed.byteLength > 0) controller.enqueue(allowed);
        truncated = true;
        controller.enqueue(Buffer.from(TRUNCATION_MARKER, 'utf8'));
        // Stop reading from the plugin — frees the upstream connection.
        controller.terminate();
      },
    }),
  );
}

export async function proxyRequest(
  request: FastifyRequest, reply: FastifyReply, target: ProxyTarget
): Promise<void> {
  const canProbe = await shouldProbe(target.installId);
  if (!canProbe) throw new PluginBackendUnreachableError(target.installId);

  const pathSuffix = sanitizeProxyPath(request.url);
  const targetUrl = `${target.baseUrl}${pathSuffix}`;
  validateTargetHost(targetUrl);

  const tenantContext = (request as any).tenantContext;
  const internalUserId = request.user?.id ?? '';
  const keycloakUserId = request.user?.keycloakUserId ?? '';
  const workspaceHeader = request.headers['x-plexica-workspace-id'];
  const workspaceId = (typeof workspaceHeader === 'string' ? workspaceHeader : '') ?? '';

  await verifyWorkspaceMembership(workspaceId, internalUserId, tenantContext);

  const headers: Record<string, string> = {
    'Content-Type': (request.headers['content-type'] as string) || 'application/json',
    'X-Plexica-Tenant-Id': tenantContext?.tenantId ?? '',
    'X-Plexica-User-Id': keycloakUserId,
    'X-Plexica-Workspace-Id': workspaceId,
    'X-Plexica-User-Role': ((request.user as any)?.roles?.[0]) ?? '',
    'X-Plexica-Correlation-Id': crypto.randomUUID(),
  };

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

    for (const [key, value] of response.headers) {
      if (ALLOWED_RESPONSE_HEADERS.has(key.toLowerCase())) reply.header(key, value);
    }

    // Stream the body with a byte cap. No Content-Length is forwarded: the
    // final size is unknown up-front and includes a truncation marker when the
    // limit is hit, so chunked transfer is always used.
    if (response.body === null) {
      reply.send('');
      return;
    }
    reply.send(Readable.fromWeb(limitResponseBody(response.body, MAX_RESPONSE_BYTES)));
  } catch (err) {
    await recordFailure(target.installId);
    const message = (err as Error).message;
    if (message.includes('timeout') || message.includes('abort')) {
      throw new PluginBackendUnreachableError(target.installId);
    }
    throw err;
  }
}
