// apps/core-api/src/middleware/rate-limiter.ts
//
// Workspace-specific rate limiter factory using Redis sliding window.
// Complements the global LRU-based rate limiter (advanced-rate-limit.ts)
// with per-endpoint tier configuration for workspace routes.
//
// Constitution Art. 9.2: DoS protection
// Spec 009 Section 3: Rate limit tiers per endpoint
//
// Design:
//   - Uses Redis INCR + EXPIRE for distributed rate limiting
//   - Fail-open: if Redis is unavailable, requests are allowed
//   - Returns standard headers (X-RateLimit-Limit, X-RateLimit-Remaining)
//   - Returns 429 with Retry-After header when exceeded
//   - Error responses use Constitution Art. 6.2 format

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import redis from '../lib/redis.js';
import { logger } from '../lib/logger.js';

/**
 * Rate limit scope configuration.
 */
export interface RateLimitConfig {
  /** Scope identifier for the rate limit key (e.g., 'workspace-create') */
  scope: string;
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Extract the rate limit key from the request (e.g., tenantId, userId, workspaceId) */
  keyExtractor: (request: FastifyRequest) => string;
}

/**
 * Pre-configured rate limit tiers from Spec 009.
 *
 * | Tier               | Scope         | Limit | Window   | Endpoints                                 |
 * | ------------------ | ------------- | ----- | -------- | ----------------------------------------- |
 * | Workspace Creation | Per tenant    | 10    | 1 minute | POST /workspaces                          |
 * | Workspace Reads    | Per user      | 100   | 1 minute | GET /workspaces, GET /:id, GET /:id/teams |
 * | Member Management  | Per workspace | 50    | 1 minute | POST/PATCH/DELETE /:id/members/*          |
 * | Resource Sharing   | Per workspace | 20    | 1 minute | POST/GET/DELETE /:id/resources/*          |
 */
export const WORKSPACE_RATE_LIMITS = {
  /** POST /workspaces — 10/min per tenant */
  WORKSPACE_CREATE: {
    scope: 'ws-create',
    limit: 10,
    windowSeconds: 60,
    keyExtractor: (req: FastifyRequest) => {
      const tenant = (req as any).tenant;
      return tenant?.tenantId || 'unknown-tenant';
    },
  } satisfies RateLimitConfig,

  /** GET workspace endpoints — 100/min per user */
  WORKSPACE_READ: {
    scope: 'ws-read',
    limit: 100,
    windowSeconds: 60,
    keyExtractor: (req: FastifyRequest) => {
      return (req as any).user?.id || 'anonymous';
    },
  } satisfies RateLimitConfig,

  /** Member management — 50/min per workspace */
  MEMBER_MANAGEMENT: {
    scope: 'ws-member',
    limit: 50,
    windowSeconds: 60,
    keyExtractor: (req: FastifyRequest) => {
      const params = req.params as Record<string, string>;
      return params.workspaceId || 'unknown-workspace';
    },
  } satisfies RateLimitConfig,

  /** Resource sharing — 20/min per workspace */
  RESOURCE_SHARING: {
    scope: 'ws-resource',
    limit: 20,
    windowSeconds: 60,
    keyExtractor: (req: FastifyRequest) => {
      const params = req.params as Record<string, string>;
      return params.workspaceId || 'unknown-workspace';
    },
  } satisfies RateLimitConfig,
} as const;

/**
 * Factory function that creates a Fastify preHandler hook for rate limiting.
 *
 * Uses Redis sliding window counters (INCR + EXPIRE). Fail-open: if Redis
 * is unavailable, requests are allowed through to avoid blocking legitimate
 * traffic when infrastructure is degraded.
 *
 * @param config - Rate limit configuration
 * @returns Fastify preHandler hook function
 *
 * @example
 * ```typescript
 * fastify.post('/workspaces', {
 *   preHandler: [authMiddleware, tenantContextMiddleware],
 *   onRequest: [rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_CREATE)],
 * }, handler);
 * ```
 */
export function rateLimiter(config: RateLimitConfig): preHandlerHookHandler {
  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const scopeKey = config.keyExtractor(request);
      const redisKey = `ratelimit:${config.scope}:${scopeKey}`;

      // Atomic increment
      const current = await redis.incr(redisKey);

      // Set expiry only on first request in the window
      if (current === 1) {
        await redis.expire(redisKey, config.windowSeconds);
      }

      const remaining = Math.max(0, config.limit - current);

      // Always set rate limit headers
      reply.header('X-RateLimit-Limit', String(config.limit));
      reply.header('X-RateLimit-Remaining', String(remaining));

      if (current > config.limit) {
        const ttl = await redis.ttl(redisKey);
        const retryAfter = Math.max(1, ttl);

        reply.header('Retry-After', String(retryAfter));

        // Use Constitution Art. 6.2 error format
        return reply.code(429).send({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            details: {
              scope: config.scope,
              limit: config.limit,
              windowSeconds: config.windowSeconds,
              retryAfter,
            },
          },
        });
      }
    } catch (error) {
      // Fail-open: if Redis is unavailable, allow the request through
      logger.warn({ scope: config.scope, error }, 'Rate limiter Redis error — failing open');
    }
  };
}
