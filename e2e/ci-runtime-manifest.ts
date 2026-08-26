import { readFileSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

export type CiRuntimeManifest = z.infer<typeof manifestSchema>;

export function isCiRuntimeContract(): boolean {
  return process.env['CI_RUNTIME_CONTRACT'] === '1';
}

/**
 * Strict loopback URL: the literal IPv4 contract host with an explicit,
 * valid TCP port. Malformed URLs are rejected, and IPv6 forms are rejected
 * explicitly because URL().hostname strips brackets ('[::1]' -> '::1').
 */
function isStrictLoopbackUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hostname.includes(':')) return false;
  const port = Number(url.port);
  return (
    url.hostname === '127.0.0.1' &&
    url.port !== '' &&
    Number.isInteger(port) &&
    port > 0 &&
    port <= 65535
  );
}

const CREDENTIAL =
  /^(ci-admin-[a-f0-9]{16}|[A-Za-z0-9_-]{43})$/;

const hostUrl = (key: string) =>
  z.string().refine(isStrictLoopbackUrl, `Invalid CI host manifest entry ${key}`);

const credential = (key: string) =>
  z.string().regex(CREDENTIAL, `Invalid CI host manifest entry ${key}`);

const manifestSchema = z
  .object({
    POSTGRES_HOST_URL: hostUrl('POSTGRES_HOST_URL'),
    REDIS_HOST_URL: hostUrl('REDIS_HOST_URL'),
    MINIO_HOST_URL: hostUrl('MINIO_HOST_URL'),
    LOKI_HOST_URL: hostUrl('LOKI_HOST_URL'),
    MAILPIT_SMTP_URL: hostUrl('MAILPIT_SMTP_URL'),
    MAILPIT_UI_BASE: hostUrl('MAILPIT_UI_BASE'),
    KEYCLOAK_HOST_ADMIN_BASE: hostUrl('KEYCLOAK_HOST_ADMIN_BASE'),
    KEYCLOAK_PUBLIC_ISSUER_BASE: hostUrl('KEYCLOAK_PUBLIC_ISSUER_BASE'),
    KEYCLOAK_ADMIN_USER: credential('KEYCLOAK_ADMIN_USER'),
    KEYCLOAK_ADMIN_PASSWORD: credential('KEYCLOAK_ADMIN_PASSWORD'),
    KEYCLOAK_E2E_CLIENT_SECRET: credential('KEYCLOAK_E2E_CLIENT_SECRET'),
    CORE_API_PUBLIC_BASE: hostUrl('CORE_API_PUBLIC_BASE'),
    WEB_E2E_PUBLIC_BASE: hostUrl('WEB_E2E_PUBLIC_BASE'),
    ADMIN_E2E_PUBLIC_BASE: hostUrl('ADMIN_E2E_PUBLIC_BASE'),
    KAFKA_BROKERS: z
      .string()
      .regex(/^127\.0\.0\.1:[1-9][0-9]*$/, 'Invalid CI host manifest entry KAFKA_BROKERS'),
  })
  .refine(
    (values) => values.KEYCLOAK_HOST_ADMIN_BASE === values.KEYCLOAK_PUBLIC_ISSUER_BASE,
    'CI Keycloak host-admin must match the public issuer'
  );

export function ciRuntimeManifest(): CiRuntimeManifest {
  const runtime = process.env['CI_RUNTIME_DIR'];
  if (!runtime) throw new Error('CI runtime requires CI_RUNTIME_DIR host manifest');
  const values = Object.fromEntries(
    readFileSync(path.join(runtime, 'host.env'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  const result = manifestSchema.safeParse(values);
  if (!result.success) {
    // Report every failing entry in one actionable error instead of only the
    // first one, preserving the established per-entry message quality.
    throw new Error(result.error.issues.map((issue) => issue.message).join('; '));
  }
  return result.data;
}
