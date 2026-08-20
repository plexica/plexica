// rate-limit-config.ts
// Shared @fastify/rate-limit configuration — global defaults, key generator,
// and per-route limit presets.
// Imported by index.ts (production server) and test helpers (test servers).
// Centralised here so any change to error shape or key strategy is applied
// consistently across production and tests.

import { config } from './config.js';

import type { FastifyRequest } from 'fastify';
import type { errorResponseBuilderContext } from '@fastify/rate-limit';

// ---------------------------------------------------------------------------
// Global default: RATE_LIMIT_MAX req / 1 min per key (IP in public scope,
// user sub in authenticated scopes via per-route keyGenerator override).
// Configurable via RATE_LIMIT_MAX env var (default 100, increase for E2E).
// No explicit keyGenerator: the library default (request.ip) is correct at
// plugin level, where request.user is not yet populated.
// ---------------------------------------------------------------------------
export const GLOBAL_RATE_LIMIT = {
  max: config.RATE_LIMIT_MAX,
  timeWindow: '1 minute',
} as const;

// ---------------------------------------------------------------------------
// User-keyed keyGenerator for authenticated routes.
// Prefer user ID (stable across IPs) when available; fall back to IP.
// Guards against empty-string IDs which could collapse all anonymous
// traffic into a single bucket.
// Only usable where the rate-limit hook runs at 'preHandler' (route-level
// hooks execute after scope-level preHandler hooks), so authMiddleware has
// already populated request.user.
// ---------------------------------------------------------------------------
export function rateLimitKey(request: FastifyRequest): string {
  const uid = request.user?.id?.trim();
  return uid !== undefined && uid.length > 0 ? uid : request.ip;
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

// ---------------------------------------------------------------------------
// Per-route rate limit configurations
// ---------------------------------------------------------------------------

/** Avatar / logo upload: 5 req/min per user. */
export const UPLOAD_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
} as const;

/** Auth config endpoints: 5 req/min per user. */
export const AUTH_CONFIG_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
} as const;

/** General settings endpoints: 30 req/min per user. */
export const SETTINGS_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
} as const;
