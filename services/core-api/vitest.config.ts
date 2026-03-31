import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests connect to real Docker services
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Sequential to avoid race conditions on shared DB
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Load .env file for test runs
    env: {
      NODE_ENV: 'test',
    },
  },
});
