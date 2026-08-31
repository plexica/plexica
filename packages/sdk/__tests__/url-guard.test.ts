// Unit tests for url-guard.ts (CWE-319 guard).

import { describe, expect, it } from 'vitest';

import { assertSecureApiUrl } from '../src/url-guard.js';

describe('assertSecureApiUrl (CWE-319)', () => {
  it('allows https to any host', () => {
    expect(() => assertSecureApiUrl('https://api.plexica.dev')).not.toThrow();
  });

  it('allows http to loopback hosts', () => {
    for (const url of ['http://localhost:3001', 'http://127.0.0.1:3001', 'http://[::1]:3001']) {
      expect(() => assertSecureApiUrl(url)).not.toThrow();
    }
  });

  it('rejects http to non-loopback hosts', () => {
    for (const url of ['http://api.plexica.dev', 'http://10.0.0.5:3001', 'http://192.168.1.10']) {
      expect(() => assertSecureApiUrl(url)).toThrow(/CWE-319/);
    }
  });
});