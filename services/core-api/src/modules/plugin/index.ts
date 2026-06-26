// index.ts
// Plugin module Fastify plugin — registers admin + lifecycle routes.

import { adminCatalogRoutes } from './routes/admin-catalog.routes.js';
import { adminPublishRoutes } from './routes/admin-publish.routes.js';
import { adminVersionsRoutes } from './routes/admin-versions.routes.js';

import type { FastifyInstance } from 'fastify';

export async function pluginAdminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(adminCatalogRoutes);
  await fastify.register(adminPublishRoutes);
  await fastify.register(adminVersionsRoutes);
}

export async function pluginTenantRoutes(fastify: FastifyInstance): Promise<void> {
  // Tenant-scoped plugin routes will be added in Phases 2+:
  // - lifecycle.routes (install/deactivate/reactivate/uninstall)
  // - visibility.routes (workspace visibility)
  // - proxy.routes (plugin API proxy)
  // - dev.routes (dev mode registration)
}
