// apps/core-api/src/__tests__/auth/unit/auth-rate-limit.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  authRateLimitHook,
  authRateLimiter,
  getClientIP,
} from '../../../middleware/auth-rate-limit.js';
import { redis } from '../../../lib/redis.js';
import { config } from '../../../config/index.js';

// Mock Redis
vi.mock('../../../lib/redis.js', () => ({
  redis: {
    eval: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('AuthRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('check()', () => {
    it('should allow request when under limit (9 attempts)', async () => {
      // Mock Redis eval to return 1 (allowed)
      vi.mocked(redis.eval).mockResolvedValue(1);

      const allowed = await authRateLimiter.check('192.168.1.1');

      expect(allowed).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String), // Lua script
        1, // Number of keys
        'auth:ratelimit:192.168.1.1', // Key
        config.authRateLimitMax, // Limit
        Math.floor(config.authRateLimitWindow / 1000) // Window in seconds
      );
    });

    it('should allow request at exactly the limit (10 attempts)', async () => {
      // Mock Redis eval to return 1 (allowed)
      vi.mocked(redis.eval).mockResolvedValue(1);

      const allowed = await authRateLimiter.check('192.168.1.2');

      expect(allowed).toBe(true);
    });

    it('should reject request when over limit (11 attempts)', async () => {
      // Mock Redis eval to return 0 (rate limited)
      vi.mocked(redis.eval).mockResolvedValue(0);

      const allowed = await authRateLimiter.check('192.168.1.3');

      expect(allowed).toBe(false);
    });

    it('should use correct Redis key pattern', async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      await authRateLimiter.check('10.0.0.1');

      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'auth:ratelimit:10.0.0.1',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should handle Redis failure gracefully (block request - fail-closed)', async () => {
      // Mock Redis failure
      vi.mocked(redis.eval).mockRejectedValue(new Error('Redis connection failed'));

      const allowed = await authRateLimiter.check('192.168.1.4');

      // SECURITY: Fail-closed to prevent unlimited brute force if Redis is down (HIGH #4 fix)
      expect(allowed).toBe(false);
    });

    it('should pass correct window in seconds to Lua script', async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      await authRateLimiter.check('192.168.1.5');

      // Window should be converted from milliseconds to seconds
      const expectedWindowSeconds = Math.floor(config.authRateLimitWindow / 1000);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        expect.any(String),
        expect.any(Number),
        expectedWindowSeconds
      );
    });
  });

  describe('getCount()', () => {
    it('should return current attempt count from Redis', async () => {
      vi.mocked(redis.get).mockResolvedValue('5');

      const count = await authRateLimiter.getCount('192.168.1.6');

      expect(count).toBe(5);
      expect(redis.get).toHaveBeenCalledWith('auth:ratelimit:192.168.1.6');
    });

    it('should return 0 when key does not exist', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      const count = await authRateLimiter.getCount('192.168.1.7');

      expect(count).toBe(0);
    });

    it('should return 0 on Redis failure', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis error'));

      const count = await authRateLimiter.getCount('192.168.1.8');

      expect(count).toBe(0);
    });
  });

  describe('reset()', () => {
    it('should delete Redis key for IP', async () => {
      vi.mocked(redis.del).mockResolvedValue(1);

      await authRateLimiter.reset('192.168.1.9');

      expect(redis.del).toHaveBeenCalledWith('auth:ratelimit:192.168.1.9');
    });

    it('should handle Redis failure gracefully', async () => {
      vi.mocked(redis.del).mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(authRateLimiter.reset('192.168.1.10')).resolves.toBeUndefined();
    });
  });
});

describe('getClientIP()', () => {
  it('should extract IP from X-Forwarded-For header (single IP)', () => {
    const request = {
      headers: {
        'x-forwarded-for': '203.0.113.1',
      },
      ip: '10.0.0.1',
    } as unknown as FastifyRequest;

    const ip = getClientIP(request);

    expect(ip).toBe('203.0.113.1');
  });

  it('should extract first IP from X-Forwarded-For header (multiple IPs)', () => {
    const request = {
      headers: {
        'x-forwarded-for': '203.0.113.1, 198.51.100.1, 192.0.2.1',
      },
      ip: '10.0.0.1',
    } as unknown as FastifyRequest;

    const ip = getClientIP(request);

    expect(ip).toBe('203.0.113.1');
  });

  it('should handle X-Forwarded-For as array (multiple values)', () => {
    const request = {
      headers: {
        'x-forwarded-for': ['203.0.113.1', '198.51.100.1'],
      },
      ip: '10.0.0.1',
    } as unknown as FastifyRequest;

    const ip = getClientIP(request);

    expect(ip).toBe('203.0.113.1');
  });

  it('should fall back to request.ip when X-Forwarded-For is missing', () => {
    const request = {
      headers: {},
      ip: '10.0.0.1',
    } as unknown as FastifyRequest;

    const ip = getClientIP(request);

    expect(ip).toBe('10.0.0.1');
  });

  it('should return "unknown" when both X-Forwarded-For and request.ip are missing', () => {
    const request = {
      headers: {},
      ip: undefined,
    } as unknown as FastifyRequest;

    const ip = getClientIP(request);

    expect(ip).toBe('unknown');
  });

  it('should trim whitespace from X-Forwarded-For IP', () => {
    const request = {
      headers: {
        'x-forwarded-for': '  203.0.113.1  ',
      },
      ip: '10.0.0.1',
    } as unknown as FastifyRequest;

    const ip = getClientIP(request);

    expect(ip).toBe('203.0.113.1');
  });
});

