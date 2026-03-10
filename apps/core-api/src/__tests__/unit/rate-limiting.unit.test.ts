// apps/core-api/src/__tests__/unit/rate-limiting.unit.test.ts
//
// Spec 015 T015-17: Rate limiting unit tests
//
// Verifies that the 3-tier rate limiting config (AUTH, ADMIN, GENERAL) correctly
// enforces limits and returns 429 with Retry-After headers when exceeded.
//
// Uses the rateLimiter() factory with an injected mock Redis client — no
// ESM module mocking required (avoids the ESM module cache problem).
//
// Run with:
//   npx vitest run --config test/vitest.config.unit.ts src/__tests__/unit/rate-limiting.unit.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { rateLimiter } from '../../middleware/rate-limiter.js';
import type { RateLimitConfig } from '../../middleware/rate-limiter.js';
import {
  AUTH_RATE_LIMIT,
  ADMIN_RATE_LIMIT,
  GENERAL_RATE_LIMIT,
} from '../../lib/rate-limit-config.js';

// ---------------------------------------------------------------------------
// Build mock Redis object
// ---------------------------------------------------------------------------

const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

const mockRedis = {
  pipeline: vi.fn(() => mockPipeline),
  ttl: vi.fn(),
} as unknown as Redis;

// ---------------------------------------------------------------------------
// Helpers — build minimal mock request/reply objects
// ---------------------------------------------------------------------------

function mockRequest(ip = '127.0.0.1'): FastifyRequest {
  return {
    ip,
    tenant: undefined,
    user: undefined,
  } as unknown as FastifyRequest;
}

function mockReply() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let sentBody: unknown = undefined;
  let isSent = false;

  const reply = {
    header: vi.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
      return reply;
    }),
    code: vi.fn((code: number) => {
      statusCode = code;
      return reply;
    }),
    send: vi.fn((body?: unknown) => {
      sentBody = body;
      isSent = true;
      return Promise.resolve(reply);
    }),
    _headers: headers,
    get statusCode() {
      return statusCode;
    },
    get sentBody() {
      return sentBody;
    },
    get isSent() {
      return isSent;
    },
  };

  return reply;
}

/** Simulate Redis pipeline returning INCR count. */
function setPipelineCount(count: number): void {
  mockPipeline.exec.mockResolvedValue([
    [null, count],
    [null, 1],
  ]);
}

/** Simulate Redis pipeline error (fail-open path). */
function setPipelineError(): void {
  mockPipeline.exec.mockResolvedValue([
    [new Error('Redis error'), null],
    [null, null],
  ]);
}

// Helper type: the hook's actual call signature without the `this` constraint
type HookCallable = (req: FastifyRequest, reply: FastifyReply, done: () => void) => Promise<void>;

