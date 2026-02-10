import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/unit/**/*.test.ts', 'src/__tests__/**/*.unit.test.ts'],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],

    // Unit tests should be fast
    testTimeout: 5000,
    hookTimeout: 10000,

    // Unit tests are isolated - allow parallelism to speed up runs
    // Keep a modest concurrency to avoid overwhelming CI machines
    maxConcurrency: 4,
    fileParallelism: true,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage/unit',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'src/index.ts',
        'src/__tests__/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },

    setupFiles: ['./src/__tests__/setup/unit-setup.ts'],
    // Provide an env var to toggle DB-backed unit tests (default false)
    env: {
      UNIT_TEST_USE_DB: process.env.UNIT_TEST_USE_DB || 'false',
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@test': path.resolve(__dirname, '../../test-infrastructure'),
    },
  },
});
