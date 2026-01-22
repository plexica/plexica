// File: apps/plugin-template-frontend/vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'plugin_template',
      filename: 'remoteEntry.js',
      exposes: {
        './Plugin': './src/Plugin.tsx',
        './routes': './src/routes/index.ts',
        './manifest': './src/manifest.ts',
      },
      shared: [
        'react',
        'react-dom',
        '@tanstack/react-router',
        '@tanstack/react-query',
        'axios',
        'zustand',
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3100,
    cors: true,
  },
  build: {
    target: 'esnext',
    minify: true,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'esm',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
