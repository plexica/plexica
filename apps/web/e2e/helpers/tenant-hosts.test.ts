// tenant-hosts.test.ts
// Regression guard for live run 32834827190: under the CI runtime contract the
// admin Playwright invocation must resolve endpoints from its own keys
// (PLAYWRIGHT_ADMIN_BASE_URL / PLAYWRIGHT_CORE_API_URL) while web callers keep
// resolving the web defaults (PLAYWRIGHT_BASE_URL / PLAYWRIGHT_API_URL).

import { describe, expect, it } from 'vitest';

import { ciRuntimeTenantBase, e2eWebBase, tenantApiUrl, tenantWebUrl } from './tenant-hosts.js';

const CONTRACT_ENV_KEYS = [
  'CI_RUNTIME_CONTRACT',
  'PLAYWRIGHT_BASE_URL',
  'PLAYWRIGHT_API_URL',
  'PLAYWRIGHT_ADMIN_BASE_URL',
  'PLAYWRIGHT_CORE_API_URL',
] as const;

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function withContractEnv(env: Record<string, string | undefined>, run: () => void): void {
  const saved = new Map(CONTRACT_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(env)) setEnv(key, value);
    run();
  } finally {
    for (const [key, value] of saved) setEnv(key, value);
  }
}

describe('tenant-hosts endpoint resolution (web defaults unchanged)', () => {
  it('resolves web base and tenant URLs without env keys outside CI', () => {
    withContractEnv(
      { CI_RUNTIME_CONTRACT: undefined },
      () => {
        expect(e2eWebBase()).toBe('http://e2e.localhost:3000');
        expect(tenantWebUrl('e2e', '/login')).toBe('http://e2e.localhost:3000/login');
        expect(tenantApiUrl('e2e', '/api/me')).toBe('http://e2e.localhost:3001/api/me');
      }
    );
  });

  it('honours explicit env values over fallbacks outside CI', () => {
    withContractEnv(
      { CI_RUNTIME_CONTRACT: undefined, PLAYWRIGHT_API_URL: 'http://api.example.test:9443' },
      () => {
        expect(tenantApiUrl('e2e', '/api/me')).toBe('http://e2e.localhost:9443/api/me');
      }
    );
  });
});

describe('tenant-hosts endpoint resolution under the CI runtime contract', () => {
  it('fails fast when a required web key is missing', () => {
    withContractEnv(
      {
        CI_RUNTIME_CONTRACT: '1',
        PLAYWRIGHT_BASE_URL: undefined,
        PLAYWRIGHT_API_URL: undefined,
      },
      () => {
        expect(() => e2eWebBase()).toThrow(/PLAYWRIGHT_BASE_URL/);
        expect(() => tenantApiUrl('e2e')).toThrow(/PLAYWRIGHT_API_URL/);
      }
    );
  });

  it('resolves admin keys when passed per call', () => {
    withContractEnv(
      {
        CI_RUNTIME_CONTRACT: '1',
        PLAYWRIGHT_BASE_URL: undefined,
        PLAYWRIGHT_API_URL: undefined,
        PLAYWRIGHT_ADMIN_BASE_URL: 'http://127.0.0.1:32009',
        PLAYWRIGHT_CORE_API_URL: 'http://127.0.0.1:32001',
      },
      () => {
        expect(e2eWebBase({ baseKey: 'PLAYWRIGHT_ADMIN_BASE_URL' })).toBe(
          'http://127.0.0.1:32009'
        );
        expect(tenantWebUrl('e2e-admin', '/', { baseKey: 'PLAYWRIGHT_ADMIN_BASE_URL' })).toBe(
          'http://e2e-admin.localhost:32009/'
        );
        expect(tenantApiUrl('e2e-admin', '/api/v1/health', { apiKey: 'PLAYWRIGHT_CORE_API_URL' })).toBe(
          'http://e2e-admin.localhost:32001/api/v1/health'
        );
      }
    );
  });

  it('keeps requiring the manifest-derived key even when other keys exist', () => {
    withContractEnv(
      {
        CI_RUNTIME_CONTRACT: '1',
        PLAYWRIGHT_ADMIN_BASE_URL: 'http://127.0.0.1:32009',
        PLAYWRIGHT_API_URL: undefined,
      },
      () => {
        expect(() =>
          tenantApiUrl('e2e-admin', '/api/v1/health', { apiKey: 'PLAYWRIGHT_API_URL' })
        ).toThrow(/CI runtime requires PLAYWRIGHT_API_URL/);
      }
    );
  });

  // Live run 32841276509: serving the full web suite against the raw manifest
  // base (127.0.0.1:<port>) broke tenant routing — production builds ignore
  // `?tenant=`, so relative navigations landed on the org-error page while the
  // seeded Keycloak client origin pointed at the tenant-shaped host.
  it('derives a tenant-shaped full-suite base from the manifest loopback URL', () => {
    withContractEnv(
      { CI_RUNTIME_CONTRACT: undefined, PLAYWRIGHT_TENANT_SLUG: undefined },
      () => {
        expect(ciRuntimeTenantBase('http://127.0.0.1:32101')).toBe('http://e2e.localhost:32101');
        expect(ciRuntimeTenantBase('http://127.0.0.1:8080')).toBe('http://e2e.localhost:8080');
      }
    );
  });

  it('honours PLAYWRIGHT_TENANT_SLUG when shaping the contract base', () => {
    withContractEnv(
      { CI_RUNTIME_CONTRACT: undefined, PLAYWRIGHT_TENANT_SLUG: 'acme' },
      () => {
        expect(ciRuntimeTenantBase('http://127.0.0.1:33001')).toBe('http://acme.localhost:33001');
      }
    );
  });

  it('rejects invalid slugs when shaping the contract base', () => {
    withContractEnv(
      { CI_RUNTIME_CONTRACT: undefined, PLAYWRIGHT_TENANT_SLUG: 'Not_Valid' },
      () => {
        expect(() => ciRuntimeTenantBase('http://127.0.0.1:33001')).toThrow(/Invalid E2E tenant slug/);
      }
    );
  });
});
