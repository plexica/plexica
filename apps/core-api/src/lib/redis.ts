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
  console.log('✅ Redis client connected');
});

redis.on('error', (err) => {
  console.error('❌ Redis client error:', err);
});

redis.on('close', () => {
  console.log('🔌 Redis client connection closed');
});

// Graceful shutdown
process.on('beforeExit', async () => {
  await redis.quit();
});

export default redis;
