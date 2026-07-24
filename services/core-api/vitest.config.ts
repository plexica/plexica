import { dirname, resolve } from 'path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'url';

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Monorepo root is two levels up from services/core-api/
const monorepoRoot = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  // Load all env vars (empty prefix = no filter) from monorepo root .env
  const env = loadEnv(mode ?? 'test', monorepoRoot, '');

  // Preserve critical process.env vars that CI sets directly (no .env file).
  // Without this, vitest's fork env override would blank them out.
  // Only include keys that are actually set to avoid injecting undefined.
  const processEnvKeys = [
    'LOKI_URL', 'DATABASE_URL', 'KEYCLOAK_URL', 'KEYCLOAK_ADMIN_USER',
    'KEYCLOAK_ADMIN_PASSWORD', 'REDIS_URL', 'MINIO_ENDPOINT', 'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY', 'KAFKA_BROKERS', 'SMTP_HOST', 'SMTP_PORT',
    'EVENT_KEY_ENCRYPTION_KEY', 'PLUGIN_DB_ENCRYPTION_KEY',
  ];
  const processEnvPatch: Record<string, string> = {};
  for (const key of processEnvKeys) {
    const val = process.env[key] ?? env[key];
    if (val !== undefined) processEnvPatch[key] = val;
  }

  const sharedEnv = {
    ...env,
    ...processEnvPatch,
    NODE_ENV: 'test',
    PLUGIN_DB_SSL_MODE: env['PLUGIN_DB_SSL_MODE'] ?? 'disable',
    PLUGIN_CREDENTIAL_PEPPER:
      env['PLUGIN_CREDENTIAL_PEPPER'] ?? randomBytes(32).toString('base64url'),
  };

  return {
    test: {
      // Exclude compiled output — without this, Vitest picks up dist/__tests__/**
      // causing every test to run twice and breaking ESM module identity (instanceof, mocks).
      exclude: ['dist/**', 'node_modules/**'],

      // Two projects:
      //   unit — files in src/__tests__/unit/** run with isolate:true so vi.mock() scoping
      //           is correct and module state doesn't bleed into integration tests.
      //   integration — all other test files run sequentially (isolate:false, maxWorkers:1)
      //                 to avoid races on the shared DB, Redis, and Keycloak.
      projects: [
        {
          test: {
            name: 'unit',
            include: ['src/__tests__/unit/**/*.test.ts'],
            exclude: ['dist/**', 'node_modules/**'],
            testTimeout: 10_000,
            hookTimeout: 10_000,
            pool: 'forks',
            isolate: true,
            sequence: { groupOrder: 1 },
            env: sharedEnv,
          },
        },
        {
          test: {
            name: 'integration',
            include: ['src/__tests__/**/*.test.ts'],
            exclude: ['src/__tests__/unit/**', 'dist/**', 'node_modules/**'],
            testTimeout: 30_000,
            hookTimeout: 30_000,
            // Sequential to avoid race conditions on shared DB
            pool: 'forks',
            maxWorkers: 1,
            isolate: false,
            sequence: { groupOrder: 2 },
            env: sharedEnv,
          },
        },
      ],
    },
  };
});
