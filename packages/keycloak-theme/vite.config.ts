import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { keycloakify } from 'keycloakify/vite-plugin';

export default defineConfig({
  plugins: [
    react(),
    keycloakify({
      themeName: 'plexica',
      accountThemeImplementation: 'none',
      keycloakVersionTargets: {
        'all-other-versions': true,
        '22-to-25': false,
      },
    }),
  ],
});
