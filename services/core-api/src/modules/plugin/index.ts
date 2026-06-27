// index.ts
// Plugin module Fastify plugin — registers all plugin route groups.

import { adminCatalogRoutes } from './routes/admin-catalog.routes.js';
import { adminPublishRoutes } from './routes/admin-publish.routes.js';
import { adminVersionsRoutes } from './routes/admin-versions.routes.js';
import { dlqRoutes } from './routes/dlq.routes.js';
import { devPluginRoutes } from './routes/dev.routes.js';
import { proxyRoutes } from './routes/proxy.routes.js';
import { lifecycleRoutes } from './routes/lifecycle.routes.js';
import { visibilityRoutes } from './routes/visibility.routes.js';

import type { FastifyInstance } from 'fastify';

export async function pluginAdminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(adminCatalogRoutes);
  await fastify.register(adminPublishRoutes);
  await fastify.register(adminVersionsRoutes);
  await fastify.register(dlqRoutes);
}

export async function pluginTenantRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(devPluginRoutes);
  await fastify.register(proxyRoutes);
  await fastify.register(lifecycleRoutes);
  await fastify.register(visibilityRoutes);
}
