// vite.config.ts — Vite configuration for apps/web

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

const apiProxy = {
  target:
    process.env.CI_RUNTIME_CONTRACT === '1'
      ? process.env.E2E_CORE_API_PROXY_TARGET === 'http://core-api-e2e:3001'
        ? process.env.E2E_CORE_API_PROXY_TARGET
        : (() => { throw new Error('CI requires the exact DNS-only Core proxy target'); })()
      : 'http://localhost:3001',
  changeOrigin: false,
};
const ciRuntime = process.env.CI_RUNTIME_CONTRACT === '1';

export default defineConfig({
  define: { __PLEXICA_CI_RUNTIME_CONTRACT__: JSON.stringify(ciRuntime) },
  plugins: [
    react(),
    federation({
      name: 'plexica_shell',
      remotes: {},
      shared: {
        react: { version: '19.2.7', shareScope: 'default' },
        'react/jsx-runtime': { version: '19.2.7', shareScope: 'default' },
        'react-dom': { version: '19.2.7', shareScope: 'default' },
        '@tanstack/react-query': { version: '5.0.0', shareScope: 'default' },
        '@plexica/ui': { version: '0.0.1', shareScope: 'default' },
        'react-intl': { version: '6.6.0', shareScope: 'default' },
      },
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-intl', '@tanstack/react-query'],
  },
  server: {
    port: 3000,
    strictPort: true,
    ...(ciRuntime ? { host: '0.0.0.0' } : {}),
    allowedHosts: ['.localhost'],
    proxy: {
      '/api': apiProxy,
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
    ...(ciRuntime ? { host: '0.0.0.0' } : {}),
    allowedHosts: ['.localhost'],
    proxy: { '/api': apiProxy },
  },
  build: {
    target: 'esnext',
    modulePreload: false,
    sourcemap: true,
  },
});
