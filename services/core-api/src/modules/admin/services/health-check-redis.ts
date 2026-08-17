// health-check-redis.ts
// Redis health probe — sends a PING via the shared ioredis client.
// Implements: Spec 005, Feature 005-09 (S5-100)

import { redis } from '../../../lib/redis.js';

import { makeProbe, withProbeTimeout } from './health-checker.service.js';

export const probeRedis = makeProbe('redis', () => withProbeTimeout(redis.ping()));
