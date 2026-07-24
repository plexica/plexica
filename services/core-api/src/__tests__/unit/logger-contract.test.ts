import pino from 'pino';
import { describe, expect, it } from 'vitest';

import {
  LOGGER_REDACT_PATHS,
  LOKI_APP_LABEL,
  normalizeLogLevel,
} from '../../lib/logging-contract.js';

describe('logger to Loki contract', () => {
  it('uses the canonical bounded app label and normalizes transport levels', () => {
    expect(LOKI_APP_LABEL).toBe('plexica-core-api');
    expect(normalizeLogLevel(30)).toBe('info');
    expect(normalizeLogLevel(40)).toBe('warn');
    expect(normalizeLogLevel('warning')).toBe('warn');
    expect(normalizeLogLevel('critical')).toBe('error');
  });

  it('redacts recipients, nested auth secrets, and domain payloads', () => {
    let output = '';
    const testLogger = pino(
      {
        redact: { paths: [...LOGGER_REDACT_PATHS], censor: '[REDACTED]' },
      },
      {
        write: (chunk: string) => {
          output += chunk;
        },
      }
    );

    testLogger.info(
      {
        tenant: 'safe-tenant',
        to: 'recipient@example.test',
        request: {
          auth: { token: 'nested-token', secret: 'nested-secret' },
          payload: { customer: 'domain-data' },
        },
        req: { headers: { authorization: 'Bearer token', cookie: 'session=value' } },
      },
      'safe message'
    );

    expect(output).toContain('safe-tenant');
    expect(output).not.toContain('recipient@example.test');
    expect(output).not.toContain('nested-token');
    expect(output).not.toContain('nested-secret');
    expect(output).not.toContain('domain-data');
    expect(output).not.toContain('session=value');
  });
});
