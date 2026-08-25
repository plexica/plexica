import { createApiClient } from '@plexica/auth/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseRuntimeEndpoints } from './runtime-endpoints.js';

const VALID = { apiBase: '', keycloakBase: 'http://127.0.0.1:30000' };

describe('web CI runtime endpoints', () => {
  it('uses an empty same-origin API base in CI contract mode', () => {
    expect(parseRuntimeEndpoints(VALID, true)?.apiBase).toBe('');
  });
  it('rejects a prefix that would create /api/api paths in CI mode', () => {
    expect(() => parseRuntimeEndpoints({ ...VALID, apiBase: '/api' }, true)).toThrow();
  });
  it('fails closed when the CI runtime projection is missing', () => {
    expect(() => parseRuntimeEndpoints(undefined, true)).toThrow('required');
  });
  it.each([
    undefined,
    '/api',
    'http://core-api-e2e:3001',
    'http://127.0.0.1:3001',
    'http://host.docker.internal:3001',
  ])('rejects unsafe CI API base %j', (apiBase) => {
    expect(() => parseRuntimeEndpoints({ ...VALID, apiBase }, true)).toThrow();
  });
  it.each([
    'https://127.0.0.1:30000',
    'http://localhost:30000',
    'http://127.0.0.1:30000/realm',
    'http://user@127.0.0.1:30000',
  ])('rejects unsafe Keycloak base %s', (keycloakBase) => {
    expect(() => parseRuntimeEndpoints({ apiBase: '', keycloakBase }, true)).toThrow();
  });
  it('ignores stale runtime configuration outside CI instead of white-screening', () => {
    const staleConfigs = [
      undefined,
      VALID,
      { ...VALID, apiBase: '/api' },
      { ...VALID, keycloakBase: 'http://localhost:30000' },
      { apiBase: '' },
    ];
    for (const config of staleConfigs) {
      expect(parseRuntimeEndpoints(config, false)).toBeUndefined();
    }
  });
  it('builds ordinary and plugin requests at the same origin without a doubled API path', async () => {
    const requests: Array<[string, string]> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url, init) => {
        requests.push([String(url), init?.method ?? 'GET']);
        return Promise.resolve(
          new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        );
      })
    );
    const endpoints = parseRuntimeEndpoints(VALID, true);
    if (!endpoints) throw new Error('Expected CI runtime endpoints');
    const client = createApiClient({
      baseUrl: endpoints.apiBase,
      getTokens: () => ({ accessToken: null, refreshToken: null }),
      refreshTokens: async () => undefined,
      onSessionExpired: () => undefined,
    });
    await client.get('/api/v1/health?contract=ordinary');
    await client.post('/api/v1/plugins/123/proxy/health?contract=plugin', {});
    expect(requests).toEqual([
      ['/api/v1/health?contract=ordinary', 'GET'],
      ['/api/v1/plugins/123/proxy/health?contract=plugin', 'POST'],
    ]);
  });
});

afterEach(() => vi.unstubAllGlobals());
