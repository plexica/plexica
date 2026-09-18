// unit/notification/consumer-cap.test.ts
// Unit tests for the per-user delivery cap (fix 5): INCR + EXPIRE must run as
// one atomic multi() pipeline with EXPIRE ... NX — a two-round-trip incr/expire
// could leave a TTL-less key and permanently suppress delivery. Pure unit tests
// — Redis mocked, no connections.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const chain = {
    incr: vi.fn(function (this: unknown) {
      return this;
    }),
    expire: vi.fn(function (this: unknown) {
      return this;
    }),
    exec: vi.fn(async () => [
      [null, 5],
      [null, 1],
    ]),
  };
  return {
    multi: vi.fn(() => chain),
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    chain,
    incrementRateLimited: vi.fn(),
  };
});

vi.mock('../../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../../lib/redis.js', () => ({
  redis: { multi: mocks.multi, incr: mocks.incr, expire: mocks.expire },
}));
vi.mock('../../../lib/tenant-database.js', () => ({ withCoreDb: vi.fn() }));
vi.mock('../../../lib/tenant-schema-helpers.js', () => ({
  toRealmName: vi.fn(),
  toSchemaName: vi.fn(),
}));
vi.mock('../../../modules/notification/consumer-metrics.js', () => ({
  incrementRateLimited: mocks.incrementRateLimited,
}));

import { isUserRateLimited } from '../../../modules/notification/consumer-cap.js';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('isUserRateLimited — atomic INCR + EXPIRE NX (fix 5)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs INCR and EXPIRE as a single multi() pipeline, never separate calls', async () => {
    await isUserRateLimited(TENANT_ID, USER_ID);

    expect(mocks.multi).toHaveBeenCalledTimes(1);
    expect(mocks.incr).not.toHaveBeenCalled();
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.chain.incr).toHaveBeenCalled();
    expect(mocks.chain.expire).toHaveBeenCalled();
  });

  it('sets the initial window with EXPIRE ... NX (idempotent on the fixed window)', async () => {
    await isUserRateLimited(TENANT_ID, USER_ID);
    const call = mocks.chain.expire.mock.calls[0] as unknown[] | undefined;
    expect(call?.[0]).toContain(`notification:${TENANT_ID}:${USER_ID}:emit`);
    expect(call?.[1]).toBe(60);
    expect(call?.[2]).toBe('NX');
  });

  it('returns false when the count is within the cap', async () => {
    const limited = await isUserRateLimited(TENANT_ID, USER_ID);
    expect(limited).toBe(false);
    expect(mocks.incrementRateLimited).not.toHaveBeenCalled();
  });

  it('returns true and counts when the count exceeds the cap', async () => {
    mocks.chain.exec.mockResolvedValueOnce([
      [null, 150],
      [null, 1],
    ]);
    const limited = await isUserRateLimited(TENANT_ID, USER_ID);
    expect(limited).toBe(true);
    expect(mocks.incrementRateLimited).toHaveBeenCalled();
  });

  it('fails open when Redis is unavailable', async () => {
    mocks.chain.exec.mockRejectedValueOnce(new Error('connection refused'));
    await expect(isUserRateLimited(TENANT_ID, USER_ID)).resolves.toBe(false);
  });
});
