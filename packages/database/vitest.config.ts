import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Load test environment variables from core-api
config({ path: path.resolve(__dirname, '../../apps/core-api/.env.test'), override: true });

export default defineConfig({
  test: {
    name: 'database-migrations',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts'],

    // Migration tests need database access
    testTimeout: 30000,
    hookTimeout: 60000,

    // Run sequentially for database tests
    maxConcurrency: 1,
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', 'src/__tests__/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
