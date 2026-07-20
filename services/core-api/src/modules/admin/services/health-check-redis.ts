// health-check-redis.ts
// Redis health probe — sends a PING via the shared ioredis client.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { redis } from '../../../lib/redis.js';

import { buildServiceResult, withProbeTimeout } from './health-checker.service.js';

import type { HealthServiceResult } from '../schemas/health-schemas.js';

export async function probeRedis(): Promise<HealthServiceResult> {
  const name = 'redis';
  const start = performance.now();

  try {
    await withProbeTimeout(redis.ping());
    return buildServiceResult(name, Math.round(performance.now() - start), null);
  } catch (error) {
    return buildServiceResult(name, Math.round(performance.now() - start), error);
  }
}
