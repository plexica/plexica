// apps/core-api/src/__tests__/authorization/unit/rate-limiter.guard.unit.test.ts
//
// Unit tests for authzRateLimiter Fastify preHandler hook.
// Spec 003 Task 5.6 — NFR-010, Edge Case #13
//
// Paths:
//   1. Skip (return early) in NODE_ENV=test
//   2. Fail-open when Redis throws
//   3. 429 when current > RATE_LIMIT_MAX
//   4. Pass-through with correct headers when under limit
//   5. INCR + EXPIRE (only on first call) flow

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted() so variables are initialized before vi.mock() hoisting
// ---------------------------------------------------------------------------

const mockRedis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
}));

vi.mock('../../../lib/redis.js', () => ({ default: mockRedis }));
vi.mock('../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { authzRateLimiter } from '../../../modules/authorization/guards/rate-limiter.guard.js';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from '../../../modules/authorization/constants.js';
import type { FastifyRequest, FastifyReply } from 'fastify';

// The guard is typed as preHandlerHookHandler (sync signature) but implemented as
// async — cast it to the async variant for testing purposes.
type AsyncGuard = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
const asyncGuard = authzRateLimiter as unknown as AsyncGuard;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(tenantId?: string): FastifyRequest {
  return {
    tenant: tenantId ? { tenantId } : undefined,
    user: undefined,
  } as unknown as FastifyRequest;
}

function makeReply(): {
  code: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  header: ReturnType<typeof vi.fn>;
} {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn(),
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authzRateLimiter', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('should skip rate limiting in test environment', async () => {
    process.env.NODE_ENV = 'test';

    const req = makeRequest('tenant-1');
    const reply = makeReply();

    const result = await asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(result).toBeUndefined();
    expect(mockRedis.incr).not.toHaveBeenCalled();
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should fail-open when Redis throws', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.incr.mockRejectedValue(new Error('Redis connection refused'));

    const req = makeRequest('tenant-1');
    const reply = makeReply();

    // Should NOT throw — fail-open means the request passes through
    await expect(
      asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply)
    ).resolves.toBeUndefined();

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should return 429 with correct headers when limit is exceeded', async () => {
    process.env.NODE_ENV = 'production';
    const overLimit = RATE_LIMIT_MAX + 1;
    mockRedis.incr.mockResolvedValue(overLimit);
    mockRedis.ttl.mockResolvedValue(42);

    const req = makeRequest('tenant-1');
    const reply = makeReply();

    await asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    expect(reply.header).toHaveBeenCalledWith('Retry-After', '42');
    expect(reply.code).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
        }),
      })
    );
  });

  it('should set headers and pass through when under the rate limit', async () => {
    process.env.NODE_ENV = 'production';
    const current = 10;
    mockRedis.incr.mockResolvedValue(current);

    const req = makeRequest('tenant-1');
    const reply = makeReply();

    const result = await asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(result).toBeUndefined();
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    expect(reply.header).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      String(RATE_LIMIT_MAX - current)
    );
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should call EXPIRE only when current count is 1 (first request in window)', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.incr.mockResolvedValue(1);

    const req = makeRequest('tenant-1');
    const reply = makeReply();

    await asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(mockRedis.expire).toHaveBeenCalledWith(
      expect.stringContaining('tenant-1'),
      RATE_LIMIT_WINDOW
    );
  });

  it('should NOT call EXPIRE when count > 1 (subsequent requests)', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.incr.mockResolvedValue(5);

    const req = makeRequest('tenant-1');
    const reply = makeReply();

    await asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  it('should fall back to unknown-tenant when tenant context is absent', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.incr.mockResolvedValue(1);

    const req = { tenant: undefined, user: undefined } as unknown as FastifyRequest;
    const reply = makeReply();

    await asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('unknown-tenant'));
  });

  it('should use minimum Retry-After of 1 second when TTL is 0 or negative', async () => {
    process.env.NODE_ENV = 'production';
    mockRedis.incr.mockResolvedValue(RATE_LIMIT_MAX + 1);
    mockRedis.ttl.mockResolvedValue(0);

    const req = makeRequest('tenant-1');
    const reply = makeReply();

    await asyncGuard(req as FastifyRequest, reply as unknown as FastifyReply);

    expect(reply.header).toHaveBeenCalledWith('Retry-After', '1');
  });
});
