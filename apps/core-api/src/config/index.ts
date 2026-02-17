import dotenv from 'dotenv';
import { z } from 'zod';
import { parseCorsOrigins } from '../lib/cors-validator.js';

// Load environment variables
// In test mode, .env.test should already be loaded by test setup
// So we don't override if NODE_ENV=test and vars are already loaded
if (process.env.NODE_ENV !== 'test' || !process.env.DATABASE_URL) {
  dotenv.config();
}

// Custom boolean transformer for environment variables
const booleanFromString = z
  .string()
  .transform((val) => val === 'true' || val === '1')
  .pipe(z.boolean());

// CORS origin validation
const corsOriginTransform = z
  .string()
  .default('http://localhost:3001')
  .transform((val) => parseCorsOrigins(val));

// Configuration schema
const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  databaseUrl: z.string(),
  databaseSslMode: z
    .enum(['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'])
    .default('require')
    .describe('SSL mode for database connections (require for production)'),

  // Redis
  redisHost: z.string().default('localhost'),
  redisPort: z.coerce.number().default(6379),
  redisPassword: z.string().optional(),
  redisTls: booleanFromString.default(false as any),

  // Keycloak
  keycloakUrl: z.string(),
  keycloakRealm: z.string().default('master'),
  keycloakClientId: z.string(),
  keycloakClientSecret: z.string().optional(),
  keycloakAdminUsername: z.string(),
  keycloakAdminPassword: z.string(),

  // Kafka/Redpanda
  kafkaBrokers: z.string().default('localhost:9092'),

  // Storage
  storageEndpoint: z.string().default('localhost:9000'),
  storageAccessKey: z.string(),
  storageSecretKey: z.string(),
  storageUseSsl: booleanFromString.default(false as any),

  // JWT
  jwtSecret: z.string(),
  jwtExpiration: z.string().default('15m'),

  // OAuth 2.0
  oauthCallbackUrl: z.string().url().describe('OAuth 2.0 callback URL for Authorization Code flow'),
  jwksCacheTtl: z.coerce
    .number()
    .default(600000)
    .describe('JWKS cache TTL in milliseconds (default: 10 minutes)'),

  // Rate Limiting
  authRateLimitMax: z.coerce
    .number()
    .default(10)
    .describe('Max login attempts per IP per window (default: 10)'),
  authRateLimitWindow: z.coerce
    .number()
    .default(60000)
    .describe('Auth rate limit window in milliseconds (default: 1 minute)'),

  // CORS - SECURITY: Validate and parse CORS origins
  corsOrigins: corsOriginTransform,
});

// Parse and validate configuration
export const config = configSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.API_PORT,
  host: process.env.API_HOST,
  logLevel: process.env.LOG_LEVEL,

  databaseUrl: process.env.DATABASE_URL,
  databaseSslMode: process.env.DATABASE_SSL_MODE,

  redisHost: process.env.REDIS_HOST,
  redisPort: process.env.REDIS_PORT,
  redisPassword: process.env.REDIS_PASSWORD,
  redisTls: process.env.REDIS_TLS,

  keycloakUrl: process.env.KEYCLOAK_URL,
  keycloakRealm: process.env.KEYCLOAK_REALM,
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID,
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  keycloakAdminUsername: process.env.KEYCLOAK_ADMIN_USERNAME,
  keycloakAdminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD,

  kafkaBrokers: process.env.KAFKA_BROKERS,

  storageEndpoint: process.env.STORAGE_ENDPOINT,
  storageAccessKey: process.env.STORAGE_ACCESS_KEY,
  storageSecretKey: process.env.STORAGE_SECRET_KEY,
  storageUseSsl: process.env.STORAGE_USE_SSL,

  jwtSecret: process.env.JWT_SECRET,
  jwtExpiration: process.env.JWT_EXPIRATION,

  oauthCallbackUrl: process.env.OAUTH_CALLBACK_URL,
  jwksCacheTtl: process.env.JWKS_CACHE_TTL,

  authRateLimitMax: process.env.AUTH_RATE_LIMIT_MAX,
  authRateLimitWindow: process.env.AUTH_RATE_LIMIT_WINDOW,

  corsOrigins: process.env.CORS_ORIGIN,
});

// Validate production security requirements
if (config.nodeEnv === 'production') {
  if (config.storageAccessKey === 'minioadmin' || config.storageSecretKey === 'minioadmin') {
    throw new Error(
      'SECURITY ERROR: MinIO default credentials (minioadmin) detected in production. ' +
        'Please set STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY to secure values.'
    );
  }

  // SECURITY: Enforce minimum JWT secret strength in production.
  // A weak jwtSecret amplifies the risk of HS256 token forgery (see jwt.ts).
  // 32 bytes (256 bits) is the minimum recommended for HMAC-SHA256.
  if (config.jwtSecret.length < 32) {
    throw new Error(
      'SECURITY ERROR: JWT_SECRET is too short for production. ' +
        'Minimum 32 characters (256 bits) required for HMAC-SHA256 security. ' +
        'Generate a strong secret with: openssl rand -base64 48'
    );
  }
}

export type Config = z.infer<typeof configSchema>;
