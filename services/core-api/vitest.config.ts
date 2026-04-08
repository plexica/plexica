import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Monorepo root is two levels up from services/core-api/
const monorepoRoot = resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  // Load all env vars (empty prefix = no filter) from monorepo root .env
  const env = loadEnv(mode ?? 'test', monorepoRoot, '');

  const sharedEnv = {
    ...env,
    NODE_ENV: 'test',
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
