import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ciRuntimeManifest } from '../../../../e2e/ci-runtime-manifest.js';

const CREDENTIALS: Record<string, string> = {
  KEYCLOAK_ADMIN_USER: 'ci-admin-abcdef0123456789',
  KEYCLOAK_ADMIN_PASSWORD: 'ci-admin-fedcba9876543210',
  KEYCLOAK_E2E_CLIENT_SECRET: 'ci-admin-0123456789abcdef',
};

function manifestEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const urls: Record<string, string> = {
    POSTGRES_HOST_URL: 'postgresql://127.0.0.1:5432/postgres',
    REDIS_HOST_URL: 'redis://127.0.0.1:6379',
    MINIO_HOST_URL: 'http://127.0.0.1:9000',
    LOKI_HOST_URL: 'http://127.0.0.1:3100',
    MAILPIT_SMTP_URL: 'smtp://127.0.0.1:1025',
    MAILPIT_UI_BASE: 'http://127.0.0.1:8025',
    KEYCLOAK_HOST_ADMIN_BASE: 'http://127.0.0.1:30000',
    KEYCLOAK_PUBLIC_ISSUER_BASE: 'http://127.0.0.1:30000',
    CORE_API_PUBLIC_BASE: 'http://127.0.0.1:3001',
    WEB_E2E_PUBLIC_BASE: 'http://127.0.0.1:3002',
    ADMIN_E2E_PUBLIC_BASE: 'http://127.0.0.1:3003',
  };
  return {
    ...urls,
    ...CREDENTIALS,
    KAFKA_BROKERS: '127.0.0.1:9092',
    ...overrides,
  };
}

function writeManifest(values: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ci-runtime-manifest-test-'));
  writeFileSync(
    path.join(dir, 'host.env'),
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')
  );
  return dir;
}

describe('CI runtime host manifest URL contract', () => {
  afterEach(() => vi.unstubAllEnvs());

  function runWith(values: Record<string, string>) {
    vi.stubEnv('CI_RUNTIME_CONTRACT', '1');
    vi.stubEnv('CI_RUNTIME_DIR', writeManifest(values));
    return () => ciRuntimeManifest();
  }

  it('accepts a fully compliant 127.0.0.1 manifest with explicit ports', () => {
    const manifest = runWith(manifestEnv())();
    expect(manifest.CORE_API_PUBLIC_BASE).toBe('http://127.0.0.1:3001');
  });

  it.each([
    ['localhost', 'http://localhost:3001'],
    ['::1', 'http://[::1]:3001'],
    ['DNS name', 'http://core-api-e2e:3001'],
    ['portless URL', 'http://127.0.0.1'],
    ['malformed garbage', 'not-a-url'],
  ])('rejects %s in a URL-valued key', (_label, value) => {
    expect(runWith(manifestEnv({ CORE_API_PUBLIC_BASE: value }))).toThrow(
      'Invalid CI host manifest entry CORE_API_PUBLIC_BASE'
    );
  });
});
