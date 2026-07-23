// Contract between the core Pino producer, pino-loki, and admin log queries.
// Only bounded infrastructure values are labels. Tenant remains structured JSON
// so tenant count cannot create unbounded Loki streams.

import { SLUG_REGEX } from './tenant-schema-helpers.js';

export const LOKI_APP_LABEL = 'plexica-core-api';
export const LOG_TENANT_SLUG_RE = SLUG_REGEX;

export const ADMIN_LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type AdminLogLevel = (typeof ADMIN_LOG_LEVELS)[number];

export const LOKI_LEVEL_BY_ADMIN_LEVEL: Record<AdminLogLevel, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warning',
  error: 'error',
};

export const LOGGER_REDACT_PATHS = [
  'email',
  '*.email',
  '*.*.email',
  'adminEmail',
  '*.adminEmail',
  'to',
  '*.to',
  '*.*.to',
  'recipient',
  '*.recipient',
  'password',
  '*.password',
  '*.*.password',
  'token',
  '*.token',
  '*.*.token',
  '*.*.*.token',
  'secret',
  '*.secret',
  '*.*.secret',
  '*.*.*.secret',
  'credential',
  '*.credential',
  '*.*.credential',
  'credentials',
  '*.credentials',
  '*.*.credentials',
  'auth',
  '*.auth',
  '*.*.auth',
  'authorization',
  '*.authorization',
  '*.*.authorization',
  '*.*.*.authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'payload',
  '*.payload',
  '*.*.payload',
] as const;

export function normalizeLogLevel(value: unknown): AdminLogLevel | 'unknown' {
  if (typeof value === 'number') {
    if (value === 10 || value === 20) return 'debug';
    if (value === 30) return 'info';
    if (value === 40) return 'warn';
    if (value >= 50) return 'error';
  }
  if (value === 'debug' || value === 'info' || value === 'error') return value;
  if (value === 'warn' || value === 'warning') return 'warn';
  if (value === 'fatal' || value === 'critical') return 'error';
  return 'unknown';
}
