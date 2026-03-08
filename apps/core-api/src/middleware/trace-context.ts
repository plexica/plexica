/**
 * Trace Context Middleware
 *
 * Spec 012, Task T012-13 (ADR-026).
 *
 * Fastify `onRequest` hook that:
 *   1. Extracts the W3C `traceparent` header (or generates a new trace/span ID).
 *   2. Injects `traceId` and `spanId` into the Pino request logger's bindings
 *      so every log line for this request carries the trace context.
 *   3. Forwards the `traceparent` header on outbound responses so clients can
 *      correlate frontend errors with backend traces.
 *
 * Usage — register in index.ts after `registerPlugins()`:
 *
 *   import { traceContextMiddleware } from './middleware/trace-context.js';
 *   server.addHook('onRequest', traceContextMiddleware);
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { context, propagation, trace, ROOT_CONTEXT } from '@opentelemetry/api';

/**
 * Parses a W3C traceparent header value and returns { traceId, spanId }.
 * Returns null if the header is absent or malformed.
 *
 * Traceparent format: `00-<traceId:32hex>-<spanId:16hex>-<flags:2hex>`
 */
function parseTraceparent(header: string | undefined): { traceId: string; spanId: string } | null {
  if (!header) return null;
  const parts = header.split('-');
  if (parts.length !== 4 || parts[0] !== '00') return null;
  const [, traceId, spanId] = parts;
  if (traceId?.length !== 32 || spanId?.length !== 16) return null;
  return { traceId, spanId };
}

/**
 * Generate a random 32-char hex trace ID.
 */
function randomTraceId(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 0);
}

/**
 * Generate a random 16-char hex span ID.
 */
function randomSpanId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function traceContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Attempt to extract an existing trace context from the incoming request headers.
  const incomingContext = propagation.extract(ROOT_CONTEXT, request.headers);
  const span = trace.getSpan(incomingContext);
  const spanContext = span?.spanContext();

  let traceId: string;
  let spanId: string;

  if (spanContext?.traceId && spanContext?.spanId) {
    traceId = spanContext.traceId;
    spanId = spanContext.spanId;
  } else {
    // No valid incoming context — parse the raw header as a fallback or generate new IDs.
    const parsed = parseTraceparent(request.headers['traceparent'] as string | undefined);
    traceId = parsed?.traceId ?? randomTraceId();
    spanId = parsed?.spanId ?? randomSpanId();
  }

  // Bind trace IDs to the Pino request logger so every log for this request
  // carries `traceId` and `spanId` (Constitution Art. 6.3 standard fields).
  request.log = request.log.child({ traceId, spanId });

  // Forward the traceparent in the response so clients can correlate.
  const traceparent = `00-${traceId}-${spanId}-01`;
  void reply.header('traceparent', traceparent);

  // Store context on request for downstream use (e.g. plugin-hook.service.ts).
  (request as FastifyRequest & { otelContext: ReturnType<typeof context.active> }).otelContext =
    context.with(incomingContext, () => context.active());

  done();
}
