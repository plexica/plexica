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

  return {
    test: {
      // Integration tests connect to real Docker services
      testTimeout: 30_000,
      hookTimeout: 30_000,
      // Sequential to avoid race conditions on shared DB (Vitest 4: singleFork → maxWorkers: 1, isolate: false)
      pool: 'forks',
      maxWorkers: 1,
      isolate: false,
      env: {
        ...env,
        NODE_ENV: 'test',
      },
    },
  };
});
