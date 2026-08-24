import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assertExplicitLoopbackE2eTarget, getKeycloakUrl } from './admin-api.js';

const original = { ...process.env };
const endpoint = 'http://127.0.0.1:32000';
let dirs: string[] = [];

function manifest(dir: string): void {
  writeFileSync(path.join(dir, 'host.env'), [
    'POSTGRES_HOST_URL=postgresql://user:password@127.0.0.1:32001/plexica',
    'REDIS_HOST_URL=redis://127.0.0.1:32002', 'MINIO_HOST_URL=http://127.0.0.1:32003',
    'LOKI_HOST_URL=http://127.0.0.1:32004', 'MAILPIT_SMTP_URL=smtp://127.0.0.1:32005',
    'MAILPIT_UI_BASE=http://127.0.0.1:32006', `KEYCLOAK_HOST_ADMIN_BASE=${endpoint}`,
    `KEYCLOAK_PUBLIC_ISSUER_BASE=${endpoint}`, 'KEYCLOAK_ADMIN_USER=ci-admin-0123456789abcdef',
    'KEYCLOAK_ADMIN_PASSWORD=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'KEYCLOAK_E2E_CLIENT_SECRET=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    'CORE_API_PUBLIC_BASE=http://127.0.0.1:32007', 'WEB_E2E_PUBLIC_BASE=http://127.0.0.1:32008',
    'ADMIN_E2E_PUBLIC_BASE=http://127.0.0.1:32009', 'KAFKA_BROKERS=127.0.0.1:32010',
  ].join('\n'));
}

function useCiRuntimeContract(): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'plexica-admin-api-'));
  dirs.push(dir);
  manifest(dir);
  process.env = {
    ...original,
    CI_RUNTIME_CONTRACT: '1',
    CI_RUNTIME_DIR: dir,
    PLAYWRIGHT_E2E: 'true',
  };
  delete process.env['KEYCLOAK_URL'];
}

afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
  process.env = { ...original };
});

describe('Keycloak admin API target selection', () => {
  it('derives the Keycloak URL from the manifest in CI runtime contract mode', () => {
    useCiRuntimeContract();
    expect(getKeycloakUrl()).toBe(endpoint);
    expect(() => assertExplicitLoopbackE2eTarget()).not.toThrow();
  });

  it('rejects ambient KEYCLOAK_URL that disagrees with the CI manifest', () => {
    useCiRuntimeContract();
    process.env['KEYCLOAK_URL'] = 'http://localhost:8080';
    expect(getKeycloakUrl()).toBe(endpoint);
    expect(() => assertExplicitLoopbackE2eTarget()).toThrow('KEYCLOAK_HOST_ADMIN_BASE');
  });

  it('keeps localhost defaults outside the CI runtime contract', () => {
    process.env = { ...original };
    delete process.env['CI_RUNTIME_CONTRACT'];
    delete process.env['KEYCLOAK_URL'];
    delete process.env['PLAYWRIGHT_KEYCLOAK_URL'];
    expect(getKeycloakUrl()).toBe('http://localhost:8080');
    process.env['PLAYWRIGHT_KEYCLOAK_URL'] = 'http://127.0.0.1:32001';
    expect(getKeycloakUrl()).toBe('http://127.0.0.1:32001');
    process.env['KEYCLOAK_URL'] = 'http://127.0.0.1:32002';
    expect(getKeycloakUrl()).toBe('http://127.0.0.1:32002');
    process.env['PLAYWRIGHT_E2E'] = 'true';
    expect(() => assertExplicitLoopbackE2eTarget()).not.toThrow();
  });

  it('accepts loopback targets when E2E provisioning is explicit', () => {
    process.env = { ...original, PLAYWRIGHT_E2E: 'true' };
    delete process.env['CI_RUNTIME_CONTRACT'];
    for (const url of ['http://127.0.0.1:8080', 'http://localhost:8080']) {
      process.env['KEYCLOAK_URL'] = url;
      expect(() => assertExplicitLoopbackE2eTarget()).not.toThrow();
    }
  });

  it('rejects external hosts and missing E2E opt-in', () => {
    process.env = {
      ...original,
      PLAYWRIGHT_E2E: 'true',
      KEYCLOAK_URL: 'http://keycloak.internal:8080',
    };
    delete process.env['CI_RUNTIME_CONTRACT'];
    expect(() => assertExplicitLoopbackE2eTarget()).toThrow('non-loopback');
    process.env = { ...original, KEYCLOAK_URL: 'http://127.0.0.1:8080' };
    delete process.env['CI_RUNTIME_CONTRACT'];
    expect(() => assertExplicitLoopbackE2eTarget()).toThrow('PLAYWRIGHT_E2E');
  });
});
