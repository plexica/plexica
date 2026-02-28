// File: apps/super-admin/vitest.config.ts
//
// Vitest configuration for super-admin unit/component tests.
// Uses jsdom environment to simulate browser DOM for React Testing Library.
// Note: @vitejs/plugin-react import shows an LSP error under "bundler"
// moduleResolution in tsconfig.json — this is a known IDE artifact and
// does not affect runtime behaviour (Vite resolves it fine).

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — moduleResolution:bundler tsconfig mismatch (IDE-only, runtime OK)
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup/vitest.setup.ts'],
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/routeTree.gen.ts', 'src/main.tsx', 'src/**/*.d.ts', 'src/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
