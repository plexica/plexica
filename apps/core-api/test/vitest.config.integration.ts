import { defineConfig } from 'vitest/config';
import path from 'path';
import { config } from 'dotenv';

// Load test environment variables BEFORE anything else
config({ path: path.resolve(__dirname, '../.env.test'), override: true });

export default defineConfig({
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    include: [
      'src/__tests__/**/integration/**/*.test.ts',
      'src/__tests__/**/*.integration.test.ts',
    ],
    exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.*'],

    // Integration tests need more time
    testTimeout: 30000,
    hookTimeout: 60000,

    // Run sequentially as requested
    maxConcurrency: 1,
    fileParallelism: false,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage/integration',
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
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
    },

    setupFiles: ['./src/__tests__/setup/integration-setup.ts'],
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@test': path.resolve(__dirname, '../../test-infrastructure'),
    },
  },
});
