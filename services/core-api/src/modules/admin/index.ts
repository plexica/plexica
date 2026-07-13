// index.ts
// Admin module Fastify plugin — registers all super-admin route groups.
//
// All routes are mounted under the /api/v1/admin prefix and require a
// master-realm super_admin token (enforced by requireSuperAdmin).
//
// Route groups (added incrementally as Spec 005 features land):
//   - dashboard          — platform overview metrics (S5-100)
//   - tenant-lifecycle   — tenant provisioning/suspension/deletion (S5-400)
//   - plugin-catalog     — plugin approval/publishing/visibility (S5-200)
//   - health             — per-tenant health probe aggregation (S5-500)
//   - logs               — aggregated log streaming/search (S5-600)
//   - kafka-status       — broker + consumer-group inspection (S5-700)
//
// authMiddleware is applied at the admin SCOPE in src/index.ts (the caller).
// requireSuperAdmin is applied HERE per route group so each group can opt in
// explicitly — keeping the security boundary visible at the route level.

import { requireSuperAdmin } from '../../middleware/require-super-admin.js';
import { healthRoutes } from './routes/health.routes.js';
import { tenantListRoutes } from './routes/tenant-list.routes.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const ADMIN_PREFIX = '/api/v1/admin';

export const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(
    async (adminScope) => {
      adminScope.addHook('preHandler', requireSuperAdmin);

      // Route groups registered as they are implemented:
      await adminScope.register(tenantListRoutes);
      await adminScope.register(healthRoutes);
      // await adminScope.register(dashboardRoutes);
      // await adminScope.register(tenantLifecycleRoutes);
      // await adminScope.register(pluginCatalogRoutes);
      // await adminScope.register(logsRoutes);
      // await adminScope.register(kafkaStatusRoutes);
    },
    { prefix: ADMIN_PREFIX }
  );
};
