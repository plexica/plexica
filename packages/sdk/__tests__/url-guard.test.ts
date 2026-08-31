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

  it('allows http to single-label internal service names (Docker/K8s)', () => {
    // The E2E plugin sidecar reaches the core as "core-api-e2e" over the
    // isolated container network — not exposed cleartext.
    expect(() => assertSecureApiUrl('http://core-api-e2e:3001')).not.toThrow();
    expect(() => assertSecureApiUrl('http://core-api:3001')).not.toThrow();
  });

  it('rejects http to public hosts', () => {
    for (const url of ['http://api.plexica.dev', 'http://10.0.0.5:3001', 'http://192.168.1.10']) {
      expect(() => assertSecureApiUrl(url)).toThrow(/CWE-319/);
    }
  });
});