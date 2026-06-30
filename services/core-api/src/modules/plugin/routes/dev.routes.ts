// routes/dev.routes.ts
// Dev mode registration endpoints — gated by NODE_ENV=development.
// Allows plugin developers to register backends as local processes
// (no container build needed). See Plan §10.7.

import { z } from 'zod';
import { config } from '../../../lib/config.js';
import { ValidationError } from '../../../lib/app-error.js';
import { registerDevBackend, unregisterDevBackend } from '../services/proxy.service.js';

import type { FastifyInstance } from 'fastify';

// In-memory store of dev-registered plugins
const devPlugins = new Map<string, {
  slug: string;
  backendUrl: string;
  uiUrl?: string;
  extensionPoints: string[];
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

    const { slug, backendUrl, uiUrl, extensionPoints } = parsed.data;

    if (devPlugins.has(slug)) {
      return reply.status(409).send({
        error: `Plugin "${slug}" is already registered in dev mode. Unregister first, or restart the dev server.`,
      });
    }

    const devEntry: {
      slug: string; backendUrl: string; uiUrl?: string;
      extensionPoints: string[]; registeredAt: Date;
    } = { slug, backendUrl, extensionPoints, registeredAt: new Date() };
    if (uiUrl) devEntry.uiUrl = uiUrl;
    devPlugins.set(slug, devEntry);

    // Register the dev backend with the proxy service (slug-keyed).
    registerDevBackend(slug, { baseUrl: backendUrl });

    request.log.info({ slug, backendUrl }, 'Plugin registered in dev mode');

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
    const removed = devPlugins.delete(slug);
    if (!removed) {
      return reply.status(404).send({ error: `Plugin "${slug}" is not registered in dev mode` });
    }

    unregisterDevBackend(slug);

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
        registeredAt: Date;
      } = { slug: p.slug, backendUrl: p.backendUrl, extensionPoints: p.extensionPoints, registeredAt: p.registeredAt };
      if (p.uiUrl) entry.uiUrl = p.uiUrl;
      return entry;
    });

    return reply.status(200).send({ data: plugins });
  });
}
