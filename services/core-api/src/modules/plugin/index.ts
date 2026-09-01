// index.ts
// Plugin module Fastify plugin — registers all plugin route groups.

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { devRouteAuth } from '../../middleware/dev-route-auth.js';

import { adminCatalogRoutes } from './routes/admin-catalog.routes.js';
import { adminPublishRoutes } from './routes/admin-publish.routes.js';
import { adminVersionsRoutes } from './routes/admin-versions.routes.js';
import { dlqRoutes } from './routes/dlq.routes.js';
import { devPluginRoutes } from './routes/dev.routes.js';
import { eventEmitRoutes } from './routes/events.routes.js';
import { marketplaceRoutes } from './routes/marketplace.routes.js';
import { proxyRoutes } from './routes/proxy.routes.js';
import { installRoutes } from './routes/lifecycle/install.routes.js';
import { deactivateRoutes } from './routes/lifecycle/deactivate.routes.js';
import { reactivateRoutes } from './routes/lifecycle/reactivate.routes.js';
import { uninstallRoutes } from './routes/lifecycle/uninstall.routes.js';
import { visibilityRoutes } from './routes/visibility.routes.js';
import {
  startPeriodicHealthPolling,
  stopPeriodicHealthPolling,
} from './services/health-polling.service.js';
import {
  startPeriodicRuntimeReconcile,
  stopPeriodicRuntimeReconcile,
} from './services/runtime-reconcile-poller.service.js';
import { createContainerManager } from './services/container-manager.service.js';
import { extractInstallIds, getActiveConsumerGroups } from './events/consumer-manager.service.js';
import { registerDevBackend } from './services/dev-backends.js';

import type { FastifyInstance } from 'fastify';

/**
 * Background lifecycle of the plugin module. Called by
 * bootstrap.startBackgroundServices() / stopBackgroundServices(), NOT by route
 * registration: a timer started while wiring routes has no teardown counterpart
 * and would keep hitting Redis after disconnectRedis() (same anti-pattern that
 * was already removed for the Kafka warm-up).
 */
export function startPluginHealthPolling(intervalMs = 30_000): void {
  startPeriodicHealthPolling(
    createContainerManager('sidecar'),
    () => extractInstallIds(getActiveConsumerGroups()),
    intervalMs
  );
}

export { stopPeriodicHealthPolling as stopPluginHealthPolling };

/**
 * Background consumer/credential reconciliation. Call from
 * bootstrap.startBackgroundServices() / stopBackgroundServices() — the same
 * ownership rule as the health poller: timers started while wiring routes
 * have no teardown counterpart.
 */
export function startPluginRuntimeReconcile(intervalMs = 300_000): void {
  startPeriodicRuntimeReconcile(intervalMs);
}

export { stopPeriodicRuntimeReconcile as stopPluginRuntimeReconcile };

export async function pluginAdminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(adminCatalogRoutes);
  await fastify.register(adminPublishRoutes);
  await fastify.register(adminVersionsRoutes);
  await fastify.register(dlqRoutes);
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
  await fastify.register(marketplaceRoutes);
  await fastify.register(proxyRoutes);
  await fastify.register(installRoutes);
  await fastify.register(deactivateRoutes);
  await fastify.register(reactivateRoutes);
  await fastify.register(uninstallRoutes);
  await fastify.register(visibilityRoutes);

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

/**
 * Dev-mode plugin registration routes — registered OUTSIDE the authenticated
 * tenantScope. Plugin dev backends call registerBackend() from @plexica/sdk/dev
 * with no user JWT; authMiddleware would reject them with 401 before the
 * handler runs. devRouteAuth gates on NODE_ENV=development + loopback + a
 * validated X-Tenant-Slug header instead. See middleware/dev-route-auth.ts.
 */
export async function pluginDevRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', devRouteAuth);
  await fastify.register(devPluginRoutes);
}
