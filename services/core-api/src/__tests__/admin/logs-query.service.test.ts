// logs-query.service.test.ts
// Unit tests for the LogQL construction logic in logs-query.service (S5-A01).
//
// No real Loki connection: global fetch is mocked so we can inspect the
// `query` URL search param that the service builds. The config module is
// mocked so LOKI_URL is set (the service short-circuits with 503 when it is
// empty). Zod validation is exercised directly against LogsQuerySchema.
//
// vi.hoisted is used for the mock objects so they exist when the hoisted
// vi.mock factories execute (the integration project runs with isolate:false).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: { LOKI_URL: 'http://loki:3100' },
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../lib/config.js', () => ({ config: mocks.config }));
vi.mock('../../lib/logger.js', () => ({ logger: mocks.logger }));

import { queryLogs } from '../../modules/admin/services/logs-query.service.js';
import { LogsQuerySchema } from '../../modules/admin/schemas/logs-schemas.js';

const baseOptions = { limit: 100 };

function makeLokiResponse(result: unknown = []): Response {
  return {
    ok: true,
    json: async () => ({
      status: 'success',
      data: { resultType: 'streams', result },
    }),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LogsQuerySchema validation', () => {
  it('accepts empty filters', () => {
    const res = LogsQuerySchema.safeParse({ limit: 100 });
    expect(res.success).toBe(true);
  });

  it('accepts a valid tenant slug', () => {
    const res = LogsQuerySchema.safeParse({ tenant: 'acme', limit: 100 });
    expect(res.success).toBe(true);
  });

  it('rejects a tenant slug with special characters', () => {
    const res = LogsQuerySchema.safeParse({ tenant: 'acme;evil', limit: 100 });
    expect(res.success).toBe(false);
  });

  it('rejects a tenant slug with uppercase letters', () => {
    const res = LogsQuerySchema.safeParse({ tenant: 'Acme', limit: 100 });
    expect(res.success).toBe(false);
  });

  it('accepts a valid level', () => {
    const res = LogsQuerySchema.safeParse({ level: 'error', limit: 100 });
    expect(res.success).toBe(true);
  });

  it('rejects an invalid level', () => {
    const res = LogsQuerySchema.safeParse({ level: 'fatal', limit: 100 });
    expect(res.success).toBe(false);
  });
});

describe('queryLogs — LogQL construction', () => {
  it('builds the base selector when no filters are set', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(makeLokiResponse() as never);
    await queryLogs({} as never, baseOptions);
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('query')).toBe('{app="plexica-core-api"}');
    expect(url.searchParams.get('direction')).toBe('backward');
  });

  it('parses JSON and compares the tenant exactly', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(makeLokiResponse() as never);
    await queryLogs({} as never, { tenant: 'acme', limit: 100 });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('query')).toBe('{app="plexica-core-api"} | json | tenant = "acme"');
  });

  it('uses pino-loki bounded level labels', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(makeLokiResponse() as never);
    await queryLogs({} as never, { level: 'error', limit: 100 });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('query')).toBe('{app="plexica-core-api",level="error"}');
  });

  it('combines tenant and level filters', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(makeLokiResponse() as never);
    await queryLogs({} as never, { tenant: 'acme', level: 'warn', limit: 50 });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('query')).toBe(
      '{app="plexica-core-api",level="warning"} | json | tenant = "acme"'
    );
  });

  it('rejects an unvalidated tenant before contacting Loki', async () => {
    await expect(
      queryLogs({} as never, { tenant: 'acme" | line_format "attack', limit: 100 })
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards start/end and limit as query params', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(makeLokiResponse() as never);
    await queryLogs({} as never, {
      ...baseOptions,
      start: '2026-01-01T00:00:00Z',
      end: '2026-01-01T01:00:00Z',
    });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.get('limit')).toBe('100');
    expect(url.searchParams.get('start')).toBe('1767225600000000000');
    expect(url.searchParams.get('end')).toBe('1767229200000000000');
  });

  it('normalizes numeric Pino and Loki warning levels', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeLokiResponse([
        {
          stream: { level: 'warning' },
          values: [
            ['1767225600000000000', JSON.stringify({ level: 40, tenant: 'acme', msg: 'warn' })],
          ],
        },
        {
          stream: { level: 'info' },
          values: [
            ['1767225601000000000', JSON.stringify({ level: 30, tenant: 'acme', msg: 'info' })],
          ],
        },
      ]) as never
    );

    const result = await queryLogs({} as never, baseOptions);
    expect(result.logs.map(({ level, message }) => ({ level, message }))).toEqual([
      { level: 'info', message: 'info' },
      { level: 'warn', message: 'warn' },
    ]);
  });
});

describe('queryLogs — timeout handling', () => {
  it('maps a fetch TimeoutError to LOG_QUERY_TIMEOUT (503)', async () => {
    const timeoutErr = new DOMException('Aborted', 'TimeoutError');
    vi.mocked(fetch).mockRejectedValue(timeoutErr as never);
    await expect(queryLogs({} as never, baseOptions)).rejects.toMatchObject({
      statusCode: 503,
      code: 'LOG_QUERY_TIMEOUT',
    });
  });

  it('passes an AbortSignal to fetch (timeout guard)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(makeLokiResponse() as never);
    await queryLogs({} as never, baseOptions);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
