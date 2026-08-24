import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertPlexicaAdminConfiguration } from '../../../../e2e/keycloak/plexica-admin-client.js';

function writeManifest(): string {
  const runtime = mkdtempSync(path.join(tmpdir(), 'plexica-admin-runtime-'));
  writeFileSync(
    path.join(runtime, 'host.env'),
    'POSTGRES_HOST_URL=postgresql://user:password@127.0.0.1:32010/plexica\nREDIS_HOST_URL=redis://127.0.0.1:32011\nMINIO_HOST_URL=http://127.0.0.1:32012\nLOKI_HOST_URL=http://127.0.0.1:32013\nMAILPIT_SMTP_URL=smtp://127.0.0.1:32015\nMAILPIT_UI_BASE=http://127.0.0.1:32016\nKEYCLOAK_HOST_ADMIN_BASE=http://127.0.0.1:32000\nKEYCLOAK_PUBLIC_ISSUER_BASE=http://127.0.0.1:32000\nKEYCLOAK_ADMIN_USER=ci-admin-0123456789abcdef\nKEYCLOAK_ADMIN_PASSWORD=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nKEYCLOAK_E2E_CLIENT_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB\nCORE_API_PUBLIC_BASE=http://127.0.0.1:32001\nWEB_E2E_PUBLIC_BASE=http://127.0.0.1:32002\nADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:32003\nKAFKA_BROKERS=127.0.0.1:32014\n'
  );
  return runtime;
}

afterEach(() => {
  delete process.env.CI_RUNTIME_CONTRACT;
  delete process.env.CI_RUNTIME_DIR;
  delete process.env.PLUGIN_CREDENTIAL_PEPPER;
  delete process.env.PLAYWRIGHT_KEYCLOAK_URL;
  delete process.env.PLAYWRIGHT_LOKI_URL;
  delete process.env.PLAYWRIGHT_MAILPIT_URL;
  vi.resetModules();
});

describe('admin CI Playwright contract', () => {
  it('keeps inherited runner endpoints that match the discovered manifest', async () => {
    const runtime = writeManifest();
    process.env.CI_RUNTIME_CONTRACT = '1';
    process.env.CI_RUNTIME_DIR = runtime;
    process.env.PLUGIN_CREDENTIAL_PEPPER = '0123456789abcdef0123456789abcdef';
    process.env.PLAYWRIGHT_KEYCLOAK_URL = 'http://127.0.0.1:32000';
    process.env.PLAYWRIGHT_LOKI_URL = 'http://127.0.0.1:32013';
    const config = (await import('../../playwright.config.js')).default;
    expect(config.use?.baseURL).toBe('http://127.0.0.1:32003');
    expect(process.env.PLAYWRIGHT_KEYCLOAK_URL).toBe('http://127.0.0.1:32000');
    expect(process.env.PLAYWRIGHT_LOKI_URL).toBe('http://127.0.0.1:32013');
    rmSync(runtime, { recursive: true, force: true });
  });
  it('rejects an inherited endpoint that conflicts with the authoritative manifest', async () => {
    const runtime = writeManifest();
    process.env.CI_RUNTIME_CONTRACT = '1';
    process.env.CI_RUNTIME_DIR = runtime;
    process.env.PLUGIN_CREDENTIAL_PEPPER = '0123456789abcdef0123456789abcdef';
    process.env.PLAYWRIGHT_KEYCLOAK_URL = 'http://localhost:8080';
    await expect(import('../../playwright.config.js')).rejects.toThrow(
      /conflicts with the CI runtime manifest/
    );
    rmSync(runtime, { recursive: true, force: true });
  });
  it('rejects a final admin reconciliation that overwrites the discovered origin', () => {
    const runtime = writeManifest();
    process.env.CI_RUNTIME_CONTRACT = '1';
    process.env.CI_RUNTIME_DIR = runtime;
    const attributes = {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': 'http://127.0.0.1:32003/login',
      'client.session.idle.timeout': '3600', 'client.session.max.lifespan': '3600',
    };
    const client = { publicClient: true, standardFlowEnabled: true, implicitFlowEnabled: false,
      directAccessGrantsEnabled: false, fullScopeAllowed: false,
      redirectUris: ['http://127.0.0.1:32003/callback'], webOrigins: ['http://127.0.0.1:32003'], attributes };
    expect(() => assertPlexicaAdminConfiguration(client)).not.toThrow();
    expect(() => assertPlexicaAdminConfiguration({ ...client, webOrigins: ['http://localhost:3002'] })).toThrow('webOrigins');
    rmSync(runtime, { recursive: true, force: true });
  });
});
