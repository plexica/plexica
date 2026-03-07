/**
 * Shared Pino Logger Instance
 *
 * Provides structured logging with proper context fields.
 * Used by services that don't have access to Fastify's server.log instance.
 *
 * Constitution Article 6.3: Pino JSON Logging with standard fields
 *
 * Spec 012 T012-14 (ADR-026): OTel mixin injects `traceId` and `spanId` from
 * the active OpenTelemetry span into every log record, enabling trace-to-log
 * correlation in Grafana (Loki → Tempo derived fields).
 */

import pino from 'pino';
import { trace, isSpanContextValid } from '@opentelemetry/api';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Pino mixin — appends the active OTel span's traceId/spanId to every log record.
 * Returns an empty object when no active span exists (e.g. during startup, tests).
 */
function otelMixin(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) return {};
  const ctx = span.spanContext();
  if (!isSpanContextValid(ctx)) return {};
  return { traceId: ctx.traceId, spanId: ctx.spanId };
}

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  mixin: otelMixin,
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
