import { describe, expect, it } from 'vitest';

import { buildPluginDatabaseUrl } from '../../modules/plugin/services/plugin-db-credentials.js';

const SOURCE =
  'postgresql://admin:platform-secret@db.internal:5432/plexica?sslmode=require&sslcert=%2Fprivileged.crt&sslkey=%2Fprivileged.key&options=-c%20role%3Dsuperuser&unknown=value';

describe('plugin database transport URL policy', () => {
  it('keeps only restricted credentials, search path, and verified TLS parameters', () => {
    const result = new URL(
      buildPluginDatabaseUrl(SOURCE, 'plugin_role', 'plugin-secret', 'tenant_acme', {
        nodeEnv: 'production',
        sslMode: 'verify-full',
        rootCertPath: '/run/secrets/postgres-ca.crt',
      })
    );
    expect(result.username).toBe('plugin_role');
    expect(result.password).toBe('plugin-secret');
    expect([...result.searchParams.keys()]).toEqual(['options', 'sslmode', 'sslrootcert']);
    expect(result.searchParams.get('options')).toBe('-c search_path=tenant_acme');
    expect(result.searchParams.get('sslmode')).toBe('verify-full');
    expect(result.searchParams.get('sslrootcert')).toBe('/run/secrets/postgres-ca.crt');
    expect(result.href).not.toContain('platform-secret');
    expect(result.href).not.toContain('sslcert');
    expect(result.href).not.toContain('sslkey');
    expect(result.href).not.toContain('superuser');
  });

  it.each([
    { nodeEnv: 'production', sslMode: 'disable', rootCertPath: '/ca.crt' },
    { nodeEnv: 'production', sslMode: 'verify-full', rootCertPath: 'relative.crt' },
    { nodeEnv: 'production', sslMode: 'verify-full' },
    { nodeEnv: 'development', sslMode: 'verify-full', rootCertPath: '/ca.crt' },
  ] as const)('rejects unsafe transport policy %#', (policy) => {
    expect(() =>
      buildPluginDatabaseUrl(SOURCE, 'plugin_role', 'secret', 'tenant_acme', policy)
    ).toThrow();
  });

  it('requires explicit disable for development', () => {
    const result = new URL(
      buildPluginDatabaseUrl(SOURCE, 'plugin_role', 'secret', 'tenant_acme', {
        nodeEnv: 'development',
        sslMode: 'disable',
      })
    );
    expect([...result.searchParams.keys()]).toEqual(['options', 'sslmode']);
    expect(result.searchParams.get('sslmode')).toBe('disable');
  });
});
