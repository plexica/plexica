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

  it('rejects http to single-label internal service names without an allowlist (F9)', () => {
    // A single-label hostname alone cannot authorize cleartext credential
    // transport — it must be explicitly allowlisted (CodeRabbit CWE-319).
    expect(() => assertSecureApiUrl('http://core-api-e2e:3001')).toThrow(/CWE-319/);
    expect(() => assertSecureApiUrl('http://core-api:3001')).toThrow(/CWE-319/);
  });

  it('allows http to single-label internal service names when allowlisted', () => {
    // The E2E plugin sidecar reaches the core as "core-api-e2e" over the
    // isolated container network — permitted via the explicit allowlist.
    expect(() =>
      assertSecureApiUrl('http://core-api-e2e:3001', { allowHttpHosts: ['core-api-e2e'] })
    ).not.toThrow();
    expect(() =>
      assertSecureApiUrl('http://core-api:3001', { allowHttpHosts: ['core-api'] })
    ).not.toThrow();
  });

  it('allows http to single-label internal service names when allowHttpInternal is set', () => {
    expect(() =>
      assertSecureApiUrl('http://core-api-e2e:3001', { allowHttpInternal: true })
    ).not.toThrow();
  });

  it('does not let the allowlist bypass the guard for dotted hosts or IP literals', () => {
    // The allowlist only ever applies to single-label internal service names;
    // it must NOT authorize cleartext to public hostnames or IPs.
    expect(() =>
      assertSecureApiUrl('http://api.plexica.dev', { allowHttpHosts: ['api.plexica.dev'] })
    ).toThrow(/CWE-319/);
    expect(() =>
      assertSecureApiUrl('http://10.0.0.5:3001', { allowHttpHosts: ['10.0.0.5'] })
    ).toThrow(/CWE-319/);
  });

  it('rejects http to non-loopback IP literals (CodeRabbit regression)', () => {
    // IPv4 public / private literals and a public IPv6 literal must NOT slip
    // through the dotless single-label exception.
    for (const url of [
      'http://10.0.0.5:3001',
      'http://192.168.1.10',
      'http://8.8.8.8',
      'http://[2001:4860:4860::8888]:3001',
    ]) {
      expect(() => assertSecureApiUrl(url)).toThrow(/CWE-319/);
    }
  });

  it('rejects http to public hosts', () => {
    for (const url of ['http://api.plexica.dev', 'http://10.0.0.5:3001', 'http://192.168.1.10']) {
      expect(() => assertSecureApiUrl(url)).toThrow(/CWE-319/);
    }
  });
});