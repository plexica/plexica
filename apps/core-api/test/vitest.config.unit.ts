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

    // Run sequentially as requested
    maxConcurrency: 1,
    fileParallelism: false,

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
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
      '@test': path.resolve(__dirname, '../../test-infrastructure'),
    },
  },
});
