// smoke-redis.test.ts
// Integration smoke test: Redis SET/GET/DEL round-trip.
// Connects to real Docker Redis — no mock (no ioredis-mock).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import Redis from 'ioredis';

import { config } from '../lib/config.js';

const TEST_KEY = 'plexica:smoke:redis';
const TEST_VALUE = 'smoke-ok';

describe('Redis smoke test', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(config.REDIS_URL, { lazyConnect: true });
  });

  afterAll(async () => {
    await redis.del(TEST_KEY);
    redis.disconnect();
  });

  it('connects and performs SET/GET round-trip', async () => {
    await redis.set(TEST_KEY, TEST_VALUE, 'EX', 60);
    const value = await redis.get(TEST_KEY);
    expect(value).toBe(TEST_VALUE);
  });

  it('DEL removes the key', async () => {
    await redis.set(TEST_KEY, TEST_VALUE);
    await redis.del(TEST_KEY);
    const value = await redis.get(TEST_KEY);
    expect(value).toBeNull();
  });

  it('returns null for a non-existent key', async () => {
    const value = await redis.get('plexica:smoke:nonexistent-key-xyz');
    expect(value).toBeNull();
  });
});
