// routes/dev.routes.ts
// Dev mode registration endpoints — gated by NODE_ENV=development.
// Allows plugin developers to register backends as local processes
// (no container build needed). See Plan §10.7.
//
// Mounted OUTSIDE the authenticated tenantScope (pluginDevRoutes in
// modules/plugin/index.ts): registerBackend() from @plexica/sdk/dev sends no
// user JWT. middleware/dev-route-auth.ts enforces NODE_ENV=development +
// loopback-only + X-Tenant-Slug. The isDev/loopback checks below are kept as
// defense-in-depth in case the routes are ever mounted without the middleware.

import { z } from 'zod';

import { config } from '../../../lib/config.js';
import { parseOrThrow } from '../../../lib/validation.js';
import { registerDevRuntime, unregisterDevRuntime } from '../services/dev-registration.service.js';
import {
  deleteDevPlugin,
  getDevPlugin,
  listDevPlugins,
  setDevPlugin,
} from '../services/dev-plugin-store.js';

import type { DevPluginEntry } from '../services/dev-plugin-store.js';
import type { FastifyInstance } from 'fastify';

const devRegisterSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  backendUrl: z.string().url(),
  installId: z.string().uuid().optional(),
  uiUrl: z.string().url().optional(),
  extensionPoints: z.array(z.string()).default([]),
  actions: z
    .array(
      z.object({
        action: z.string(),
        defaultRole: z.enum(['admin', 'member', 'viewer']),
      })
    )
    .optional(),
  events: z
    .object({
      subscribes: z.array(z.string()).default([]),
    })
    .optional(),
  declaredTables: z.array(z.string()).optional(),
});

const devUnregisterSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
});

export async function devPluginRoutes(fastify: FastifyInstance): Promise<void> {
  const isDev = config.NODE_ENV === 'development';

  // ── POST /api/v1/dev/plugins/register ────────────────────────────────────
  fastify.post('/api/v1/dev/plugins/register', async (request, reply) => {
    if (!isDev) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const remoteAddr = request.socket.remoteAddress;
    const isLoopback =
      remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
    if (!isLoopback) {
      return reply.status(403).send({ error: 'Dev registration is only available from localhost' });
    }

    const { slug, installId, backendUrl, uiUrl, extensionPoints, actions, events } = parseOrThrow(
      devRegisterSchema,
      request.body
    );

    const tenantSlug = request.tenantContext.slug;
    if (getDevPlugin(tenantSlug, slug)) {
      return reply.status(409).send({
        error: `Plugin "${slug}" is already registered in dev mode for tenant "${tenantSlug}". Unregister first, or restart the dev server.`,
      });
    }

    const entry: DevPluginEntry = {
      slug,
      backendUrl,
      tenantSlug,
      extensionPoints,
      actions: actions ?? [],
      events: events?.subscribes ?? [],
      registeredAt: new Date(),
    };
    if (installId) entry.installId = installId;
    if (uiUrl) entry.uiUrl = uiUrl;

    // Plan §10.7 step 5: register temporary plugin actions so dev ABAC
    // evaluation works. Actions are held in-memory only (no tenant-schema
    // write) — dev mode is localhost-only and ephemeral.
    // Plan §10.7 step 6: create a dev Kafka consumer group when the plugin
    // declares event subscriptions, so dev-mode plugins receive events.
    try {
      const consumerGroupId = await registerDevRuntime({
        slug,
        tenantSlug,
        backendUrl,
        extensionPoints,
        events: entry.events,
        ...(installId ? { installId } : {}),
        ...(uiUrl ? { uiUrl } : {}),
      });
      if (consumerGroupId) entry.consumerGroupId = consumerGroupId;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.warn(
        { err: msg, slug },
        'Failed to create dev consumer group — plugin will not receive events'
      );
    }

    setDevPlugin(tenantSlug, slug, entry);

    request.log.info(
      {
        slug,
        tenantSlug,
        backendUrl,
        actionCount: entry.actions.length,
        hasConsumer: !!entry.consumerGroupId,
      },
      'Plugin registered in dev mode'
    );

    return reply.status(200).send({
      status: 'ok',
      pluginUrl: `/api/v1/plugins/${slug}/proxy/*`,
      proxyTarget: backendUrl,
    });
  });

  // ── POST /api/v1/dev/plugins/unregister ──────────────────────────────────
  fastify.post('/api/v1/dev/plugins/unregister', async (request, reply) => {
    if (!isDev) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const { slug } = parseOrThrow(devUnregisterSchema, request.body);
    const tenantSlug = request.tenantContext.slug;
    const removed = deleteDevPlugin(tenantSlug, slug);
    if (!removed) {
      return reply.status(404).send({ error: `Plugin "${slug}" is not registered in dev mode` });
    }

    try {
      await unregisterDevRuntime(slug, removed.installId, removed.tenantSlug);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      request.log.warn({ err: msg, slug }, 'Failed to delete dev consumer group during unregister');
    }

    request.log.info({ slug, tenantSlug }, 'Plugin unregistered from dev mode');
    return reply.status(200).send({ status: 'ok', slug });
  });

  // ── GET /api/v1/dev/plugins — list dev-registered plugins (tenant-scoped) ─
  fastify.get('/api/v1/dev/plugins', async (request, reply) => {
    if (!isDev) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const tenantSlug = request.tenantContext.slug;
    const plugins = listDevPlugins(tenantSlug).map((p) => {
      const entry: Omit<DevPluginEntry, 'tenantSlug'> = {
        slug: p.slug,
        backendUrl: p.backendUrl,
        extensionPoints: p.extensionPoints,
        actions: p.actions,
        events: p.events,
        registeredAt: p.registeredAt,
      };
      if (p.installId) entry.installId = p.installId;
      if (p.uiUrl) entry.uiUrl = p.uiUrl;
      if (p.consumerGroupId) entry.consumerGroupId = p.consumerGroupId;
      return entry;
    });

    return reply.status(200).send({ data: plugins });
  });
}