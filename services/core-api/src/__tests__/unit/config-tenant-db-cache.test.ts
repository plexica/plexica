// config-tenant-db-cache.test.ts
// Unit tests for the ADR-027 tenant DB client cache configuration
// (TENANT_DB_CACHE_MAX / TENANT_DB_CACHE_TTL_MS).

import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../lib/config.js';

const BASE_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PLUGIN_DB_SSL_MODE: 'disable',
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

describe('tenant DB cache configuration (ADR-027)', () => {
  it('applies the documented defaults when the env vars are absent', () => {
    const parsed = parseConfig({ ...BASE_ENV });
    expect(parsed.TENANT_DB_CACHE_MAX).toBe(100);
    expect(parsed.TENANT_DB_CACHE_TTL_MS).toBe(600_000);
  });

  it('coerces string env values to integers', () => {
    const parsed = parseConfig({
      ...BASE_ENV,
      TENANT_DB_CACHE_MAX: '25',
      TENANT_DB_CACHE_TTL_MS: '30000',
    });
    expect(parsed.TENANT_DB_CACHE_MAX).toBe(25);
    expect(parsed.TENANT_DB_CACHE_TTL_MS).toBe(30_000);
  });

  it('rejects a zero cap and a sub-second TTL', () => {
    expect(() => parseConfig({ ...BASE_ENV, TENANT_DB_CACHE_MAX: '0' })).toThrow(
      'TENANT_DB_CACHE_MAX'
    );
    expect(() => parseConfig({ ...BASE_ENV, TENANT_DB_CACHE_TTL_MS: '500' })).toThrow(
      'TENANT_DB_CACHE_TTL_MS'
    );
  });
});