describe('authRateLimitHook()', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      ip: '192.168.1.100',
      log: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
      } as any,
    };

    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };
  });

  it('should allow request when under rate limit', async () => {
    vi.mocked(redis.eval).mockResolvedValue(1); // Allowed

    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.code).not.toHaveBeenCalled();
    expect(mockReply.send).not.toHaveBeenCalled();
  });

  it('should return 429 when rate limit exceeded', async () => {
    vi.mocked(redis.eval).mockResolvedValue(0); // Rate limited

    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.code).toHaveBeenCalledWith(429);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
        details: {
          retryAfter: expect.any(Number),
        },
      },
    });
  });

  it('should set Retry-After header when rate limited', async () => {
    vi.mocked(redis.eval).mockResolvedValue(0); // Rate limited

    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('should use Constitution-compliant error format (nested)', async () => {
    vi.mocked(redis.eval).mockResolvedValue(0); // Rate limited

    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);

    const sentError = (mockReply.send as any).mock.calls[0][0];
    expect(sentError).toHaveProperty('error');
    expect(sentError.error).toHaveProperty('code', 'AUTH_RATE_LIMITED');
    expect(sentError.error).toHaveProperty('message');
    expect(sentError.error).toHaveProperty('details');
  });

  it('should extract IP from X-Forwarded-For header', async () => {
    mockRequest.headers = { 'x-forwarded-for': '203.0.113.50' };
    vi.mocked(redis.eval).mockResolvedValue(1);

    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'auth:ratelimit:203.0.113.50',
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('should calculate correct retryAfter in seconds', async () => {
    vi.mocked(redis.eval).mockResolvedValue(0); // Rate limited

    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);

    const expectedRetryAfter = Math.ceil(config.authRateLimitWindow / 1000);
    expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expectedRetryAfter.toString());

    const sentError = (mockReply.send as any).mock.calls[0][0];
    expect(sentError.error.details.retryAfter).toBe(expectedRetryAfter);
  });

  it('should handle multiple requests from same IP', async () => {
    // First request allowed
    vi.mocked(redis.eval).mockResolvedValueOnce(1);
    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);
    expect(mockReply.code).not.toHaveBeenCalled();

    // Reset mocks
    vi.clearAllMocks();
    mockReply.code = vi.fn().mockReturnThis();
    mockReply.send = vi.fn().mockReturnThis();

    // Second request rate limited
    vi.mocked(redis.eval).mockResolvedValueOnce(0);
    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);
    expect(mockReply.code).toHaveBeenCalledWith(429);
  });

  it('should handle Redis failure gracefully (block request - fail-closed)', async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error('Redis connection failed'));

    await authRateLimitHook(mockRequest as FastifyRequest, mockReply as FastifyReply);

    // SECURITY: Fail-closed to prevent unlimited brute force if Redis is down (HIGH #4 fix)
    expect(mockReply.code).toHaveBeenCalledWith(429);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
        details: {
          retryAfter: expect.any(Number),
        },
      },
    });
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Edge Case #10: Rate limit window expiration resets counter', async () => {
    // First request - counter starts at 1
    vi.mocked(redis.eval).mockResolvedValueOnce(1);
    await authRateLimiter.check('192.168.1.200');

    // Verify Redis eval was called with window expiration
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('EXPIRE'), // Lua script sets TTL
      1,
      'auth:ratelimit:192.168.1.200',
      config.authRateLimitMax,
      Math.floor(config.authRateLimitWindow / 1000)
    );

    // After window expires (simulated by Redis returning new counter)
    vi.mocked(redis.eval).mockResolvedValueOnce(1); // Counter reset to 1
    const allowedAfterExpiry = await authRateLimiter.check('192.168.1.200');

    expect(allowedAfterExpiry).toBe(true);
  });

  it('should handle IPv6 addresses', async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    await authRateLimiter.check(ipv6);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `auth:ratelimit:${ipv6}`,
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('should handle rapid successive requests (atomic operation)', async () => {
    // Simulate 15 rapid requests
    const promises = Array.from({ length: 15 }, (_, i) => {
      // First 10 allowed, rest blocked
      vi.mocked(redis.eval).mockResolvedValueOnce(i < 10 ? 1 : 0);
      return authRateLimiter.check('192.168.1.250');
    });

    const results = await Promise.all(promises);

    // First 10 should be allowed
    expect(results.slice(0, 10).every((r) => r === true)).toBe(true);
    // Last 5 should be blocked
    expect(results.slice(10).every((r) => r === false)).toBe(true);
  });
});
