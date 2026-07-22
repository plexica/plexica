// services/proxy.service.ts
// HTTP proxy to plugin backends with security controls.



import { ValidationError } from '../../../lib/app-error.js';
import { logger } from '../../../lib/logger.js';
import { PluginBackendUnreachableError, WorkspaceVerifyError } from '../errors.js';

import { shouldProbe, recordFailure, recordSuccess } from './health-check.service.js';
import { registerDevBackend, unregisterDevBackend, getDevBackend } from './dev-backends.js';

import type { ProxyTarget } from './dev-backends.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantPrismaClient } from '../../../lib/tenant-database.js';
import type { TenantContext } from '../../../lib/tenant-context-store.js';

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

// Re-export dev backend helpers so existing imports from proxy.service remain valid.
export { registerDevBackend, unregisterDevBackend, getDevBackend };
export type { ProxyTarget };

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
  tenantContext: TenantContext | undefined,
  isTenantAdmin = false,
): Promise<void> {
  if (!workspaceId || !userId || !tenantContext) return;
  if (workspaceId === '' || userId === '') return;
  // Tenant admins have access to all workspaces in their tenant — bypass
  // the per-workspace membership check (same as the ABAC preHandler).
  if (isTenantAdmin) return;

  const { withTenantDb } = await import('../../../lib/tenant-database.js');
  try {
    await withTenantDb(async (tx: TenantPrismaClient) => {
      const member = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { id: true },
      });
      if (!member) throw new ValidationError('User is not a member of the specified workspace');
    }, tenantContext as TenantContext);
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    logger.error(
      { err, workspaceId, userId },
      'Workspace membership verification failed — denying request (fail-closed)',
    );
    throw new WorkspaceVerifyError();
  }
}

export async function proxyRequest(
  request: FastifyRequest, reply: FastifyReply, target: ProxyTarget
): Promise<void> {
  const canProbe = await shouldProbe(target.installId);
  if (!canProbe) throw new PluginBackendUnreachableError(target.installId);

  const pathSuffix = sanitizeProxyPath(request.url);
  const targetUrl = `${target.baseUrl}${pathSuffix}`;
  validateTargetHost(targetUrl);

  const tenantContext = (request as FastifyRequest & { tenantContext: TenantContext }).tenantContext;
  const internalUserId = request.user?.id ?? '';
  const keycloakUserId = request.user?.keycloakUserId ?? '';
  const workspaceHeader = request.headers['x-plexica-workspace-id'];
  const workspaceId = (typeof workspaceHeader === 'string' ? workspaceHeader : '') ?? '';

  const isTenantAdmin = request.user?.roles.includes('tenant_admin') ?? false;
  const forwardedRole = isTenantAdmin
    ? 'admin'
    : request.user?.roles.find((role) => ['admin', 'member', 'viewer'].includes(role)) ?? '';
  await verifyWorkspaceMembership(workspaceId, internalUserId, tenantContext, isTenantAdmin);

  const headers: Record<string, string> = {
    'Content-Type': (request.headers['content-type'] as string) || 'application/json',
    'X-Plexica-Tenant-Id': tenantContext?.tenantId ?? '',
    'X-Plexica-User-Id': keycloakUserId,
    'X-Plexica-Workspace-Id': workspaceId,
    'X-Plexica-User-Role': forwardedRole,
    'X-Plexica-Correlation-Id': crypto.randomUUID(),
  };

  for (const h of ['accept', 'accept-language', 'if-none-match']) {
    const val = request.headers[h];
    if (val) headers[h] = val as string;
  }

  // Build the outgoing body. The proxy route registers a passthrough
  // contentTypeParser that stores the raw body as a Buffer for ALL content
  // types (JSON, multipart, binary, form-data). We forward that Buffer
  // verbatim — no re-serialization — so non-JSON plugin APIs (file uploads,
  // binary, form-data) work correctly and JSON is forwarded as-is.
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const isJson = headers['Content-Type']?.includes('application/json') ?? false;
  const bodyOpts: Record<string, unknown> = {};
  if (hasBody && request.body !== undefined) {
    const rawBody = request.body as Buffer | string | unknown;
    if (Buffer.isBuffer(rawBody)) {
      bodyOpts['body'] = rawBody;
    } else if (typeof rawBody === 'string') {
      bodyOpts['body'] = rawBody;
    } else if (isJson) {
      // Fallback: if the body is a parsed object (JSON), re-serialize it.
      bodyOpts['body'] = JSON.stringify(rawBody);
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      ...bodyOpts,
      signal: AbortSignal.timeout(10_000),
    });

    await recordSuccess(target.installId);
    reply.status(response.status);

    for (const [key, value] of response.headers) {
      if (ALLOWED_RESPONSE_HEADERS.has(key.toLowerCase())) reply.header(key, value);
    }

    // Buffer the response body and send it directly. The streaming approach
    // (Readable.fromWeb) can produce empty bodies with some HTTP clients when
    // the stream ends before the client reads it. Buffering is simpler and
    // reliable for the 10MB max response size.
    if (response.body === null) {
      reply.send('');
      return;
    }
    const responseBuffer = Buffer.from(await response.arrayBuffer());
    if (responseBuffer.length > MAX_RESPONSE_BYTES) {
      reply.send(responseBuffer.subarray(0, MAX_RESPONSE_BYTES) + TRUNCATION_MARKER);
    } else {
      reply.send(responseBuffer);
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
