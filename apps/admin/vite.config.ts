// vite.config.ts — Vite configuration for apps/admin
// No Module Federation — admin app is standalone (plan D-2).
// Dev server on port 3002 (web=3000, grafana=3001).

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3002,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/realms': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3002,
  },
  build: {
    target: 'ES2022',
    sourcemap: true,
  },
});