/** Invoke rateLimiter hook without the FastifyInstance `this` constraint */
function invoke(config: RateLimitConfig, req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return (rateLimiter(config, mockRedis) as unknown as HookCallable)(req, reply, vi.fn());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Rate Limiting — rateLimiter() factory', () => {
  let savedDisableRateLimit: string | undefined;

  beforeEach(() => {
    // .env.test sets DISABLE_RATE_LIMIT=true globally — disable that for these tests
    savedDisableRateLimit = process.env['DISABLE_RATE_LIMIT'];
    delete process.env['DISABLE_RATE_LIMIT'];

    // Reset and re-establish mock chains before each test
    mockPipeline.incr.mockReset().mockReturnThis();
    mockPipeline.expire.mockReset().mockReturnThis();
    mockPipeline.exec.mockReset();
    (mockRedis.pipeline as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(mockPipeline);
    (mockRedis.ttl as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    // Restore env var after each test
    if (savedDisableRateLimit !== undefined) {
      process.env['DISABLE_RATE_LIMIT'] = savedDisableRateLimit;
    } else {
      delete process.env['DISABLE_RATE_LIMIT'];
    }
  });

  // -------------------------------------------------------------------------
  // AUTH tier
  // -------------------------------------------------------------------------

  describe('AUTH tier (default: 20 req/min)', () => {
    it('should allow requests under the limit', async () => {
      setPipelineCount(5); // 5th request of 20

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.isSent).toBe(false);
      expect(reply._headers['x-ratelimit-limit']).toBe('20');
      expect(reply._headers['x-ratelimit-remaining']).toBe('15'); // 20 - 5
    });

    it('should allow the request exactly at the limit', async () => {
      setPipelineCount(20); // exactly at limit

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.isSent).toBe(false);
      expect(reply._headers['x-ratelimit-remaining']).toBe('0');
    });

    it('should return 429 when limit is exceeded', async () => {
      setPipelineCount(21); // 21st request — over limit of 20
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(45);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
      expect(reply._headers['retry-after']).toBe('45');

      const body = reply.sentBody as {
        error: { code: string; message: string; details: { retryAfter: number } };
      };
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(body.error.details.retryAfter).toBe(45);
    });

    it('should return Constitution Art. 6.2 error format on 429', async () => {
      setPipelineCount(25);
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(30);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
      const body = reply.sentBody as {
        error: { code: string; message: string; details: object };
      };
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code');
      expect(body.error).toHaveProperty('message');
      expect(body.error).toHaveProperty('details');
      expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should include Retry-After header on 429', async () => {
      setPipelineCount(21);
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(55);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
      expect(reply._headers['retry-after']).toBeDefined();
      expect(parseInt(reply._headers['retry-after'], 10)).toBeGreaterThanOrEqual(1);
    });

    it('should fail-open when Redis pipeline errors', async () => {
      setPipelineError();

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      // Fail-open: request is allowed through (not sent/blocked)
      expect(reply.isSent).toBe(false);
    });

    it('should bypass rate limiting when DISABLE_RATE_LIMIT=true', async () => {
      const original = process.env['DISABLE_RATE_LIMIT'];
      process.env['DISABLE_RATE_LIMIT'] = 'true';

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.isSent).toBe(false);
      expect(mockRedis.pipeline).not.toHaveBeenCalled();

      process.env['DISABLE_RATE_LIMIT'] = original;
    });
  });

  // -------------------------------------------------------------------------
  // ADMIN tier
  // -------------------------------------------------------------------------

  describe('ADMIN tier (default: 60 req/min)', () => {
    it('should allow requests under the limit', async () => {
      setPipelineCount(30); // 30th request of 60

      const req = mockRequest();
      const reply = mockReply();
      await invoke(ADMIN_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.isSent).toBe(false);
      expect(reply._headers['x-ratelimit-limit']).toBe('60');
    });

    it('should return 429 when ADMIN limit is exceeded', async () => {
      setPipelineCount(61); // 61st request — over limit of 60
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(20);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(ADMIN_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
    });
  });

  // -------------------------------------------------------------------------
  // GENERAL tier
  // -------------------------------------------------------------------------

  describe('GENERAL tier (default: 120 req/min)', () => {
    it('should allow requests under the limit', async () => {
      setPipelineCount(60); // 60th request of 120

      const req = mockRequest();
      const reply = mockReply();
      await invoke(GENERAL_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.isSent).toBe(false);
      expect(reply._headers['x-ratelimit-limit']).toBe('120');
    });

    it('should return 429 when GENERAL limit is exceeded', async () => {
      setPipelineCount(121); // 121st request — over limit of 120
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(10);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(GENERAL_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
    });
  });

  // -------------------------------------------------------------------------
  // Env-var overrides
  // -------------------------------------------------------------------------

  describe('Environment variable overrides', () => {
    it('should respect RATE_LIMIT_AUTH env override', async () => {
      const original = process.env['RATE_LIMIT_AUTH'];
      process.env['RATE_LIMIT_AUTH'] = '5';

      setPipelineCount(6); // Over the custom limit of 5
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(60);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
      expect(reply._headers['x-ratelimit-limit']).toBe('5');

      process.env['RATE_LIMIT_AUTH'] = original;
    });

    it('should respect RATE_LIMIT_ADMIN env override', async () => {
      const original = process.env['RATE_LIMIT_ADMIN'];
      process.env['RATE_LIMIT_ADMIN'] = '10';

      setPipelineCount(11);
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(30);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(ADMIN_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
      expect(reply._headers['x-ratelimit-limit']).toBe('10');

      process.env['RATE_LIMIT_ADMIN'] = original;
    });

    it('should respect RATE_LIMIT_GENERAL env override', async () => {
      const original = process.env['RATE_LIMIT_GENERAL'];
      process.env['RATE_LIMIT_GENERAL'] = '15';

      setPipelineCount(16);
      (mockRedis.ttl as ReturnType<typeof vi.fn>).mockResolvedValue(45);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(GENERAL_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.statusCode).toBe(429);
      expect(reply._headers['x-ratelimit-limit']).toBe('15');

      process.env['RATE_LIMIT_GENERAL'] = original;
    });

    it('should use default when RATE_LIMIT_AUTH is not a positive integer', async () => {
      const original = process.env['RATE_LIMIT_AUTH'];
      process.env['RATE_LIMIT_AUTH'] = 'invalid';

      setPipelineCount(1);

      const req = mockRequest();
      const reply = mockReply();
      await invoke(AUTH_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(reply.isSent).toBe(false);
      expect(reply._headers['x-ratelimit-limit']).toBe('20');

      process.env['RATE_LIMIT_AUTH'] = original;
    });
  });

  // -------------------------------------------------------------------------
  // Scope key isolation
  // -------------------------------------------------------------------------

  describe('Rate limit scope key format', () => {
    it('should use ratelimit:{scope}:{key} key format', async () => {
      setPipelineCount(1);

      const req = mockRequest('10.0.0.1');
      const reply = mockReply();
      await invoke(ADMIN_RATE_LIMIT, req, reply as unknown as FastifyReply);

      expect(mockPipeline.incr).toHaveBeenCalledWith(expect.stringMatching(/^ratelimit:admin:/));
    });
  });
});
