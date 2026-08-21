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

  // vitest's test.env REPLACES process.env in the fork — it does not merge.
  // In CI (no .env file), critical infra vars set in the GitHub Actions step
  // would be lost. Start from process.env, then overlay .env file values,
  // then apply test-specific overrides.
  const sharedEnv = {
    ...process.env,
    ...env,
    NODE_ENV: 'test',
    PLUGIN_DB_SSL_MODE: env['PLUGIN_DB_SSL_MODE'] ?? process.env['PLUGIN_DB_SSL_MODE'] ?? 'disable',
    PLUGIN_CREDENTIAL_PEPPER:
      env['PLUGIN_CREDENTIAL_PEPPER'] ?? process.env['PLUGIN_CREDENTIAL_PEPPER'] ??
      randomBytes(32).toString('base64url'),
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
      // ADR-030: v8 provider for unit tests (run via `test:unit:coverage`,
      // which executes only the `unit` project). Cobertura XML feeds the CI
      // artifact upload + GitHub native code coverage; text gives the
      // human-readable summary. Thresholds are intentionally not enforced
      // yet — coverage is reported, not gated (see ADR-030 trade-offs).
      //
      // NOTE: coverage is a ROOT-level option in Vitest 4 — it is read from
      // ctx._coverageOptions (root config), not from individual projects.
      // `all: false` measures only files actually loaded by the unit project;
      // integration-only files (DB/Keycloak/Kafka paths) would otherwise be
      // reported as 0% and dilute the unit number.
      coverage: {
        provider: 'v8',
        reporter: ['text', 'cobertura'],
        include: ['src/**/*.ts'],
        exclude: ['src/__tests__/**', 'src/cli/**', 'src/index.ts', 'src/bootstrap.ts', 'dist/**', 'node_modules/**'],
        reportsDirectory: './coverage/unit',
        all: false,
        reportOnFailure: true,
      },
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
