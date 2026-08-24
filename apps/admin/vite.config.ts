// vite.config.ts — Vite configuration for apps/admin
// No Module Federation — admin app is standalone (plan D-2).
// Dev server on port 3002 (web=3000, grafana=3001).

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ciRuntime = process.env.CI_RUNTIME_CONTRACT === '1';
const apiProxy = {
  target: ciRuntime
    ? process.env.E2E_CORE_API_PROXY_TARGET === 'http://core-api-e2e:3001'
      ? process.env.E2E_CORE_API_PROXY_TARGET
      : (() => { throw new Error('CI requires the exact DNS-only Core proxy target'); })()
    : 'http://localhost:3001',
  changeOrigin: false,
};

export default defineConfig({
  define: { __PLEXICA_CI_RUNTIME_CONTRACT__: JSON.stringify(ciRuntime) },
  plugins: [react()],
  server: {
    port: 3002,
    strictPort: true,
    ...(ciRuntime ? { host: '0.0.0.0' } : {}),
    proxy: { '/api': apiProxy },
  },
  preview: {
    port: 3002,
    strictPort: true,
    ...(ciRuntime ? { host: '0.0.0.0' } : {}),
    proxy: { '/api': apiProxy },
  },
  build: {
    target: 'ES2022',
    sourcemap: true,
  },
});
