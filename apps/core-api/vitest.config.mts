import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Load test environment variables BEFORE anything else
config({ path: path.resolve(__dirname, '.env.test'), override: true });

/**
 * Default vitest configuration for `pnpm test:coverage`.
 *
 * Runs ALL test types (unit, integration, e2e) in a single pass to produce
 * a unified coverage report. Each test type has its own dedicated config
 * under test/ for isolated runs (e.g. `pnpm test:unit`).
 *
 * Timeouts are set to accommodate the slowest test type (e2e).
 * File parallelism is disabled because integration/e2e tests require
 * sequential execution to avoid database conflicts.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    include: [
      // Unit tests
      'src/__tests__/**/unit/**/*.test.ts',
      'src/__tests__/**/*.unit.test.ts',
      // Integration tests
      'src/__tests__/**/integration/**/*.test.ts',
      'src/__tests__/**/*.integration.test.ts',
      // E2E tests
      'src/__tests__/**/e2e/**/*.test.ts',
      'src/__tests__/**/*.e2e.test.ts',
    ],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],

    // Use the most generous timeouts (e2e) so no test type times out
    testTimeout: 180000,
    hookTimeout: 240000,

    // Sequential execution for database-dependent tests
    maxConcurrency: 1,
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'src/index.ts',
        'src/__tests__/**',
      ],
      // Thresholds aligned to actual coverage (~63% lines/statements, ~57% branches).
      // Set 3 points below current values to absorb small fluctuations.
      // TODO: Gradually raise these as test coverage improves toward 80%.
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 54,
        statements: 60,
      },
    },

    setupFiles: ['./src/__tests__/setup/coverage-setup.ts'],

    env: {
      UNIT_TEST_USE_DB: process.env.UNIT_TEST_USE_DB || 'false',
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@test': path.resolve(__dirname, '../test-infrastructure'),
    },
  },
});
