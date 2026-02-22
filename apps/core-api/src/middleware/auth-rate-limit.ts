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
      // SECURITY: Fail CLOSED when Redis is unavailable.
      // Failing open would allow unlimited brute force attempts if an attacker
      // causes a Redis outage or exhausts its connections. Denying requests
      // during Redis downtime is safer than allowing unlimited auth attempts.
      logger.error(
        {
          ip,
          error: error instanceof Error ? error.message : String(error),
        },
        'Auth rate limiter Redis failure, BLOCKING request (fail-closed)'
      );
      return false;
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
 * Parse a comma-separated list of trusted proxy CIDRs from the environment.
 * Supports only IPv4 CIDR notation (e.g. "10.0.0.0/8,172.16.0.0/12").
 * An empty string or absent variable means no proxies are trusted.
 */
function parseTrustedProxyCidrs(): Array<{ base: number; mask: number }> {
  const raw = (process.env['TRUSTED_PROXY_CIDRS'] ?? '').trim();
  if (!raw) return [];

  return raw.split(',').flatMap((cidr) => {
    const trimmed = cidr.trim();
    const [ip, prefix] = trimmed.split('/');
    if (!ip || prefix === undefined) return [];

    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return [];

    const prefixLen = Number(prefix);
    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return [];

    const base = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
    const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
    return [{ base: base & mask, mask }];
  });
}

/**
 * Returns true if the given dotted-decimal IPv4 address falls within
 * any of the trusted proxy CIDR ranges.
 *
 * NOTE: CIDR list is intentionally read from the environment on each call
 * (not cached at module load) so that tests can set TRUSTED_PROXY_CIDRS
 * before calling getClientIP without needing module resets.
 * The parsing cost is negligible (short string split) compared to the
 * Redis round-trip that follows every auth request.
 */
function isTrustedProxy(ip: string): boolean {
  const cidrs = parseTrustedProxyCidrs();
  if (cidrs.length === 0) return false;

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return false;

  const addr = ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
  return cidrs.some(({ base, mask }: { base: number; mask: number }) => (addr & mask) === base);
}

/**
 * Extract client IP from request.
 *
 * X-Forwarded-For is only trusted when the immediate connection IP
 * (request.ip) belongs to a configured trusted proxy CIDR range
 * (TRUSTED_PROXY_CIDRS env var, comma-separated IPv4 CIDRs).
 * This prevents rate-limit bypass via IP spoofing from untrusted clients.
 */
function getClientIP(request: FastifyRequest): string {
  const socketIp = request.ip || 'unknown';

  if (isTrustedProxy(socketIp)) {
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      // X-Forwarded-For can be comma-separated list; take the first (client) IP
      const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      if (ip) return ip.trim();
    }
  }

  return socketIp;
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
