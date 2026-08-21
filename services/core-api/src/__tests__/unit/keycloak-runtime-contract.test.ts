import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../lib/config.js';

const base = {
  NODE_ENV: 'test', PLUGIN_DB_SSL_MODE: 'disable', DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  KEYCLOAK_URL: 'http://keycloak:8080', KEYCLOAK_ADMIN_USER: 'admin', KEYCLOAK_ADMIN_PASSWORD: 'password',
  REDIS_URL: 'redis://redis:6379', MINIO_ENDPOINT: 'http://minio:9000', MINIO_ACCESS_KEY: 'x',
  MINIO_SECRET_KEY: 'x', KAFKA_BROKERS: 'redpanda:9092', PLUGIN_CORE_API_URL: 'http://core-api-e2e:3001',
  PLUGIN_RUNTIME_SCOPE: 'plexica-ci-contract-123456', PLUGIN_DOCKER_NETWORK: 'plexica-ci-contract-123456_default',
  CI_RUNTIME_CONTRACT: '1', KEYCLOAK_PUBLIC_ISSUER_BASE: 'http://127.0.0.1:32000',
  KEYCLOAK_HOST_ADMIN_BASE: 'http://127.0.0.1:32000', KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: 'http://keycloak:8080',
};

describe('CI Keycloak direction', () => {
  it('accepts public issuer with DNS-only Core backchannels', () => {
    expect(parseConfig(base).KEYCLOAK_PUBLIC_ISSUER_BASE).toBe('http://127.0.0.1:32000');
  });
  it('rejects a host loopback URL for Core JWKS calls', () => {
    expect(() => parseConfig({ ...base, KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: 'http://127.0.0.1:32000' })).toThrow('JWKS');
  });
});
