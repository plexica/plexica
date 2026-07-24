// redis.ts
// Shared ioredis singleton for use across the application.
// Consumed by the rate-limit plugin and any future Redis-backed features.
// Connection errors are logged but do not crash the process — @fastify/rate-limit
// is configured to fail open when Redis is unavailable.

import { Redis } from 'ioredis';

import { config } from './config.js';
import { logger } from './logger.js';

import type { Redis as RedisClient } from 'ioredis';

export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  // Silence ioredis default console output — errors surface via event listener below.
  showFriendlyErrorStack: false,
});

redis.on('error', (err: Error) => {
  logger.warn({ err }, 'Redis connection error — rate limiting will fail open');
});

export async function disconnectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connect') {
    await redis.quit();
  } else {
    redis.disconnect();
  }
}

/** Deletes every key matching the supplied patterns without using KEYS. */
export async function deleteRedisKeysByPatterns(
  client: RedisClient,
  patterns: readonly string[]
): Promise<number> {
  let deleted = 0;
  for (const pattern of new Set(patterns)) {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await client.unlink(...keys);
      }
    } while (cursor !== '0');
  }
  return deleted;
}
