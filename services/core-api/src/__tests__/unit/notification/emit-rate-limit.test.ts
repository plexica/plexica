// unit/notification/emit-rate-limit.test.ts
// Unit tests for the plugin emission rate limiter (fix 12): INCR + EXPIRE must
// be one atomic multi() pipeline with EXPIRE ... NX, and failures must fail
// open (ADR-012). Pure unit tests — Redis client mocked, no connections.

import { describe, expect, it, vi } from 'vitest';

import {
  EmitRateLimiter,
  RateLimitExceededError,
} from '../../../modules/notification/emit-rate-limit.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const SLUG = 'crm';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function mockClient(
  count: number,
  execImpl?: () => Promise<unknown>
): {
  client: {
    multi: ReturnType<typeof vi.fn>;
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  };
  chain: {
    incr: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
    exec: ReturnType<typeof vi.fn>;
  };
} {
  const chain = {
    incr: vi.fn(function (this: unknown) {
      return this;
    }),
    expire: vi.fn(function (this: unknown) {
      return this;
    }),
    exec: vi.fn(
      execImpl ??
        (async () => [
          [null, count],
          [null, 1],
        ])
    ),
  };
  const client = {
    multi: vi.fn(() => chain),
    incr: vi.fn(async () => count),
    expire: vi.fn(async () => 1),
  };
  return { client, chain };
}

describe('EmitRateLimiter — atomic INCR + EXPIRE NX (fix 12)', () => {
  it('runs INCR and EXPIRE as one multi() pipeline with EXPIRE ... NX', async () => {
    const { client, chain } = mockClient(3);
    await new EmitRateLimiter(client as never).assert(TENANT_ID, SLUG, USER_ID);

    expect(client.multi).toHaveBeenCalledTimes(1);
    expect(client.incr).not.toHaveBeenCalled();
    expect(client.expire).not.toHaveBeenCalled();
    expect(chain.incr).toHaveBeenCalled();
    expect(chain.expire).toHaveBeenCalled();
    const call = chain.expire.mock.calls[0] as unknown[] | undefined;
    expect(call?.[0]).toBe(`notif-rl:${TENANT_ID}:${SLUG}:${USER_ID}`);
    expect(call?.[1]).toBe(60);
    expect(call?.[2]).toBe('NX');
  });

  it('allows emission within the per-plugin per-user window', async () => {
    const { client } = mockClient(5);
    await expect(
      new EmitRateLimiter(client as never).assert(TENANT_ID, SLUG, USER_ID)
    ).resolves.toBeUndefined();
  });

  it('throws 429 RATE_LIMIT_EXCEEDED when the count exceeds the limit', async () => {
    const { client } = mockClient(11);
    await expect(
      new EmitRateLimiter(client as never).assert(TENANT_ID, SLUG, USER_ID)
    ).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('fails open when Redis is unavailable', async () => {
    const { client } = mockClient(0, () => Promise.reject(new Error('connection refused')));
    await expect(
      new EmitRateLimiter(client as never).assert(TENANT_ID, SLUG, USER_ID)
    ).resolves.toBeUndefined();
  });
});
