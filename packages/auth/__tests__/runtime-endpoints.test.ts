import { describe, expect, it } from 'vitest';

import { parseRuntimeEndpoints } from '../src/runtime-endpoints.js';

const VALID = { apiBase: '', keycloakBase: 'http://127.0.0.1:30000' };

describe('parseRuntimeEndpoints() in CI runtime contract mode', () => {
  it('accepts the empty same-origin API base and a loopback Keycloak base', () => {
    expect(parseRuntimeEndpoints(VALID, true)).toEqual({
      apiBase: '',
      keycloakBase: 'http://127.0.0.1:30000',
    });
  });

  it('fails closed when the CI runtime projection is missing', () => {
    expect(() => parseRuntimeEndpoints(undefined, true)).toThrow('required');
  });

  it.each([
    undefined,
    '/api',
    'https://core-api.example.invalid',
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
    'http://127.0.0.1:30000?issuer=foreign',
    'http://user@127.0.0.1:30000',
    undefined,
  ])('rejects unsafe Keycloak base %j', (keycloakBase) => {
    expect(() => parseRuntimeEndpoints({ apiBase: '', keycloakBase }, true)).toThrow();
  });
});

describe('parseRuntimeEndpoints() outside the CI runtime contract', () => {
  it('ignores absent configuration instead of throwing', () => {
    expect(parseRuntimeEndpoints(undefined, false)).toBeUndefined();
    expect(parseRuntimeEndpoints(undefined)).toBeUndefined();
  });

  it('ignores stale or invalid configuration instead of throwing', () => {
    const staleConfigs = [
      VALID,
      { apiBase: 'http://core-api-e2e:3001', keycloakBase: 'http://127.0.0.1:30000' },
      { apiBase: '/api', keycloakBase: 'http://localhost:30000' },
      { apiBase: '' },
    ];
    for (const config of staleConfigs) {
      expect(parseRuntimeEndpoints(config, false)).toBeUndefined();
    }
  });
});
