import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../lib/config.js';
import { pluginRuntimeScope } from '../../modules/plugin/services/plugin-runtime-scope.js';

const base = {
  NODE_ENV: 'test', PLUGIN_DB_SSL_MODE: 'disable', DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
  KEYCLOAK_URL: 'http://keycloak:8080', KEYCLOAK_ADMIN_USER: 'admin', KEYCLOAK_ADMIN_PASSWORD: 'password',
  REDIS_URL: 'redis://redis:6379', MINIO_ENDPOINT: 'http://minio:9000', MINIO_ACCESS_KEY: 'x',
  MINIO_SECRET_KEY: 'x', KAFKA_BROKERS: 'redpanda:9092', PLUGIN_CORE_API_URL: 'http://core-api-e2e:3001',
  PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope('plexica-ci-contract-123456'), PLUGIN_DOCKER_NETWORK: 'plexica-ci-contract-123456_default',
  PLUGIN_DOCKER_HOST: 'http://plugin-docker-proxy:2375',
  CI_RUNTIME_PROJECT: 'plexica-ci-contract-123456',
  CI_RUNTIME_CONTRACT: '1', KEYCLOAK_PUBLIC_ISSUER_BASE: 'http://127.0.0.1:32000',
  KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: 'http://keycloak:8080',
};

describe('CI Keycloak direction', () => {
  it('accepts public issuer with DNS-only Core backchannels', () => {
    expect(parseConfig(base).KEYCLOAK_PUBLIC_ISSUER_BASE).toBe('http://127.0.0.1:32000');
  });
  it('rejects a host loopback URL for Core JWKS calls', () => {
    expect(() => parseConfig({ ...base, KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: 'http://127.0.0.1:32000' })).toThrow('JWKS');
  });
  it('rejects a host-admin endpoint inside Core even though Zod strips unknown keys', () => {
    expect(() => parseConfig({ ...base, KEYCLOAK_HOST_ADMIN_BASE: 'http://127.0.0.1:32000' })).toThrow('must not receive');
  });
  it('rejects a self-consistent foreign plugin scope and network', () => {
    expect(() => parseConfig({
      ...base,
      PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope('plexica-ci-foreign-123456'),
      PLUGIN_DOCKER_NETWORK: 'plexica-ci-foreign-123456_default',
    })).toThrow('immutable project ID');
  });
  it('rejects direct Docker access outside the private control proxy', () => {
    expect(() => parseConfig({ ...base, PLUGIN_DOCKER_HOST: 'http://docker:2375' })).toThrow('Docker control');
  });
  it('maps a long immutable project to a bounded deterministic plugin scope', () => {
    const project = 'plexica-ci-contract-123456789012345678901234567';
    const scope = pluginRuntimeScope(project);
    expect(scope).toHaveLength(31);
    expect(parseConfig({ ...base, CI_RUNTIME_PROJECT: project, PLUGIN_RUNTIME_SCOPE: scope, PLUGIN_DOCKER_NETWORK: `${project}_default` }).PLUGIN_RUNTIME_SCOPE).toBe(scope);
  });
  it.each(['http://localhost:32000', 'http://[::1]:32000'])('rejects non-inspected issuer %s', (issuer) => {
    expect(() => parseConfig({ ...base, KEYCLOAK_PUBLIC_ISSUER_BASE: issuer })).toThrow('loopback');
  });
});
