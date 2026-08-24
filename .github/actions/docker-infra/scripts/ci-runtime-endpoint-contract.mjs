#!/usr/bin/env node

import { URL } from 'node:url';

const [kind, key, value] = process.argv.slice(2);
const containerHosts = {
  DATABASE_URL: ['postgres', '5432'],
  KEYCLOAK_URL: ['keycloak', '8080'],
  KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: ['keycloak', '8080'],
  REDIS_URL: ['redis', '6379'],
  MINIO_ENDPOINT: ['minio', '9000'],
  LOKI_URL: ['loki', '3100'],
  PLUGIN_CORE_API_URL: ['core-api-e2e', '3001'],
};
const hostProtocols = {
  POSTGRES_HOST_URL: 'postgresql:',
  REDIS_HOST_URL: 'redis:',
  MINIO_HOST_URL: 'http:',
  LOKI_HOST_URL: 'http:',
  MAILPIT_SMTP_URL: 'smtp:',
  MAILPIT_UI_BASE: 'http:',
  KEYCLOAK_HOST_ADMIN_BASE: 'http:',
  KEYCLOAK_PUBLIC_ISSUER_BASE: 'http:',
  CORE_API_PUBLIC_BASE: 'http:',
  WEB_E2E_PUBLIC_BASE: 'http:',
  ADMIN_E2E_PUBLIC_BASE: 'http:',
};
const containerScalars = {
  KAFKA_BROKERS: (input) => input === 'redpanda:9092',
  PLUGIN_DB_SSL_MODE: (input) => input === 'verify-full',
  PLUGIN_RUNTIME_SCOPE: (input) => /^ci-[a-f0-9]{28}$/.test(input),
  PLUGIN_DOCKER_NETWORK: (input) => /^plexica-ci-[a-z0-9][a-z0-9-]{5,43}_default$/.test(input),
  KEYCLOAK_ADMIN_USER: (input) => /^[^\s]+$/.test(input),
  KEYCLOAK_ADMIN_PASSWORD: (input) => input.length > 0,
  KEYCLOAK_E2E_CLIENT_SECRET: (input) => /^[A-Za-z0-9_-]{43}$/.test(input),
  MINIO_ACCESS_KEY: (input) => /^[^\s]+$/.test(input),
  MINIO_SECRET_KEY: (input) => input.length > 0,
  EVENT_KEY_ENCRYPTION_KEY: (input) => /^[A-Za-z0-9_-]{43}$/.test(input),
  PLUGIN_DB_ENCRYPTION_KEY: (input) => /^[a-f0-9]{64}$/i.test(input),
  PLUGIN_CREDENTIAL_PEPPER: (input) => input.length >= 32 && !/\s/.test(input),
  SMTP_HOST: (input) => input === 'mailpit',
  SMTP_PORT: (input) => input === '1025',
  NODE_ENV: (input) => input === 'production',
  PLUGIN_DB_SSL_ROOT_CERT_PATH: (input) => input === '/etc/ssl/certs/ca-certificates.crt',
};

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function asUrl(input, scheme = '') {
  try {
    return new URL(scheme ? `${scheme}${input}` : input);
  } catch {
    fail(`Invalid ${key} URL`);
  }
}

function validateHost() {
  if (['KEYCLOAK_ADMIN_USER', 'KEYCLOAK_ADMIN_PASSWORD', 'KEYCLOAK_E2E_CLIENT_SECRET'].includes(key)) {
    if (!containerScalars[key](value)) fail(`${key} has an invalid CI credential value`);
    return;
  }
  if (key === 'KAFKA_BROKERS') {
    if (!/^127\.0\.0\.1:[1-9][0-9]*$/.test(value)) fail('KAFKA_BROKERS must be an inspected loopback listener');
    return;
  }
  if (!hostProtocols[key]) fail(`${key} is not an approved host endpoint`);
  const url = asUrl(value);
  const credentialsAllowed = key === 'POSTGRES_HOST_URL' && url.protocol === 'postgresql:';
  if (
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    (!credentialsAllowed && (url.username || url.password))
  ) {
    fail(`${key} must be an inspected 127.0.0.1 endpoint`);
  }
  if (credentialsAllowed && (!url.username || !url.password || url.pathname === '/')) {
    fail('POSTGRES_HOST_URL requires database credentials and a database name');
  }
  if (hostProtocols[key] !== url.protocol) {
    fail(`${key} has an unsupported host protocol`);
  }
}

function validateContainer() {
  if (containerScalars[key]) {
    if (!containerScalars[key](value)) fail(`${key} has an invalid CI scalar value`);
    return;
  }
  const expected = containerHosts[key];
  if (!expected) fail(`${key} is not an approved container endpoint`);
  const url = asUrl(value);
  if (url.hostname !== expected[0] || url.port !== expected[1] || url.username === 'host-gateway') {
    fail(`${key} must use its approved Compose DNS endpoint`);
  }
  if (/localhost|host\.docker\.internal|gateway|^\d|\[/.test(url.hostname)) {
    fail(`${key} must not use a host or IP endpoint`);
  }
}

if (!kind || !key || value === undefined) fail('Usage: endpoint-contract host|container KEY VALUE');
if (kind === 'host') validateHost();
else if (kind === 'container') validateContainer();
else fail('Endpoint contract kind must be host or container');
