// apps/core-api/src/modules/authorization/guards/rate-limiter.guard.ts
//
// Per-tenant authorization mutation rate limiter.
// Spec 003 NFR-010, Edge Case #13, Task 2.6
//
// Design:
//   - 60 mutations/tenant/min sliding window (INCR + EXPIRE on Redis)
//   - Key: authz:ratelimit:{tenantId}
//   - Returns 429 with Retry-After header on limit exceeded
//   - Fail-open: Redis errors allow the request through
//   - Skipped in test environment (consistent with workspace rate limiter)
//   - Constitution Art. 6.2 error format

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import redis from '../../../lib/redis.js';
import { logger } from '../../../lib/logger.js';
import { authzRateLimitKey, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../constants.js';

/**
 * Fastify preHandler hook that enforces a per-tenant authorization mutation
 * rate limit of 60 requests per 60-second sliding window.
 *
 * The tenant ID is resolved from `request.user.id`'s tenant context.
 * Falls back to `'unknown-tenant'` if not yet resolved (should not happen
 * in practice because `authMiddleware` runs first).
 *
 * @example
 * ```typescript
 * fastify.post('/api/v1/roles', {
 *   preHandler: [authMiddleware, authzRateLimiter],
 * }, handler);
 * ```
 */
export const authzRateLimiter: preHandlerHookHandler = async function authzRateLimitHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Skip rate limiting in test environment to allow high-volume test execution
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  try {
    // Resolve tenant ID from request context
    const tenantId =
      (request as any).tenant?.tenantId ?? (request.user as any)?.tenantId ?? 'unknown-tenant';
    const redisKey = authzRateLimitKey(tenantId);

    // Atomic increment in sliding window
    const current = await redis.incr(redisKey);

    // Set expiry only on first request in window to create the sliding window
    if (current === 1) {
      await redis.expire(redisKey, RATE_LIMIT_WINDOW);
    }

    const remaining = Math.max(0, RATE_LIMIT_MAX - current);

    reply.header('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    reply.header('X-RateLimit-Remaining', String(remaining));

    if (current > RATE_LIMIT_MAX) {
      const ttl = await redis.ttl(redisKey);
      const retryAfter = Math.max(1, ttl);

      reply.header('Retry-After', String(retryAfter));

      return reply.code(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          details: {
            limit: RATE_LIMIT_MAX,
            windowSeconds: RATE_LIMIT_WINDOW,
            retryAfter,
          },
        },
      });
    }
  } catch (error) {
    // Fail-open: if Redis is unavailable, allow the request through
    logger.warn({ error }, 'Authorization rate limiter Redis error — failing open');
  }
};
