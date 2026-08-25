// basic-health-routes.ts
// Fastify plugin — basic liveness endpoints (no dependency probes; use the
// admin module's /api/v1/admin/health for deep checks).
//
// Routes:
//   GET /health        — original liveness route (root namespace).
//   GET /api/v1/health — /api-namespaced twin used by the CI runtime contract
//     flow (run 32830351048): the web/admin same-origin proxy only forwards
//     /api/*, so browser contract probes must target an /api-prefixed path.
//
// Both routes are explicitly PUBLIC — no auth, no tenant context (Constitution:
// public endpoints are opt-in and documented, this comment is that opt-in) —
// and exempt from rate limiting. Registered on the ROOT Fastify instance in
// index.ts, OUTSIDE every auth preHandler scope (mirrors invitationPublicRoutes).

import type { FastifyInstance } from 'fastify';

/** Shared handler — both routes MUST return exactly this payload. */
export function basicHealthPayload(): { status: string; version: string } {
  return { status: 'ok', version: '2.0.0' };
}

export async function basicHealthRoutes(fastify: FastifyInstance): Promise<void> {
  const options = { config: { rateLimit: false } };
  fastify.get('/health', options, async () => basicHealthPayload());
  fastify.get('/api/v1/health', options, async () => basicHealthPayload());
}
