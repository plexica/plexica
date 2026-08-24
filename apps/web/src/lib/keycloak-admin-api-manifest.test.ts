import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAdminToken } from '../../../../e2e/keycloak/admin-api.js';

const original = { ...process.env };
const endpoint = 'http://127.0.0.1:32000';

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

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...original };
});

describe('CI Keycloak admin API', () => {
  it('uses current project manifest credentials instead of ambient defaults', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'plexica-admin-api-'));
    let options: RequestInit | undefined;
    try {
      manifest(dir);
      process.env = { ...original, CI_RUNTIME_CONTRACT: '1', CI_RUNTIME_DIR: dir, PLAYWRIGHT_E2E: 'true' };
      delete process.env['KEYCLOAK_URL'];
      vi.stubGlobal('fetch', async (_url: string, input: RequestInit) => {
        options = input;
        return new Response(JSON.stringify({ access_token: 'token' }));
      });

      await expect(getAdminToken()).resolves.toBe('token');
      expect(new URLSearchParams(options?.body as string).get('username')).toBe('ci-admin-0123456789abcdef');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
