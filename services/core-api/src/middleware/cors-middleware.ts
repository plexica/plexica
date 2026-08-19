// cors-middleware.ts
// Registers @fastify/cors on the Fastify instance when E2E_CORS config is
// enabled. Kept in its own file so index.ts stays under the 200-line gate
// (Constitution Rule 4).

import cors from '@fastify/cors';

import type { Config } from '../lib/config.js';
import type { FastifyInstance } from 'fastify';

export async function registerCors(
  server: FastifyInstance,
  config: Config,
): Promise<void> {
  if (!config.E2E_CORS) return;

  // Enabled during E2E runs so the production Vite build (running on
  // http://e2e.localhost:3000) can make cross-origin fetch() calls directly
  // to the API on http://localhost:3001. The Vite build embeds
  // VITE_API_URL=http://localhost:3001 at build time.
  await server.register(cors, {
    origin: config.CORS_ORIGIN ?? true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
}
