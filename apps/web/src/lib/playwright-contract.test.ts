import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  delete process.env.CI; delete process.env.CI_RUNTIME_CONTRACT; delete process.env.CI_RUNTIME_DIR;
  delete process.env.PLAYWRIGHT_KEYCLOAK_URL; delete process.env.PLAYWRIGHT_API_URL; vi.resetModules();
});

describe('CI runtime Playwright policy', () => {
  it('does not retry the independent Compose runtime contract', async () => {
    process.env.CI = 'true'; process.env.CI_RUNTIME_CONTRACT = '1';
    const { baseE2eConfig } = await import('../../../../e2e/playwright-base.js');
    expect(baseE2eConfig.retries).toBe(0);
  });
  it('uses the discovered Keycloak mapping instead of a CI localhost fallback', async () => {
    const runtime = mkdtempSync(join(tmpdir(), 'plexica-runtime-'));
    writeFileSync(runtime + '/host.env', 'POSTGRES_HOST_URL=postgresql://user:password@127.0.0.1:32010/plexica\nREDIS_HOST_URL=redis://127.0.0.1:32011\nMINIO_HOST_URL=http://127.0.0.1:32012\nLOKI_HOST_URL=http://127.0.0.1:32013\nMAILPIT_SMTP_URL=smtp://127.0.0.1:32015\nMAILPIT_UI_BASE=http://127.0.0.1:32016\nKEYCLOAK_HOST_ADMIN_BASE=http://127.0.0.1:32000\nKEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:32000\nKEYCLOAK_ADMIN_USER=ci-admin-0123456789abcdef\nKEYCLOAK_ADMIN_PASSWORD=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nKEYCLOAK_E2E_CLIENT_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\nCORE_API_PUBLIC_BASE=http://127.0.0.1:32001\nWEB_E2E_PUBLIC_BASE=http://127.0.0.1:32002\nADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:32003\nKAFKA_BROKERS=127.0.0.1:32014\n');
    process.env.CI_RUNTIME_CONTRACT = '1'; process.env.CI_RUNTIME_DIR = runtime;
    process.env.PLAYWRIGHT_KEYCLOAK_URL = 'http://localhost:8080';
    const { coreApiUrl, keycloakUrl, setFromManifest } = await import('../../../../e2e/playwright-base.js');
    expect(keycloakUrl()).toBe('http://127.0.0.1:32000');
    expect(coreApiUrl()).toBe('http://127.0.0.1:32001');
    // The manifest stays authoritative over inherited runner env values.
    expect(() => setFromManifest('PLAYWRIGHT_API_URL', 'http://127.0.0.1:32001')).not.toThrow();
    expect(() =>
      setFromManifest('PLAYWRIGHT_API_URL', 'http://localhost:3001')
    ).toThrow('conflicts with the CI runtime manifest');
    delete process.env.PLAYWRIGHT_API_URL;
    setFromManifest('PLAYWRIGHT_API_URL', 'http://127.0.0.1:32001');
    expect(process.env.PLAYWRIGHT_API_URL).toBe('http://127.0.0.1:32001');
    rmSync(runtime, { recursive: true });
  });
});
