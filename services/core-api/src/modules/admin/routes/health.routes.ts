// health.routes.ts
// Fastify plugin — system health check route.
// Implements: Spec 005, Feature 005-09 (S5-101)
//
// Mounted under the /api/v1/admin prefix (registered by the admin module in
// index.ts). requireSuperAdmin is applied at the admin scope level, so this
// route is automatically protected. The route path here is relative: /health.

import { checkHealth } from '../services/health-checker.service.js';
import { HealthResponseSchema } from '../schemas/health-schemas.js';

import type { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /api/v1/admin/health ──────────────────────────────────────────────
  fastify.get('/health', async () => {
    const result = await checkHealth();
    // Validate the outgoing payload against the Zod schema — guarantees the
    // response shape is always well-formed and strips any unexpected fields.
    return HealthResponseSchema.parse(result);
  });
}
