/**
 * Shared Pino Logger Instance
 *
 * Provides structured logging with proper context fields.
 * Used by services that don't have access to Fastify's server.log instance.
 *
 * Constitution Article 6.3: Pino JSON Logging with standard fields
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});
