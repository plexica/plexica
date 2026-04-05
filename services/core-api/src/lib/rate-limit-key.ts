// rate-limit-key.ts
// Shared keyGenerator helper for @fastify/rate-limit.
// Used on routes that register their rate-limit check in the preHandler lifecycle
// (hook: 'preHandler'), where request.user is already populated by authMiddleware.
// Falls back to IP for unauthenticated requests.

import type { FastifyRequest } from 'fastify';

/**
 * Returns the rate-limit key for a request.
 * Prefer user ID (stable across IPs) when available; fall back to IP.
 * Guards against empty-string IDs which could collapse all anonymous
 * traffic into a single bucket.
 * Only usable in routes where hook: 'preHandler' is set so that
 * authMiddleware has already run before this function is called.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const uid = request.user?.id?.trim();
  return uid !== undefined && uid.length > 0 ? uid : request.ip;
}
