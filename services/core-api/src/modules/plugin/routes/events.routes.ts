// routes/events.routes.ts
// Plugin event emission endpoint — accepts events from plugin backends via SDK.
// SDK posts to /api/v1/events/emit (see packages/sdk/src/index.ts).

import { z } from 'zod';

import { buildDomainEvent, jsonObjectSchema } from '../../../events/event-envelope.js';
import { enqueueEvent } from '../../../events/outbox-repository.js';
import { requireAbac } from '../../../middleware/abac.js';
import { ForbiddenError, ValidationError } from '../../../lib/app-error.js';
import { RESOURCE_SLUG_REGEX } from '../../../lib/slug.js';
import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { parseOrThrow } from '../../../lib/validation.js';

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TenantContext } from '../../../lib/tenant-context-store.js';

// Event type must be plugin.{slug}.{rest} — the slug segment is extracted and
// verified against installed plugins in the caller's tenant to prevent a plugin
// from emitting events impersonating another plugin.
const emitEventSchema = z.object({
  type: z
    .string()
    .min(1)
    .refine((v) => v.startsWith('plugin.'), 'Event type must start with "plugin."')
    .refine((v) => {
      const parts = v.split('.');
      // parts[0] === 'plugin', parts[1] === slug, parts[2+] === type path
      const slug = parts[1];
      return parts.length >= 3 && typeof slug === 'string' && RESOURCE_SLUG_REGEX.test(slug);
    }, 'Event type must be "plugin.{slug}.{type}" with a valid slug'),
  payload: jsonObjectSchema,
  timestamp: z.string().datetime({ offset: true }),
  correlationId: z.string().uuid(),
  causationId: z.string().uuid().nullable().optional(),
});

function extractSlug(eventType: string): string {
  return eventType.split('.')[1] ?? '';
}

/** Exported for unit testing. */
export const _testExtractSlug = extractSlug;
export const _testEmitEventSchema = emitEventSchema;

/**
 * Verifies that the plugin slug in the event type is installed (and not
 * uninstalled) in the caller's tenant. This prevents plugin event
 * impersonation — a plugin cannot emit events under another plugin's slug.
 */
async function verifyPluginInstalled(slug: string, tenantCtx: TenantContext): Promise<string> {
  const plugin = await withCoreDb((prisma) =>
    prisma.plugin.findUnique({ where: { slug }, select: { id: true } })
  );
  if (!plugin) {
    throw new ValidationError(`Plugin "${slug}" is not registered`);
  }

  const installation = await withTenantDb((db) => {
    return db.pluginInstallation.findFirst({
      where: { pluginId: plugin.id, status: { in: ['active', 'degraded'] } },
      select: { id: true },
    });
  }, tenantCtx);

  if (!installation) {
    throw new ValidationError(
      `Plugin "${slug}" is not installed in this tenant — cannot emit events on its behalf`
    );
  }
  return installation.id;
}

export async function eventEmitRoutes(fastify: FastifyInstance): Promise<void> {
  // Rate limiting: per-route @fastify/rate-limit config (100 req/min per IP,
  // Redis-backed — replaces the former in-memory preHandler that was
  // per-process and allowed N × max with N replicas).
  // codeql[js/missing-rate-limiting]
  fastify.post(
    '/api/v1/events/emit',
    {
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request) => {
      const { type, payload, correlationId, timestamp, causationId } = parseOrThrow(
        emitEventSchema,
        request.body
      );
      const slug = extractSlug(type);
      const ctx = request.tenantContext;

      const serviceIdentity = request.pluginServiceIdentity;
      let installId: string;
      if (serviceIdentity) {
        if (
          serviceIdentity.tenantId !== ctx.tenantId ||
          serviceIdentity.scope !== 'events:emit' ||
          !type.startsWith(`plugin.${serviceIdentity.pluginSlug}.`)
        )
          throw new ForbiddenError('Plugin service request denied');
        installId = serviceIdentity.installId;
      } else {
        installId = await verifyPluginInstalled(slug, ctx);
        const abacHandler = requireAbac('plugin:access');
        await abacHandler(request, {} as FastifyReply);
      }

      const event = buildDomainEvent({
        type,
        tenantId: ctx.tenantId,
        producer: { kind: 'plugin', id: installId },
        payload,
        occurredAt: timestamp,
        correlationId,
        ...(causationId === undefined ? {} : { causationId }),
      });
      await withCoreDb((db) => db.$transaction((tx) => enqueueEvent(tx, type, event)));

      return { status: 'accepted', type, correlationId, eventId: event.eventId };
    }
  );
}
