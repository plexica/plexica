// emit-rate-limit.ts
// Redis counter enforcing the plugin emission cap: 10/min per plugin per user
// (feature 006-05, ADR-035 Decision 5). Key `notif-rl:{tenantId}:{pluginSlug}:
// {userId}` with INCR + 60 s EXPIRE. Fail-open on Redis outage (ADR-012).

import { AppError } from '../../lib/app-error-base.js';
import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { redis } from '../../lib/redis.js';

import type { Redis as RedisClient } from 'ioredis';

export class RateLimitExceededError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMIT_EXCEEDED';

  constructor(message = 'Rate limit exceeded') {
    super(message);
  }
}

const WINDOW_SECONDS = 60;

export class EmitRateLimiter {
  constructor(private readonly client: RedisClient = redis) {}

  /** Throws 429 RATE_LIMIT_EXCEEDED when the plugin exceeds 10/min for a user. */
  async assert(tenantId: string, pluginSlug: string, userId: string): Promise<void> {
    const key = `notif-rl:${tenantId}:${pluginSlug}:${userId}`;
    let count: number;
    try {
      count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, WINDOW_SECONDS);
    } catch (error) {
      // Fail open (ADR-012): a Redis outage must not break legitimate emission.
      logger.warn(
        { code: 'NOTIF_RL_REDIS_DOWN', err: String(error) },
        'Notification emit rate limiter degraded to fail-open'
      );
      return;
    }
    if (count > config.NOTIFICATION_EMIT_RATE_LIMIT_PER_PLUGIN_USER_PER_MIN) {
      throw new RateLimitExceededError('Notification emit rate limit exceeded');
    }
  }
}

export const emitRateLimiter = new EmitRateLimiter();
