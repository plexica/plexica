// apps/core-api/src/__tests__/workspace/unit/workspace-rate-limiter.test.ts
//
// Unit tests for the workspace-specific Redis rate limiter.
// Validates Constitution Art. 9.2 compliance (DoS protection)
// and Art. 6.2 compliance (error response format).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// vi.mock factories are hoisted — must not reference external variables.
// Use vi.hoisted() to create mock functions that can be referenced in both
// the factory and test code.
const { mockIncr, mockExpire, mockTtl, mockLoggerWarn } = vi.hoisted(() => ({
  mockIncr: vi.fn(),
  mockExpire: vi.fn(),
  mockTtl: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock('../../../lib/redis.js', () => ({
  default: {
    incr: mockIncr,
    expire: mockExpire,
    ttl: mockTtl,
  },
}));

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  rateLimiter,
  WORKSPACE_RATE_LIMITS,
  type RateLimitConfig,
} from '../../../middleware/rate-limiter.js';

/**
 * Helper to invoke the rate limiter hook.
 * The hook is typed as preHandlerHookHandler (3 args: req, reply, done)
 * but our implementation is async, so we cast and call with 2 args.
 */
async function invokeHook(
  hook: ReturnType<typeof rateLimiter>,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await (hook as (req: FastifyRequest, rep: FastifyReply) => Promise<void>)(request, reply);
}

/**
 * Create a mock FastifyRequest with optional properties.
 */
function createMockRequest(overrides?: Partial<FastifyRequest>): FastifyRequest {
  return {
    params: {},
    user: { id: 'user-123' },
    tenant: { tenantId: 'tenant-456' },
    ...overrides,
  } as unknown as FastifyRequest;
}

/**
 * Create a mock FastifyReply with chainable methods.
 */
function createMockReply(): FastifyReply & {
  _headers: Record<string, string>;
  _statusCode: number;
  _body: unknown;
} {
  const headers: Record<string, string> = {};
  const statusCode = 200;
  const body: unknown = undefined;

  const reply = {
    _headers: headers,
    _statusCode: statusCode,
    _body: body,
    header: vi.fn((key: string, value: string) => {
      headers[key] = value;
      return reply;
    }),
    code: vi.fn((code: number) => {
      reply._statusCode = code;
      return reply;
    }),
    send: vi.fn((data: unknown) => {
      reply._body = data;
      return reply;
    }),
  };

  return reply as unknown as FastifyReply & {
    _headers: Record<string, string>;
    _statusCode: number;
    _body: unknown;
  };
}

describe('WORKSPACE_RATE_LIMITS', () => {
  it('should define WORKSPACE_CREATE tier (10/min per tenant)', () => {
    const config = WORKSPACE_RATE_LIMITS.WORKSPACE_CREATE;
    expect(config.scope).toBe('ws-create');
    expect(config.limit).toBe(10);
    expect(config.windowSeconds).toBe(60);
    expect(typeof config.keyExtractor).toBe('function');
  });

  it('should define WORKSPACE_READ tier (100/min per user)', () => {
    const config = WORKSPACE_RATE_LIMITS.WORKSPACE_READ;
    expect(config.scope).toBe('ws-read');
    expect(config.limit).toBe(100);
    expect(config.windowSeconds).toBe(60);
  });

  it('should define MEMBER_MANAGEMENT tier (50/min per workspace)', () => {
    const config = WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT;
    expect(config.scope).toBe('ws-member');
    expect(config.limit).toBe(50);
    expect(config.windowSeconds).toBe(60);
  });

  it('should define RESOURCE_SHARING tier (20/min per workspace)', () => {
    const config = WORKSPACE_RATE_LIMITS.RESOURCE_SHARING;
    expect(config.scope).toBe('ws-resource');
    expect(config.limit).toBe(20);
    expect(config.windowSeconds).toBe(60);
  });

  describe('keyExtractor functions', () => {
    it('should extract tenantId for WORKSPACE_CREATE', () => {
      const request = createMockRequest({ tenant: { tenantId: 'tenant-abc' } } as any);
      const key = WORKSPACE_RATE_LIMITS.WORKSPACE_CREATE.keyExtractor(request);
      expect(key).toBe('tenant-abc');
    });

    it('should extract userId for WORKSPACE_READ', () => {
      const request = createMockRequest({ user: { id: 'user-xyz' } } as any);
      const key = WORKSPACE_RATE_LIMITS.WORKSPACE_READ.keyExtractor(request);
      expect(key).toBe('user-xyz');
    });

    it('should extract workspaceId for MEMBER_MANAGEMENT', () => {
      const request = createMockRequest({ params: { workspaceId: 'ws-789' } } as any);
      const key = WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT.keyExtractor(request);
      expect(key).toBe('ws-789');
    });

    it('should fallback to "unknown-tenant" when tenant is absent', () => {
      const request = createMockRequest({ tenant: undefined } as any);
      const key = WORKSPACE_RATE_LIMITS.WORKSPACE_CREATE.keyExtractor(request);
      expect(key).toBe('unknown-tenant');
    });

    it('should fallback to "anonymous" when user is absent', () => {
      const request = createMockRequest({ user: undefined } as any);
      const key = WORKSPACE_RATE_LIMITS.WORKSPACE_READ.keyExtractor(request);
      expect(key).toBe('anonymous');
    });

    it('should fallback to "unknown-workspace" when workspaceId is absent', () => {
      const request = createMockRequest({ params: {} } as any);
      const key = WORKSPACE_RATE_LIMITS.MEMBER_MANAGEMENT.keyExtractor(request);
      expect(key).toBe('unknown-workspace');
    });
  });
});

describe('rateLimiter', () => {
  const testConfig: RateLimitConfig = {
    scope: 'test-scope',
    limit: 5,
    windowSeconds: 60,
    keyExtractor: (req: FastifyRequest) => (req as any).user?.id || 'anon',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Override NODE_ENV so the rate limiter logic actually executes
    // (rate-limiter.ts line 111 skips when NODE_ENV === 'test')
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    process.env.NODE_ENV = 'test';
  });

  it('should return a function (Fastify hook)', () => {
    const hook = rateLimiter(testConfig);
    expect(typeof hook).toBe('function');
  });

  it('should allow request when under the limit', async () => {
    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    // Should have called Redis INCR with the correct key
    expect(mockIncr).toHaveBeenCalledWith('ratelimit:test-scope:user-123');

    // Should set EXPIRE on first request (current === 1)
    expect(mockExpire).toHaveBeenCalledWith('ratelimit:test-scope:user-123', 60);

    // Should set rate limit headers
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');

    // Should NOT have sent a 429 response
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should set remaining to 0 when at the limit', async () => {
    mockIncr.mockResolvedValue(5); // exactly at limit

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    // At limit but not over — should NOT return 429
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should NOT set EXPIRE on subsequent requests (current > 1)', async () => {
    mockIncr.mockResolvedValue(3); // not the first request

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    // EXPIRE should NOT be called for non-first requests
    expect(mockExpire).not.toHaveBeenCalled();
  });

  it('should return 429 with Art. 6.2 error format when over the limit', async () => {
    mockIncr.mockResolvedValue(6); // over the limit of 5
    mockTtl.mockResolvedValue(42);

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    // Should have checked TTL for Retry-After header
    expect(mockTtl).toHaveBeenCalledWith('ratelimit:test-scope:user-123');

    // Should set Retry-After header
    expect(reply.header).toHaveBeenCalledWith('Retry-After', '42');

    // Should set remaining to 0
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');

    // Should send 429 with Constitution Art. 6.2 format
    expect(reply.code).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Try again in 42 seconds.',
        details: {
          scope: 'test-scope',
          limit: 5,
          windowSeconds: 60,
          retryAfter: 42,
        },
      },
    });
  });

  it('should set Retry-After to at least 1 second when TTL is 0 or negative', async () => {
    mockIncr.mockResolvedValue(10);
    mockTtl.mockResolvedValue(-1); // TTL expired or missing

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    expect(reply.header).toHaveBeenCalledWith('Retry-After', '1');
  });

  it('should fail-open when Redis throws an error', async () => {
    mockIncr.mockRejectedValue(new Error('Redis connection refused'));

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    // Should NOT throw — fail-open means request is allowed
    await expect(invokeHook(hook, request, reply)).resolves.toBeUndefined();

    // Should NOT have sent any response
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should log a warning when Redis errors occur', async () => {
    mockIncr.mockRejectedValue(new Error('ECONNREFUSED'));

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'test-scope' }),
      expect.stringContaining('Rate limiter Redis error')
    );
  });

  it('should use keyExtractor to build the Redis key', async () => {
    const customConfig: RateLimitConfig = {
      scope: 'custom',
      limit: 100,
      windowSeconds: 300,
      keyExtractor: () => 'custom-key-42',
    };

    mockIncr.mockResolvedValue(1);
    mockExpire.mockResolvedValue(1);

    const hook = rateLimiter(customConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    expect(mockIncr).toHaveBeenCalledWith('ratelimit:custom:custom-key-42');
  });
});
