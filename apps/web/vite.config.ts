import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import federation from '@originjs/vite-plugin-federation';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// T005-15: Replace %VITE_API_ORIGIN% in the CSP meta tag at build time.
// When VITE_API_ORIGIN is set (e.g. "https://api.example.com") the placeholder
// is substituted so the produced HTML permits XHR/fetch to that origin.
// When unset in development the proxy rewrites /api/* → localhost:3000, so
// connect-src 'self' alone is sufficient and the empty string is harmless.
function cspApiOriginPlugin() {
  return {
    name: 'csp-api-origin',
    transformIndexHtml(html: string) {
      const origin = process.env.VITE_API_ORIGIN ?? '';
      return html.replace(/%VITE_API_ORIGIN%/g, origin);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    cspApiOriginPlugin(),
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
    // T005-15: CSP dev server header (ADR-020).
    // Only sets font-src 'self' here; the full policy is in index.html.
    // Production deployments MUST set the full CSP via HTTP response headers
    // (Nginx / CDN / Fastify @fastify/helmet) because <meta> CSP cannot
    // enforce frame-ancestors. See TD-007 in decision-log.md.
    //
    // VITE_API_ORIGIN: optional env var containing the production API origin
    // (e.g. "https://api.example.com"). The cspApiOriginPlugin above substitutes
    // this value into the connect-src directive at build time. Leave unset in
    // development (the /api proxy rewrites to localhost:3000).
    headers: {
      'Content-Security-Policy': "font-src 'self'",
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
