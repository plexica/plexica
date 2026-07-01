// routes/dev.routes.ts
// Dev mode registration endpoints — gated by NODE_ENV=development.
// Allows plugin developers to register backends as local processes
// (no container build needed). See Plan §10.7.

import { z } from 'zod';

import { config } from '../../../lib/config.js';
import { ValidationError } from '../../../lib/app-error.js';
import { registerDevBackend, unregisterDevBackend } from '../services/proxy.service.js';
import { createDevConsumerGroup, deleteDevConsumerGroup } from '../events/consumer-manager.service.js';

import type { FastifyInstance } from 'fastify';

// In-memory store of dev-registered plugins
const devPlugins = new Map<string, {
  slug: string;
  backendUrl: string;
  uiUrl?: string;
  extensionPoints: string[];
  actions: Array<{ action: string; defaultRole: string }>;
  events: string[];
  consumerGroupId?: string;
  registeredAt: Date;
}>();

const devRegisterSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,62}$/),
  backendUrl: z.string().url(),
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
    const isLoopback = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
    if (!isLoopback) {
      return reply.status(403).send({ error: 'Dev registration is only available from localhost' });
    }

    const parsed = devRegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const { slug, backendUrl, uiUrl, extensionPoints, actions, events } = parsed.data;

    if (devPlugins.has(slug)) {
      return reply.status(409).send({
        error: `Plugin "${slug}" is already registered in dev mode. Unregister first, or restart the dev server.`,
      });
    }

    const devEntry: {
      slug: string; backendUrl: string; uiUrl?: string;
      extensionPoints: string[];
      actions: Array<{ action: string; defaultRole: string }>;
      events: string[];
      consumerGroupId?: string;
      registeredAt: Date;
    } = { slug, backendUrl, extensionPoints, actions: actions ?? [], events: events?.subscribes ?? [], registeredAt: new Date() };
    if (uiUrl) devEntry.uiUrl = uiUrl;

    // Plan §10.7 step 5: register temporary plugin actions so dev ABAC
    // evaluation works. Actions are held in-memory only (no tenant-schema
    // write) — dev mode is localhost-only and ephemeral.
    // Plan §10.7 step 6: create a dev Kafka consumer group when the plugin
    // declares event subscriptions, so dev-mode plugins receive events.
    if (devEntry.events.length > 0) {
      try {
        devEntry.consumerGroupId = await createDevConsumerGroup(slug);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.warn({ err: msg, slug }, 'Failed to create dev consumer group — plugin will not receive events');
      }
    }

    devPlugins.set(slug, devEntry);

    // Register the dev backend with the proxy service (slug-keyed).
    registerDevBackend(slug, { baseUrl: backendUrl });

    request.log.info({ slug, backendUrl, actionCount: devEntry.actions.length, hasConsumer: !!devEntry.consumerGroupId }, 'Plugin registered in dev mode');

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

    const parsed = devUnregisterSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
    }

    const { slug } = parsed.data;
    const removed = devPlugins.get(slug);
    if (!removed) {
      return reply.status(404).send({ error: `Plugin "${slug}" is not registered in dev mode` });
    }
    devPlugins.delete(slug);

    unregisterDevBackend(slug);

    // Plan §10.7 teardown: clean up the dev Kafka consumer group if one was
    // created during registration.
    if (removed.consumerGroupId) {
      try {
        await deleteDevConsumerGroup(slug);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.warn({ err: msg, slug }, 'Failed to delete dev consumer group during unregister');
      }
    }

    request.log.info({ slug }, 'Plugin unregistered from dev mode');
    return reply.status(200).send({ status: 'ok', slug });
  });

  // ── GET /api/v1/dev/plugins — list dev-registered plugins ────────────────
  fastify.get('/api/v1/dev/plugins', async (request, reply) => {
    if (!isDev) {
      return reply.status(404).send({ error: 'Not found' });
    }

    const plugins = Array.from(devPlugins.values()).map((p) => {
      const entry: {
        slug: string;
        backendUrl: string;
        uiUrl?: string;
        extensionPoints: string[];
        actions: Array<{ action: string; defaultRole: string }>;
        events: string[];
        consumerGroupId?: string;
        registeredAt: Date;
      } = { slug: p.slug, backendUrl: p.backendUrl, extensionPoints: p.extensionPoints, actions: p.actions, events: p.events, registeredAt: p.registeredAt };
      if (p.uiUrl) entry.uiUrl = p.uiUrl;
      if (p.consumerGroupId) entry.consumerGroupId = p.consumerGroupId;
      return entry;
    });

    return reply.status(200).send({ data: plugins });
  });
}
