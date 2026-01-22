// apps/core-api/src/middleware/advanced-rate-limit.ts

import type { FastifyRequest, FastifyReply } from 'fastify';
import { checkAllRateLimits, getClientIP } from '../lib/advanced-rate-limit.js';

/**
 * Advanced Rate Limiting Middleware
 * Implements multi-level rate limiting:
 * 1. Per-IP (global limit: 100 req/min in production, 1000 in dev)
 * 2. Per-user (authenticated: 500 req/hour)
 * 3. Per-endpoint (1000 req/hour per specific route)
 * 4. Per-tenant (5000 req/hour)
 *
 * Returns 429 Too Many Requests if any limit is exceeded
 */
export async function advancedRateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check all applicable rate limits
    const limitStatus = checkAllRateLimits(request);

    // Add rate limit headers to all responses
    reply.header('RateLimit-Limit', limitStatus.limit.toString());
    reply.header('RateLimit-Remaining', limitStatus.remaining.toString());
    reply.header('RateLimit-Reset', Math.ceil(limitStatus.resetTime / 1000).toString());

    // If rate limit exceeded, return 429
    if (!limitStatus.allowed) {
      const ip = getClientIP(request);
      const userId = (request as any).user?.id;

      console.warn(
        `[RateLimit] Request denied: ${limitStatus.reason} (IP: ${ip}, User: ${userId || 'anonymous'})`
      );

      return reply.code(429).send({
        error: 'Too Many Requests',
        message: limitStatus.reason || 'Rate limit exceeded',
        retryAfter: Math.ceil((limitStatus.resetTime - Date.now()) / 1000),
      });
    }
  } catch (error) {
    request.log.error(error, 'Error in advanced rate limit middleware');
    // Don't block requests on rate limiter errors
    // Fall through to continue processing
  }
}
