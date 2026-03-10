// apps/core-api/src/middleware/rate-limiter.ts
//
// Workspace-specific rate limiter factory using Redis fixed-window counters.
// Complements the global LRU-based rate limiter (advanced-rate-limit.ts)
// with per-endpoint tier configuration for workspace routes.
//
// Constitution Art. 9.2: DoS protection
// Spec 009 Section 3: Rate limit tiers per endpoint
//
// Design:
//   - Uses Redis pipeline (INCR + EXPIRE atomic) for distributed rate limiting
//   - EXPIRE is called on every request (idempotent) to ensure the key always
//     has a TTL, preventing immortal keys if a prior EXPIRE call was lost
//   - Fail-open: if Redis is unavailable, requests are allowed
//   - Returns standard headers (X-RateLimit-Limit, X-RateLimit-Remaining)
//   - Returns 429 with Retry-After header when exceeded
//   - Error responses use Constitution Art. 6.2 format
//
// Note: This is a fixed-window counter. Bursts of up to ~2× the limit are
// possible at window boundaries. A sliding-window implementation is tracked
// as a future improvement if stricter burst control is required.

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { Redis } from 'ioredis';
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
      return req.tenant?.tenantId || 'unknown-tenant';
    },
  } satisfies RateLimitConfig,

  /** GET workspace endpoints — 100/min per user */
  WORKSPACE_READ: {
    scope: 'ws-read',
    limit: 100,
    windowSeconds: 60,
    keyExtractor: (req: FastifyRequest) => {
      return req.user?.id || 'anonymous';
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
 * Uses Redis pipeline (INCR + EXPIRE atomic, fixed-window). Fail-open: if Redis
 * is unavailable, requests are allowed through to avoid blocking legitimate
 * traffic when infrastructure is degraded.
 *
 * Place in the `preHandler` array **after** `authMiddleware` so that
 * `req.user` is populated before `keyExtractor` runs.
 *
 * @param config - Rate limit configuration
 * @returns Fastify preHandler hook function
 *
 * @example
 * ```typescript
 * fastify.post('/workspaces', {
 *   preHandler: [authMiddleware, tenantContextMiddleware, rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_CREATE)],
 * }, handler);
 * ```
 */
/**
 * Factory function that creates a Fastify preHandler hook for rate limiting.
 *
 * Uses Redis pipeline (INCR + EXPIRE atomic, fixed-window). Fail-open: if Redis
 * is unavailable, requests are allowed through to avoid blocking legitimate
 * traffic when infrastructure is degraded.
 *
 * Place in the `preHandler` array **after** `authMiddleware` so that
 * `req.user` is populated before `keyExtractor` runs.
 *
 * @param config - Rate limit configuration
 * @param redisClient - Redis client to use (defaults to the shared redis singleton). Pass a mock for testing.
 * @returns Fastify preHandler hook function
 *
 * @example
 * ```typescript
 * fastify.post('/workspaces', {
 *   preHandler: [authMiddleware, tenantContextMiddleware, rateLimiter(WORKSPACE_RATE_LIMITS.WORKSPACE_CREATE)],
 * }, handler);
 * ```
 */
export function rateLimiter(
  config: RateLimitConfig,
  redisClient: Redis = redis
): preHandlerHookHandler {
  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Allow test suites to bypass rate limiting via env var so integration tests
    // that make many legitimate requests don't fight artificial counters.
    // Rate-limiting behaviour is covered by its own dedicated unit/integration tests.
    if (process.env.DISABLE_RATE_LIMIT === 'true') {
      return;
    }

    try {
      const scopeKey = config.keyExtractor(request);
      const redisKey = `ratelimit:${config.scope}:${scopeKey}`;

      // Atomically increment and refresh TTL in a single pipeline.
      // Calling EXPIRE on every request (not just when current === 1) ensures
      // the key always has a TTL — even if a prior EXPIRE call was lost due to
      // a Redis hiccup — preventing immortal keys that permanently block tenants.
      const pipeline = redisClient.pipeline();
      pipeline.incr(redisKey);
      pipeline.expire(redisKey, config.windowSeconds);
      const results = await pipeline.exec();

      // pipeline.exec() returns [error, result][] — extract the INCR result
      const incrResult = results?.[0];
      if (!incrResult || incrResult[0]) {
        // Pipeline error — fail open
        logger.warn(
          { scope: config.scope, error: incrResult?.[0] },
          'Rate limiter Redis pipeline error — failing open'
        );
        return;
      }
      const current = incrResult[1] as number;

      const remaining = Math.max(0, config.limit - current);

      // Always set rate limit headers
      reply.header('X-RateLimit-Limit', String(config.limit));
      reply.header('X-RateLimit-Remaining', String(remaining));

      if (current > config.limit) {
        let retryAfter = 1;
        try {
          const ttl = await redisClient.ttl(redisKey);
          retryAfter = Math.max(1, ttl);
        } catch (ttlError) {
          // TTL call failed — use safe minimum so 429 is still returned correctly
          logger.warn(
            { scope: config.scope, error: ttlError },
            'Rate limiter TTL error — using retryAfter=1'
          );
        }

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
