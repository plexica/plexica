// rate-limit-config.ts
// Shared @fastify/rate-limit configuration — global defaults and key generator.
// Imported by index.ts (production server) and test helpers (test servers).
// Centralised here so any change to error shape or key strategy is applied
// consistently across production and tests.

import type { FastifyRequest } from 'fastify';
import type { errorResponseBuilderContext } from '@fastify/rate-limit';

// ---------------------------------------------------------------------------
// Global default: 100 req / 1 min per key (IP in public scope,
// user sub in authenticated scopes via per-route keyGenerator override).
// ---------------------------------------------------------------------------
export const GLOBAL_RATE_LIMIT = {
  max: 100,
  timeWindow: '1 minute',
} as const;

// ---------------------------------------------------------------------------
// Default keyGenerator — falls back to IP when user is not yet populated.
// Used for the global plugin registration in index.ts.
// ---------------------------------------------------------------------------
export function rateLimitKeyGenerator(request: FastifyRequest): string {
  return request.ip;
}

// ---------------------------------------------------------------------------
// Shared errorResponseBuilder.
//
// Design note — intentional two-hop pattern:
//   1. This builder returns an Error object (not a plain object).
//      @fastify/rate-limit detects an Error return value and passes it to
//      Fastify's error pipeline instead of serialising it directly.
//   2. configureErrorHandler (error-handler.ts) intercepts the Error, reads
//      `err.rateLimitBody`, and writes a structured JSON response with the
//      correct HTTP 429 status code.
//
// This ensures that 429 responses go through the same logging and response
// shaping pipeline as all other errors — no duplicated serialisation logic.
// ---------------------------------------------------------------------------
export function rateLimitErrorResponseBuilder(
  _request: FastifyRequest,
  context: errorResponseBuilderContext
): Error & { statusCode: number; rateLimitBody: unknown } {
  const body = {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Retry after ${context.after}.`,
      retryAfter: context.after,
    },
  };
  return Object.assign(new Error('Rate limit exceeded'), {
    statusCode: 429,
    rateLimitBody: body,
  });
}
