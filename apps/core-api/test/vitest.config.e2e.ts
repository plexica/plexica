import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Load test environment variables BEFORE anything else
config({ path: path.resolve(__dirname, '../.env.test'), override: true });

export default defineConfig({
  test: {
    name: 'e2e',
    globals: true,
    environment: 'node',
    include: ['src/__tests__/**/e2e/**/*.test.ts', 'src/__tests__/**/*.e2e.test.ts'],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],

    // E2E tests need even more time
    testTimeout: 180000,
    hookTimeout: 240000,

    // Run sequentially as requested
    maxConcurrency: 1,
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage/e2e',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'src/__tests__/**',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },

    setupFiles: ['./src/__tests__/setup/e2e-setup.ts'],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@test': path.resolve(__dirname, '../../test-infrastructure'),
    },
  },
});
