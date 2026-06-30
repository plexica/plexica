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
    outDir: 'dist',
    lib: {
      entry: 'ui/index.ts',
      formats: ['es'],
    },
  },
  server: {
    port: 4001,
  },
});
