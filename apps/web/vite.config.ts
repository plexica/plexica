import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import federation from '@originjs/vite-plugin-federation';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    tailwindcss(),
    react(),
    federation({
      name: 'plexica_host',
      remotes: {
        // Dynamic remotes will be loaded at runtime
        // Plugins register themselves via PluginLoader
      },
      shared: [
        'react',
        'react-dom',
        '@tanstack/react-router',
        '@tanstack/react-query',
        'axios',
        'zustand',
        '@plexica/ui',
        '@plexica/types',
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    // Security: Restrict CORS to prevent unauthorized cross-origin requests in dev
    cors: {
      origin: 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'X-Workspace-ID'],
      maxAge: 3600,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});
