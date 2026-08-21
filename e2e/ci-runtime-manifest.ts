import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface CiRuntimeManifest {
  KEYCLOAK_HOST_ADMIN_BASE: string;
  KEYCLOAK_PUBLIC_ISSUER_BASE: string;
  CORE_API_PUBLIC_BASE: string;
  WEB_E2E_PUBLIC_BASE: string;
  ADMIN_E2E_PUBLIC_BASE: string;
}

export function isCiRuntimeContract(): boolean {
  return process.env['CI_RUNTIME_CONTRACT'] === '1';
}

function loopback(value: string): boolean {
  return ['127.0.0.1', 'localhost', '::1'].includes(new URL(value).hostname);
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
  const required = ['KEYCLOAK_HOST_ADMIN_BASE', 'KEYCLOAK_PUBLIC_ISSUER_BASE', 'CORE_API_PUBLIC_BASE', 'WEB_E2E_PUBLIC_BASE', 'ADMIN_E2E_PUBLIC_BASE'] as const;
  for (const key of required) {
    if (!values[key] || !loopback(values[key])) throw new Error(`Invalid CI host manifest entry ${key}`);
  }
  if (values.KEYCLOAK_HOST_ADMIN_BASE !== values.KEYCLOAK_PUBLIC_ISSUER_BASE) {
    throw new Error('CI Keycloak host-admin must match the public issuer');
  }
  return values as CiRuntimeManifest;
}
