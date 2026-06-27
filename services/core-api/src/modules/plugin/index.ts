// index.ts
// Plugin module Fastify plugin — registers all plugin route groups.

import { adminCatalogRoutes } from './routes/admin-catalog.routes.js';
import { adminPublishRoutes } from './routes/admin-publish.routes.js';
import { adminVersionsRoutes } from './routes/admin-versions.routes.js';
import { dlqRoutes } from './routes/dlq.routes.js';
import { devPluginRoutes } from './routes/dev.routes.js';

import type { FastifyInstance } from 'fastify';

export async function pluginAdminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(adminCatalogRoutes);
  await fastify.register(adminPublishRoutes);
  await fastify.register(adminVersionsRoutes);
  await fastify.register(dlqRoutes);
}

export async function pluginTenantRoutes(fastify: FastifyInstance): Promise<void> {
  // Dev mode registration (gated by NODE_ENV=development internally)
  await fastify.register(devPluginRoutes);

  // Phases 5+:
  // - lifecycle.routes (install/deactivate/reactivate/uninstall)
  // - visibility.routes (workspace visibility)
  // - proxy.routes (plugin API proxy)
}
