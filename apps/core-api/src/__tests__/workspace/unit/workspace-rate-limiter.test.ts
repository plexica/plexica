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
const { mockPipelineExec, mockPipelineIncr, mockPipelineExpire, mockTtl, mockLoggerWarn } =
  vi.hoisted(() => {
    const mockPipelineExec = vi.fn();
    const mockPipelineIncr = vi.fn().mockReturnThis();
    const mockPipelineExpire = vi.fn().mockReturnThis();
    const pipeline = {
      incr: mockPipelineIncr,
      expire: mockPipelineExpire,
      exec: mockPipelineExec,
    };
    return {
      mockPipelineExec,
      mockPipelineIncr,
      mockPipelineExpire,
      mockTtl: vi.fn(),
      mockLoggerWarn: vi.fn(),
      pipeline,
    };
  });

vi.mock('../../../lib/redis.js', () => {
  const pipeline = {
    incr: mockPipelineIncr,
    expire: mockPipelineExpire,
    exec: mockPipelineExec,
  };
  return {
    default: {
      pipeline: vi.fn(() => pipeline),
      ttl: mockTtl,
    },
  };
});

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

/**
 * Helper to set up a successful pipeline response returning a given INCR value.
 * pipeline.exec() returns [[error, incrResult], [error, expireResult]].
 */
function mockPipelineSuccess(incrValue: number): void {
  mockPipelineExec.mockResolvedValue([
    [null, incrValue], // INCR result
    [null, 1], // EXPIRE result
  ]);
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
    // Default pipeline mock methods to be chainable
    mockPipelineIncr.mockReturnThis();
    mockPipelineExpire.mockReturnThis();
    // Override the global DISABLE_RATE_LIMIT=true set in .env.test so that
    // these unit tests exercise the actual Redis logic path.
    process.env.DISABLE_RATE_LIMIT = 'false';
  });

  afterEach(() => {
    // Restore so other test files that rely on the bypass are unaffected.
    process.env.DISABLE_RATE_LIMIT = 'true';
  });

  it('should return a function (Fastify hook)', () => {
    const hook = rateLimiter(testConfig);
    expect(typeof hook).toBe('function');
  });

  it('should allow request when under the limit', async () => {
    mockPipelineSuccess(1);

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    // Should have called pipeline INCR and EXPIRE with the correct key
    expect(mockPipelineIncr).toHaveBeenCalledWith('ratelimit:test-scope:user-123');
    expect(mockPipelineExpire).toHaveBeenCalledWith('ratelimit:test-scope:user-123', 60);

    // Should set rate limit headers
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');

    // Should NOT have sent a 429 response
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('should set remaining to 0 when at the limit', async () => {
    mockPipelineSuccess(5); // exactly at limit

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    // At limit but not over — should NOT return 429
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should call EXPIRE on every request (not just the first) to prevent immortal keys', async () => {
    // current=3 means this is not the first request in the window
    mockPipelineSuccess(3);

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    // EXPIRE must be called on every request (idempotent) to ensure TTL is always set
    expect(mockPipelineExpire).toHaveBeenCalledWith('ratelimit:test-scope:user-123', 60);
  });

  it('should return 429 with Art. 6.2 error format when over the limit', async () => {
    mockPipelineSuccess(6); // over the limit of 5
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
    mockPipelineSuccess(10);
    mockTtl.mockResolvedValue(-1); // TTL expired or missing

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    expect(reply.header).toHaveBeenCalledWith('Retry-After', '1');
  });

  it('should fail-open when Redis pipeline throws an error', async () => {
    mockPipelineExec.mockRejectedValue(new Error('Redis connection refused'));

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
    mockPipelineExec.mockRejectedValue(new Error('ECONNREFUSED'));

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

    mockPipelineSuccess(1);

    const hook = rateLimiter(customConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    expect(mockPipelineIncr).toHaveBeenCalledWith('ratelimit:custom:custom-key-42');
  });

  it('should fail-open when pipeline returns an error result for INCR', async () => {
    // Simulates: pipeline.exec() resolves but the INCR command itself errored
    // (e.g. Redis returned an error mid-pipeline). The request must still be allowed through.
    mockPipelineExec.mockResolvedValue([
      [new Error('WRONGTYPE'), null], // INCR errored
      [null, 1],
    ]);

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    // Should NOT throw — fail-open
    await expect(invokeHook(hook, request, reply)).resolves.toBeUndefined();

    // Should NOT have sent any 429 response
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();

    // Should have logged the warning
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'test-scope' }),
      expect.stringContaining('Rate limiter Redis pipeline error')
    );
  });

  it('should return 429 with retryAfter=1 when TTL throws while over the limit', async () => {
    // Simulates: pipeline INCR succeeds (over limit) but the separate TTL call throws.
    // Unlike the old implementation where TTL was inside the outer try/catch, the new
    // implementation wraps TTL in its own try/catch — so 429 is ALWAYS returned when
    // the counter is over the limit, even if TTL is unavailable. retryAfter defaults to 1.
    mockPipelineSuccess(6); // over limit of 5
    mockTtl.mockRejectedValue(new Error('Redis TTL failed'));

    const hook = rateLimiter(testConfig);
    const request = createMockRequest();
    const reply = createMockReply();

    await invokeHook(hook, request, reply);

    // Must still return 429 — being over the limit takes priority over TTL availability
    expect(reply.code).toHaveBeenCalledWith(429);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'RATE_LIMIT_EXCEEDED',
          details: expect.objectContaining({ retryAfter: 1 }),
        }),
      })
    );

    // The TTL warn is logged
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'test-scope' }),
      expect.stringContaining('Rate limiter TTL error')
    );
  });
});
