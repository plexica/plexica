import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import plexicaPlugin from '@plexica/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    ...plexicaPlugin({
      manifestPath: './manifest.json',
      devMode: process.env.NODE_ENV === 'development',
      devServerPort: 4001,
    }),
  ],
  build: {
    target: 'esnext',
    modulePreload: false,
    cssCodeSplit: false,
    outDir: 'dist-ui',
    rollupOptions: { input: 'ui/index.ts' },
  },
  server: {
    port: 4001,
    cors: true,
  },
  preview: { port: 4001, cors: true },
});
