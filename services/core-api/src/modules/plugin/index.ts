// index.ts
// Plugin module Fastify plugin — registers all plugin route groups.

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

import { adminCatalogRoutes } from './routes/admin-catalog.routes.js';
import { adminPublishRoutes } from './routes/admin-publish.routes.js';
import { adminVersionsRoutes } from './routes/admin-versions.routes.js';
import { dlqRoutes } from './routes/dlq.routes.js';
import { kafkaStatusRoutes } from './routes/kafka-status.routes.js';
import { devPluginRoutes } from './routes/dev.routes.js';
import { eventEmitRoutes } from './routes/events.routes.js';
import { marketplaceRoutes } from './routes/marketplace.routes.js';
import { proxyRoutes } from './routes/proxy.routes.js';
import { installRoutes } from './routes/lifecycle/install.routes.js';
import { deactivateRoutes } from './routes/lifecycle/deactivate.routes.js';
import { reactivateRoutes } from './routes/lifecycle/reactivate.routes.js';
import { uninstallRoutes } from './routes/lifecycle/uninstall.routes.js';
import { visibilityRoutes } from './routes/visibility.routes.js';
import { startPeriodicHealthPolling } from './services/health-check.service.js';
import { createContainerManager } from './services/container-manager.service.js';
import { getActiveConsumerGroups, CONSUMER_GROUP_PREFIX } from './events/consumer-manager.service.js';
import { registerDevBackend } from './services/dev-backends.js';

import type { FastifyInstance } from 'fastify';

function extractInstallIds(groups: string[]): string[] {
  return groups
    .filter((g) => g.startsWith(CONSUMER_GROUP_PREFIX))
    .map((g) => g.slice(CONSUMER_GROUP_PREFIX.length).split('-')[0] ?? '')
    .filter(Boolean);
}

export async function pluginAdminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(adminCatalogRoutes);
  await fastify.register(adminPublishRoutes);
  await fastify.register(adminVersionsRoutes);
  await fastify.register(dlqRoutes);
  await fastify.register(kafkaStatusRoutes);
}

/**
 * Plugin event-emission route — registered in its OWN scope (not inside the
 * authenticated tenantScope) because plugin backends authenticate with an
 * X-Plugin-Service-Token (no user JWT). See middleware/plugin-event-auth.ts.
 */
export async function pluginEventRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(eventEmitRoutes);
}

export async function pluginTenantRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(devPluginRoutes);
  await fastify.register(marketplaceRoutes);
  await fastify.register(proxyRoutes);
  await fastify.register(installRoutes);
  await fastify.register(deactivateRoutes);
  await fastify.register(reactivateRoutes);
  await fastify.register(uninstallRoutes);
  await fastify.register(visibilityRoutes);

  startPeriodicHealthPolling(
    createContainerManager('sidecar'),
    () => extractInstallIds(getActiveConsumerGroups()),
    30_000,
  );

  // Dev mode: auto-register locally-running CRM backend if reachable.
  // The CRM example plugin runs on port 4000 (see examples/plugins/crm).
  if (config.NODE_ENV === 'development') {
    try {
      await fetch('http://localhost:4000/contacts', {
        signal: AbortSignal.timeout(2000),
        headers: { 'X-Plexica-Workspace-Id': 'probe' },
      });
      registerDevBackend('crm', { baseUrl: 'http://localhost:4000' });
      logger.info('Auto-registered CRM dev backend at http://localhost:4000');
    } catch {
      // CRM backend not running — container-based installs will handle routing.
    }
  }
}
