import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface CiRuntimeManifest {
  POSTGRES_HOST_URL: string;
  REDIS_HOST_URL: string;
  MINIO_HOST_URL: string;
  LOKI_HOST_URL: string;
  MAILPIT_SMTP_URL: string;
  MAILPIT_UI_BASE: string;
  KEYCLOAK_HOST_ADMIN_BASE: string;
  KEYCLOAK_PUBLIC_ISSUER_BASE: string;
  KEYCLOAK_ADMIN_USER: string;
  KEYCLOAK_ADMIN_PASSWORD: string;
  KEYCLOAK_E2E_CLIENT_SECRET: string;
  CORE_API_PUBLIC_BASE: string;
  WEB_E2E_PUBLIC_BASE: string;
  ADMIN_E2E_PUBLIC_BASE: string;
  KAFKA_BROKERS: string;
}

export function isCiRuntimeContract(): boolean {
  return process.env['CI_RUNTIME_CONTRACT'] === '1';
}

function strictLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    return (
      url.hostname === '127.0.0.1' &&
      url.port !== '' &&
      Number.isInteger(port) &&
      port > 0 &&
      port <= 65535
    );
  } catch {
    return false;
  }
}

export function ciRuntimeManifest(): CiRuntimeManifest {
  const runtime = process.env['CI_RUNTIME_DIR'];
  if (!runtime) throw new Error('CI runtime requires CI_RUNTIME_DIR host manifest');
  const values = Object.fromEntries(
    readFileSync(path.join(runtime, 'host.env'), 'utf8').split('\n').filter(Boolean).map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
  ) as Partial<CiRuntimeManifest>;
  const required = [
    'POSTGRES_HOST_URL',
    'REDIS_HOST_URL',
    'MINIO_HOST_URL',
    'LOKI_HOST_URL',
    'MAILPIT_SMTP_URL',
    'MAILPIT_UI_BASE',
    'KEYCLOAK_HOST_ADMIN_BASE',
    'KEYCLOAK_PUBLIC_ISSUER_BASE',
    'KEYCLOAK_ADMIN_USER',
    'KEYCLOAK_ADMIN_PASSWORD',
    'KEYCLOAK_E2E_CLIENT_SECRET',
    'CORE_API_PUBLIC_BASE',
    'WEB_E2E_PUBLIC_BASE',
    'ADMIN_E2E_PUBLIC_BASE',
  ] as const;
  for (const key of required) {
    const credential = ['KEYCLOAK_ADMIN_USER', 'KEYCLOAK_ADMIN_PASSWORD', 'KEYCLOAK_E2E_CLIENT_SECRET'].includes(key);
    if (
      !values[key] ||
      (credential && !/^(ci-admin-[a-f0-9]{16}|[A-Za-z0-9_-]{43})$/.test(values[key])) ||
      (!credential && !strictLoopbackUrl(values[key]))
    ) {
      throw new Error(`Invalid CI host manifest entry ${key}`);
    }
  }
  if (values.KEYCLOAK_HOST_ADMIN_BASE !== values.KEYCLOAK_PUBLIC_ISSUER_BASE) {
    throw new Error('CI Keycloak host-admin must match the public issuer');
  }
  if (!/^127\.0\.0\.1:[1-9][0-9]*$/.test(values.KAFKA_BROKERS ?? '')) {
    throw new Error('Invalid CI host manifest entry KAFKA_BROKERS');
  }
  return values as CiRuntimeManifest;
}
