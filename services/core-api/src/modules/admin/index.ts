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
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { tenantListRoutes } from './routes/tenant-list.routes.js';
import { tenantDetailRoutes } from './routes/tenant-detail.routes.js';
import { tenantProvisionRoutes } from './routes/tenant-provision.routes.js';
import { pluginCatalogRoutes } from './routes/plugin-catalog.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { auditLogRoutes } from './routes/audit-log.routes.js';
import { kafkaStatusRoutes } from './routes/kafka-status.routes.js';
import { tenantDeleteRoutes } from './routes/tenant-delete.routes.js';
import { deletionStatusRoutes } from './routes/deletion-status.routes.js';
import { tenantSuspendRoutes } from './routes/tenant-suspend.routes.js';
import { tenantReactivateRoutes } from './routes/tenant-reactivate.routes.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

const ADMIN_PREFIX = '/api/v1/admin';

export const adminRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  await fastify.register(
    async (adminScope) => {
      adminScope.addHook('preHandler', requireSuperAdmin);

      // Route groups — order per route ownership table (plan §3.4).
      await adminScope.register(dashboardRoutes);
      await adminScope.register(tenantListRoutes);
      await adminScope.register(tenantDetailRoutes);
      await adminScope.register(tenantProvisionRoutes);
      await adminScope.register(pluginCatalogRoutes);
      await adminScope.register(healthRoutes);
      await adminScope.register(auditLogRoutes);
      await adminScope.register(kafkaStatusRoutes);
      await adminScope.register(tenantDeleteRoutes);
      await adminScope.register(deletionStatusRoutes);
      await adminScope.register(tenantSuspendRoutes);
      await adminScope.register(tenantReactivateRoutes);
    },
    { prefix: ADMIN_PREFIX }
  );
};
