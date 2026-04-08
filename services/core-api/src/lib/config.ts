// config.ts
// Environment variable loader with Zod validation.
// Throws at startup if any required variable is missing or invalid.

import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),

  // Database
  DATABASE_URL: z.string().url(),

  // Keycloak
  KEYCLOAK_URL: z.string().url(),
  KEYCLOAK_ADMIN_USER: z.string().min(1),
  KEYCLOAK_ADMIN_PASSWORD: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // MinIO
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),

  // Kafka / Redpanda
  KAFKA_BROKERS: z.string().min(1),

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

  // JWKS cache TTL in milliseconds (default 1 hour)
  JWKS_CACHE_TTL_MS: z.coerce.number().int().default(3_600_000),

  // Keycloak OIDC client ID — used for JWT audience validation (H-4)
  KEYCLOAK_CLIENT_ID: z.string().default('plexica-web'),

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
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

// Singleton config — parsed once at module load
export const config: Config = loadConfig();
