// logger.ts
// Structured Pino logger. No console.log allowed in production code.

import pino from 'pino';

import { config } from './config.js';

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    config.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  // Never log PII (Constitution security rule)
  redact: {
    paths: ['email', 'password', 'token', 'secret', 'credential'],
    censor: '[REDACTED]',
  },
});
