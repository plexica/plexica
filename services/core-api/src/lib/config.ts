import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),

    // Database
    DATABASE_URL: z.string().url(),
    PLUGIN_DB_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/)
      .optional(),
    PLUGIN_DB_SSL_MODE: z.enum(['disable', 'verify-full']),
    PLUGIN_DB_SSL_ROOT_CERT_PATH: z.string().optional(),
    PLUGIN_DB_HOST: z.string().min(1).optional(),
    PLUGIN_DOCKER_NETWORK: z.string().min(1).optional(),
    PLUGIN_CORE_API_URL: z.string().url().default('http://localhost:3001'),
    PLUGIN_RUNTIME_SCOPE: z
      .string()
      .regex(/^[a-zA-Z0-9_.-]+$/)
      .optional(),

    // Keycloak
    KEYCLOAK_URL: z.string().url(),
    KEYCLOAK_ADMIN_USER: z.string().min(1),
    KEYCLOAK_ADMIN_PASSWORD: z.string().min(1),
    KEYCLOAK_API_AUDIENCE: z.string().min(1).default('plexica-api'),

    // Redis
    REDIS_URL: z.string().min(1),

    // MinIO
    MINIO_ENDPOINT: z.string().min(1),
    MINIO_ACCESS_KEY: z.string().min(1),
    MINIO_SECRET_KEY: z.string().min(1),

    // Kafka / Redpanda
    KAFKA_BROKERS: z.string().min(1),
    EVENT_KEY_ENCRYPTION_KEY: z.string().optional(),
    PLUGIN_CREDENTIAL_PEPPER: z.string().min(32).optional(),

    // SMTP (optional in development)
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),

    // ABAC
    ABAC_CACHE_TTL_SECONDS: z.coerce.number().int().default(300),
    ABAC_DECISION_LOG_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(1.0),

    // Invitations
    INVITATION_EXPIRY_DAYS: z.coerce.number().int().default(7),
    APP_URL: z.string().default('http://localhost:5173'),

    // File uploads (in bytes)
    AVATAR_MAX_BYTES: z.coerce.number().int().default(1_048_576), // 1MB
    LOGO_MAX_BYTES: z.coerce.number().int().default(2_097_152), // 2MB

    // SMTP sender address
    SMTP_FROM: z.string().default('noreply@plexica.io'),

    // Loki / Grafana — log aggregation (ADR-022).
    // Empty string = feature disabled (stdout-only). Config-driven, no dev/prod branching.
    LOKI_URL: z.string().default(''),
    GRAFANA_URL: z.string().default(''),

    // Global rate limit — max requests per time window (default 100).
    // Increase for E2E / load-test environments where a single IP fires many requests.
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),

    // Admin scope rate limit — max requests per time window (default 30).
    // The admin scope uses a separate in-memory rate limiter (see index.ts).
    // Must be higher in CI/E2E where a single test suite fires many admin API
    // requests from the same IP in a short window.
    ADMIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),

    // Resolve endpoint rate limit — max requests per minute per IP (default 30).
    // Set higher (e.g. 1000) in dev/E2E to prevent flaky tests from shared budget.
    RATE_LIMIT_RESOLVE_MAX: z.coerce.number().int().min(1).default(30),

    // JWKS cache TTL in milliseconds (default 1 hour)
    JWKS_CACHE_TTL_MS: z.coerce.number().int().default(3_600_000),

    // Keycloak master realm name — used to enforce that super_admin tokens are
    // issued by the master realm, not by a tenant realm (H-03 security fix).
    KEYCLOAK_MASTER_REALM: z.string().default('master'),

    // Fastify trustProxy — controls how many X-Forwarded-For hops to trust.
    // false  = trust no proxy (safe default; request.ip is the direct connection IP).
    // 1      = trust one hop (set this when running behind a single reverse proxy).
    // Never use `true` — it trusts the entire X-Forwarded-For chain, enabling
    // trivial IP spoofing by any client that sends a forged X-Forwarded-For header.
    TRUST_PROXY: z.preprocess(
      (v) =>
        v === 'true'
          ? true
          : v === 'false'
            ? false
            : v === undefined
              ? false
              : Number.isNaN(Number(v))
                ? v
                : Number(v),
      z.union([z.boolean(), z.string(), z.number()]).default(false)
    ),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !value.EVENT_KEY_ENCRYPTION_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EVENT_KEY_ENCRYPTION_KEY'],
        message: 'Required in production',
      });
    }
    if (value.EVENT_KEY_ENCRYPTION_KEY) {
      const decoded = Buffer.from(value.EVENT_KEY_ENCRYPTION_KEY, 'base64url');
      if (
        !/^[A-Za-z0-9_-]{43}$/.test(value.EVENT_KEY_ENCRYPTION_KEY) ||
        decoded.byteLength !== 32
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EVENT_KEY_ENCRYPTION_KEY'],
          message: 'Must be base64url-encoded 32-byte key material',
        });
      }
    }
    if (value.NODE_ENV === 'production') {
      for (const key of ['PLUGIN_DB_ENCRYPTION_KEY', 'PLUGIN_CREDENTIAL_PEPPER'] as const) {
        if (!value[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: 'Required in production',
          });
        }
      }
      if (value.PLUGIN_DB_SSL_MODE !== 'verify-full') {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PLUGIN_DB_SSL_MODE'],
          message: 'Production plugin database connections require verify-full',
        });
      }
      const caPath = value.PLUGIN_DB_SSL_ROOT_CERT_PATH;
      if (
        !caPath ||
        !path.isAbsolute(caPath) ||
        !existsSync(caPath) ||
        !statSync(caPath).isFile()
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PLUGIN_DB_SSL_ROOT_CERT_PATH'],
          message: 'Production requires an absolute path to a mounted CA file',
        });
      }
    } else if (value.PLUGIN_DB_SSL_MODE !== 'disable') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PLUGIN_DB_SSL_MODE'],
        message: 'Development and test must explicitly disable plugin database TLS',
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function parseConfig(environment: NodeJS.ProcessEnv): Config {
  const result = configSchema.safeParse(environment);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const config: Config = parseConfig(process.env);
