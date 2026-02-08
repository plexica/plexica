import { Redis } from 'ioredis';
import { config } from '../config';

/**
 * Redis Client
 *
 * Singleton Redis client instance for caching and session management
 */
export const redis = new Redis({
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  // SECURITY: Enable TLS if configured
  tls: config.redisTls ? {} : undefined,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      // Only reconnect when the error contains "READONLY"
      return true;
    }
    return false;
  },
});

// Log connection status
redis.on('connect', () => {
  // Connection successful - no need to log this
});

redis.on('error', (err) => {
  console.error('Redis client error:', err);
});

redis.on('close', () => {
  // Connection closed - handle gracefully in shutdown
});

// Graceful shutdown (idempotent – safe to call after tests already quit)
let shuttingDown = false;

async function safeQuitRedis() {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    // ioredis exposes a `.status` property; skip if already closed
    const status = (redis as any).status as string | undefined;
    if (status === 'end' || status === 'close') return;

    await redis.quit();
  } catch (err) {
    // Swallow "Connection is closed" races that surface in CI / test teardown
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.toLowerCase().includes('connection is closed')) {
      console.error('Redis quit error:', msg);
    }
  }
}

process.once('beforeExit', () => void safeQuitRedis());
process.once('SIGTERM', () => void safeQuitRedis());
process.once('SIGINT', () => void safeQuitRedis());

export default redis;
