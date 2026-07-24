import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../lib/config.js';

const BASE_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/plexica',
  KEYCLOAK_URL: 'http://localhost:8080',
  KEYCLOAK_ADMIN_USER: 'admin',
  KEYCLOAK_ADMIN_PASSWORD: 'password',
  REDIS_URL: 'redis://localhost:6379',
  MINIO_ENDPOINT: 'http://localhost:9000',
  MINIO_ACCESS_KEY: 'access',
  MINIO_SECRET_KEY: 'secret',
  KAFKA_BROKERS: 'localhost:19092',
};

describe('security configuration', () => {
  it('uses the architecture-defined API audience', () => {
    const parsed = parseConfig({ ...BASE_ENV, NODE_ENV: 'test', PLUGIN_DB_SSL_MODE: 'disable' });
    expect(parsed.KEYCLOAK_API_AUDIENCE).toBe('plexica-api');
  });

  it('requires explicit disabled plugin DB TLS outside production', () => {
    expect(() => parseConfig({ ...BASE_ENV, NODE_ENV: 'development' })).toThrow(
      'PLUGIN_DB_SSL_MODE'
    );
  });

  it('fails production startup without credential, encryption, and TLS material', () => {
    expect(() =>
      parseConfig({
        ...BASE_ENV,
        NODE_ENV: 'production',
        PLUGIN_DB_SSL_MODE: 'disable',
        EVENT_KEY_ENCRYPTION_KEY: 'A'.repeat(43),
      })
    ).toThrow(/PLUGIN_CREDENTIAL_PEPPER|PLUGIN_DB_ENCRYPTION_KEY|PLUGIN_DB_SSL_MODE/);
  });

  it('accepts production only with verify-full and an absolute mounted CA file', () => {
    const parsed = parseConfig({
      ...BASE_ENV,
      NODE_ENV: 'production',
      EVENT_KEY_ENCRYPTION_KEY: 'A'.repeat(43),
      PLUGIN_CREDENTIAL_PEPPER: 'production-pepper-with-at-least-thirty-two-bytes',
      PLUGIN_DB_ENCRYPTION_KEY: 'a'.repeat(64),
      PLUGIN_DB_SSL_MODE: 'verify-full',
      PLUGIN_DB_SSL_ROOT_CERT_PATH: '/etc/ssl/certs/ca-certificates.crt',
    });
    expect(parsed.PLUGIN_DB_SSL_MODE).toBe('verify-full');
  });
});
