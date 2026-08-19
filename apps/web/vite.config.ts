// vite.config.ts — Vite configuration for apps/web

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

const apiProxy = {
  target: 'http://localhost:3001',
  changeOrigin: false,
};

export default defineConfig({
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
    allowedHosts: ['.localhost'],
    proxy: {
      '/api': apiProxy,
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
    allowedHosts: ['.localhost'],
    proxy: { '/api': apiProxy },
  },
  build: {
    target: 'esnext',
    modulePreload: false,
    sourcemap: true,
  },
});
