// redis.ts
// Shared ioredis singleton for use across the application.
// Consumed by the rate-limit plugin and any future Redis-backed features.
// Connection errors are logged but do not crash the process — @fastify/rate-limit
// is configured to fail open when Redis is unavailable.

import { Redis } from 'ioredis';

import { config } from './config.js';
import { logger } from './logger.js';

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
