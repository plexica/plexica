// Unit tests for standalone emitNotification (feature 006-05, ADR-035).
// Mirrors the emitEvent fetch-mocked pattern in sdk.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { emitNotification } = await import('../src/index.js');
const { ApiCallError } = await import('../src/errors.js');

import type { EmitNotificationInput, PluginConfig } from '../src/types.js';

const BASE_CONFIG: PluginConfig = {
  pluginId: 'crm',
  slug: 'crm',
  tenantId: 't1',
  apiUrl: 'http://localhost:3001',
};

const INPUT: EmitNotificationInput = {
  userId: 'u-1',
  type: 'contact_created',
  titleKey: 'notifications.plugin.crm.contact_created.title',
};

function ok202(overrides: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 202,
    json: () => Promise.resolve({ status: 'accepted', notificationId: 'n-123' }),
    ...overrides,
  } as unknown as Response;
}

describe('emitNotification (standalone)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prefixes the type with plugin.<slug>.', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok202());
    vi.stubGlobal('fetch', fetchMock);
    await emitNotification(BASE_CONFIG, INPUT);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe('plugin.crm.contact_created');
    expect(body.userId).toBe('u-1');
  });

  it('includes timestamp and correlationId in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok202());
    vi.stubGlobal('fetch', fetchMock);
    await emitNotification(BASE_CONFIG, INPUT);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.correlationId).toBe('string');
    expect(body.correlationId.length).toBeGreaterThan(0);
  });

  it('returns { notificationId } on a 202 accepted response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok202()));
    await expect(emitNotification(BASE_CONFIG, INPUT)).resolves.toEqual({ notificationId: 'n-123' });
  });

  it('throws ApiCallError when a 202 lacks status "accepted" (ADR-035 contract)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok202({ json: () => Promise.resolve({ notificationId: 'n-123' }) }))
    );
    await expect(emitNotification(BASE_CONFIG, INPUT)).rejects.toBeInstanceOf(ApiCallError);
  });

  it('throws ApiCallError when a 202 has a non-accepted status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        ok202({ json: () => Promise.resolve({ status: 'rejected', notificationId: 'n-123' }) })
      )
    );
    await expect(emitNotification(BASE_CONFIG, INPUT)).rejects.toBeInstanceOf(ApiCallError);
  });

  it('throws ApiCallError when notificationId is missing from a 202', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok202({ json: () => Promise.resolve({ status: 'accepted' }) }))
    );
    await expect(emitNotification(BASE_CONFIG, INPUT)).rejects.toBeInstanceOf(ApiCallError);
  });

  it('throws ApiCallError (not a raw SyntaxError) on malformed 202 JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(ok202({ json: () => Promise.reject(new SyntaxError('boom')) }))
    );
    let caught: unknown;
    try {
      await emitNotification(BASE_CONFIG, INPUT);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiCallError);
    expect(caught).not.toBeInstanceOf(SyntaxError);
  });

  it('throws ApiCallError on a 200 response (ADR-035 accepts only 202)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('queued'),
        json: () => Promise.resolve({ status: 'queued', notificationId: 'n-123' }),
      } as unknown as Response)
    );
    let caught: unknown;
    try {
      await emitNotification(BASE_CONFIG, INPUT);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiCallError);
    expect((caught as Error).message).toContain('200');
  });

  it('throws ApiCallError on a 500 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('boom'),
      } as unknown as Response)
    );
    let caught: unknown;
    try {
      await emitNotification(BASE_CONFIG, INPUT);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiCallError);
    expect((caught as Error).message).toContain('500');
  });

  it('sends the service token auth header (falls back to user JWT otherwise)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok202());
    vi.stubGlobal('fetch', fetchMock);
    await emitNotification({ ...BASE_CONFIG, serviceToken: 'svc-1' }, INPUT);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Plugin-Service-Token']).toBe('svc-1');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('throws CWE-319 guard on a cleartext non-loopback apiUrl', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      emitNotification({ ...BASE_CONFIG, apiUrl: 'http://api.plexica.dev' }, INPUT)
    ).rejects.toThrow(/CWE-319/);
  });

  it('throws CWE-319 guard on single-label http: without an allowlist (F9)', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      emitNotification({ ...BASE_CONFIG, apiUrl: 'http://core-api-e2e:3001' }, INPUT)
    ).rejects.toThrow(/CWE-319/);
  });

  it('allows single-label http: when the host is in allowHttpHosts (F9)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok202());
    vi.stubGlobal('fetch', fetchMock);
    await emitNotification(
      { ...BASE_CONFIG, apiUrl: 'http://core-api-e2e:3001', allowHttpHosts: ['core-api-e2e'] },
      INPUT
    );
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://core-api-e2e:3001/api/v1/notifications/emit');
  });

  it('resolves CORE_API_URL and PLEXICA_SERVICE_TOKEN env fallbacks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok202());
    vi.stubGlobal('fetch', fetchMock);
    const origUrl = process.env['CORE_API_URL'];
    const origTok = process.env['PLEXICA_SERVICE_TOKEN'];
    process.env['CORE_API_URL'] = 'http://core-api:3001';
    process.env['PLEXICA_SERVICE_TOKEN'] = 'svc-env';
    try {
      await emitNotification({ ...BASE_CONFIG, apiUrl: '', allowHttpHosts: ['core-api'] }, INPUT);
    } finally {
      if (origUrl === undefined) delete process.env['CORE_API_URL'];
      else process.env['CORE_API_URL'] = origUrl;
      if (origTok === undefined) delete process.env['PLEXICA_SERVICE_TOKEN'];
      else process.env['PLEXICA_SERVICE_TOKEN'] = origTok;
    }
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://core-api:3001/api/v1/notifications/emit');
    expect((init.headers as Record<string, string>)['X-Plugin-Service-Token']).toBe('svc-env');
  });
});