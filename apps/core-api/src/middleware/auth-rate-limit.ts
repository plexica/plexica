// apps/core-api/src/middleware/auth-rate-limit.ts

import type { FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../lib/redis.js';
import { config } from '../config/index.js';
import { logger } from '../lib/logger.js';

/**
 * Auth Rate Limiter
 *
 * Redis-backed rate limiter specifically for authentication endpoints
 * Uses Lua script for atomic INCR + EXPIRE operations
 * Tracks login attempts per IP address
 */
class AuthRateLimiter {
  private readonly luaScript: string;

  constructor() {
    // Lua script for atomic rate limiting
    // Returns 1 if allowed, 0 if rate limited
    this.luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      
      local current = redis.call('INCR', key)
      
      if current == 1 then
        redis.call('EXPIRE', key, window)
      end
      
      if current > limit then
        return 0
      else
        return 1
      end
    `;
  }

  /**
   * Check if IP is within rate limit
   * @param ip - Client IP address
   * @returns Promise<boolean> - true if allowed, false if rate limited
   */
  async check(ip: string): Promise<boolean> {
    try {
      const key = `auth:ratelimit:${ip}`;
      const limit = config.authRateLimitMax;
      const windowSeconds = Math.floor(config.authRateLimitWindow / 1000);

      // Execute Lua script atomically
      const result = await redis.eval(this.luaScript, 1, key, limit, windowSeconds);

      const allowed = result === 1;

      if (!allowed) {
        logger.warn(
          {
            ip,
            limit,
            window: windowSeconds,
          },
          'Auth rate limit exceeded for IP'
        );
      }

      return allowed;
    } catch (error) {
      // Graceful degradation: Allow request if Redis fails
      logger.error(
        {
          ip,
          error: error instanceof Error ? error.message : String(error),
        },
        'Auth rate limiter Redis failure, allowing request'
      );
      return true;
    }
  }

  /**
   * Get current count for IP (for monitoring/testing)
   * @param ip - Client IP address
   * @returns Promise<number> - Current attempt count
   */
  async getCount(ip: string): Promise<number> {
    try {
      const key = `auth:ratelimit:${ip}`;
      const count = await redis.get(key);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      logger.error(
        {
          ip,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to get auth rate limit count'
      );
      return 0;
    }
  }

  /**
   * Reset rate limit for IP (for testing/admin purposes)
   * @param ip - Client IP address
   */
  async reset(ip: string): Promise<void> {
    try {
      const key = `auth:ratelimit:${ip}`;
      await redis.del(key);
    } catch (error) {
      logger.error(
        {
          ip,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to reset auth rate limit'
      );
    }
  }
}

// Singleton instance
const authRateLimiter = new AuthRateLimiter();

/**
 * Extract client IP from request
 * Checks X-Forwarded-For header first (for proxies), then falls back to socket IP
 */
function getClientIP(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can be comma-separated list, take first IP
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ip.trim();
  }
  return request.ip || 'unknown';
}

/**
 * Fastify preHandler hook for auth rate limiting
 *
 * Apply this to login and callback endpoints:
 * ```typescript
 * fastify.get('/auth/login', { preHandler: authRateLimitHook }, handler);
 * ```
 *
 * Returns 429 with Constitution-compliant error format if rate limited
 */
export async function authRateLimitHook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const ip = getClientIP(request);

  const allowed = await authRateLimiter.check(ip);

  if (!allowed) {
    const retryAfterSeconds = Math.ceil(config.authRateLimitWindow / 1000);

    reply.header('Retry-After', retryAfterSeconds.toString());

    return reply.code(429).send({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
        details: {
          retryAfter: retryAfterSeconds,
        },
      },
    });
  }
}

// Export for testing
export { authRateLimiter, getClientIP };
