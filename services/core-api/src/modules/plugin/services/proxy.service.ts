// services/proxy.service.ts
// HTTP proxy to plugin backends with security controls.



import { ValidationError } from '../../../lib/app-error.js';
import { PluginBackendUnreachableError } from '../errors.js';

import { shouldProbe, recordFailure, recordSuccess } from './health-check.service.js';
import { registerDevBackend, unregisterDevBackend, getDevBackend } from './dev-backends.js';

import type { ProxyTarget } from './dev-backends.js';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthorizedPluginProxy } from './proxy-authorization.service.js';

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

export async function proxyRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  target: ProxyTarget,
  access: AuthorizedPluginProxy
): Promise<void> {
  const canProbe = await shouldProbe(target.installId);
  if (!canProbe) throw new PluginBackendUnreachableError(target.installId);

  const pathSuffix = sanitizeProxyPath(request.url);
  const targetUrl = `${target.baseUrl}${pathSuffix}`;
  validateTargetHost(targetUrl);

  const tenantContext = request.tenantContext;
  const keycloakUserId = request.user?.keycloakUserId ?? '';

  const headers: Record<string, string> = {
    'Content-Type': (request.headers['content-type'] as string) || 'application/json',
    'X-Plexica-Tenant-Id': tenantContext?.tenantId ?? '',
    'X-Plexica-User-Id': keycloakUserId,
    'X-Plexica-Workspace-Id': access.workspaceId,
    'X-Plexica-User-Role': access.workspaceRole,
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
    if (response.status === 204 || response.body === null) {
      reply.send();
      return;
    }
    const responseBuffer = Buffer.from(await response.arrayBuffer());
    if (responseBuffer.length > MAX_RESPONSE_BYTES) {
      // Avoid Buffer+string coercion which corrupts binary responses.
      // Only append the text truncation marker for text/JSON content types;
      // binary responses get a bare truncated buffer with corrected length.
      const contentType = response.headers.get('content-type') ?? '';
      const isText = contentType.includes('text/') || contentType.includes('json') || contentType.includes('xml') || contentType.includes('javascript');
      if (isText) {
        reply.send(Buffer.concat([
          responseBuffer.subarray(0, MAX_RESPONSE_BYTES),
          Buffer.from(TRUNCATION_MARKER, 'utf8'),
        ]));
      } else {
        reply.send(responseBuffer.subarray(0, MAX_RESPONSE_BYTES));
      }
    } else {
      reply.send(responseBuffer);
    }
  } catch (err) {
    await recordFailure(target.installId);
    const message = (err as Error).message ?? '';
    // Network-level failures (connection refused, reset, DNS, abort/timeout)
    // mean the plugin backend is not reachable right now — surface a 503
    // rather than leaking a raw TypeError as a 500. The circuit breaker
    // recorded the failure; callers can retry until the backend converges.
    if (
      message.includes('timeout') ||
      message.includes('abort') ||
      message.includes('fetch failed') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ECONNRESET') ||
      message.includes('EAI_AGAIN') ||
      message.includes('EHOSTUNREACH') ||
      message.includes('ENOTFOUND')
    ) {
      throw new PluginBackendUnreachableError(target.installId);
    }
    throw err;
  }
}
