import { describe, expect, it } from 'vitest';

import { parseRuntimeEndpoints } from './runtime-endpoints.js';

describe('admin CI runtime endpoints', () => {
  it('accepts only the empty browser API base', () => {
    expect(parseRuntimeEndpoints({ apiBase: '', keycloakBase: 'http://127.0.0.1:30000' })?.apiBase).toBe('');
  });
  it('rejects a browser Core URL', () => {
    expect(() => parseRuntimeEndpoints({ apiBase: 'http://core-api-e2e:3001', keycloakBase: 'http://127.0.0.1:30000' })).toThrow();
  });
});
