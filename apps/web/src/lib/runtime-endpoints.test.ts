import { describe, expect, it } from 'vitest';

import { parseRuntimeEndpoints } from './runtime-endpoints.js';

describe('web CI runtime endpoints', () => {
  it('uses an empty same-origin API base', () => {
    expect(parseRuntimeEndpoints({ apiBase: '', keycloakBase: 'http://127.0.0.1:30000' })?.apiBase).toBe('');
  });
  it('rejects a prefix that would create /api/api paths', () => {
    expect(() => parseRuntimeEndpoints({ apiBase: '/api', keycloakBase: 'http://127.0.0.1:30000' })).toThrow();
  });
});
