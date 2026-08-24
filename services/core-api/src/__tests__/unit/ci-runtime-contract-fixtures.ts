// Shared two-mode fixtures for the CI runtime contract unit tests.
// Container mode: Core runs inside the Compose network (DNS-only backchannels
// plus the plugin control-plane trio). Host mode: provisioning CLIs consume
// only runner-loopback manifest endpoints exported from host.env; plugin/DNS
// variables are absent.
import { pluginRuntimeScope } from '../../modules/plugin/services/plugin-runtime-scope.js';

export const contractSecrets = {
  NODE_ENV: 'test',
  PLUGIN_DB_SSL_MODE: 'disable',
  KEYCLOAK_ADMIN_USER: 'admin',
  KEYCLOAK_ADMIN_PASSWORD: 'password',
  MINIO_ACCESS_KEY: 'x',
  MINIO_SECRET_KEY: 'x',
  CI_RUNTIME_CONTRACT: '1',
};

export const contractProject = 'plexica-ci-contract-123456';

export const containerBase = {
  ...contractSecrets,
  DATABASE_URL: 'postgresql://x:x@postgres:5432/x',
  KEYCLOAK_URL: 'http://keycloak:8080',
  KEYCLOAK_PUBLIC_ISSUER_BASE: 'http://127.0.0.1:32000',
  KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: 'http://keycloak:8080',
  REDIS_URL: 'redis://redis:6379',
  MINIO_ENDPOINT: 'http://minio:9000',
  KAFKA_BROKERS: 'redpanda:9092',
  PLUGIN_CORE_API_URL: 'http://core-api-e2e:3001',
  PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope(contractProject),
  PLUGIN_DOCKER_NETWORK: `${contractProject}_default`,
  PLUGIN_DOCKER_HOST: 'http://plugin-docker-proxy:2375',
  CI_RUNTIME_PROJECT: contractProject,
  CI_RUNTIME_CONTRACT_CONTAINER: '1',
};

export const hostBase = {
  ...contractSecrets,
  DATABASE_URL: 'postgresql://x:x@127.0.0.1:5432/x',
  KEYCLOAK_URL: 'http://127.0.0.1:32000',
  KEYCLOAK_PUBLIC_ISSUER_BASE: 'http://127.0.0.1:32000',
  KEYCLOAK_HOST_ADMIN_BASE: 'http://127.0.0.1:32000',
  REDIS_URL: 'redis://127.0.0.1:6379',
  MINIO_ENDPOINT: 'http://127.0.0.1:9000',
  KAFKA_BROKERS: '127.0.0.1:9092',
};
