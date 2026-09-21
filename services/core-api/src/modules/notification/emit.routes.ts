// emit.routes.ts
// Plugin notification emission endpoint — POST /api/v1/notifications/emit
// (feature 006-05, ADR-035 Decision 5). Registered in the eventScope
// (pluginEventAuth), mirroring modules/plugin/routes/events.routes.ts: both
// the plugin service identity and the user JWT paths work, the plugin slug is
// verified installed, and emission is rate-limited (10/min/plugin/user, Redis).
// The notificationId is generated AT EMISSION and returned synchronously;
// persistence + SSE delivery are asynchronous via the notification consumer.

import { Topics } from '../../lib/kafka.js';
import { requireAbac } from '../../middleware/abac.js';
import { ForbiddenError, ValidationError } from '../../lib/app-error.js';
import { withCoreDb, withTenantDb } from '../../lib/tenant-database.js';
import { parseOrThrow } from '../../lib/validation.js';
import { buildDomainEvent } from '../../events/event-envelope.js';
import { enqueueEvent } from '../../events/outbox-repository.js';

import { emitRateLimiter } from './emit-rate-limit.js';
import { emitBodySchema } from './schema.js';

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { JsonObject } from '../../events/event-envelope.js';
import type { TenantContext } from '../../lib/tenant-context-store.js';

function extractSlug(notificationType: string): string {
  return notificationType.split('.')[1] ?? '';
}

/**
 * Verifies the plugin slug in the notification type is installed (active or
 * degraded) in the caller's tenant — a plugin cannot emit notifications under
 * another plugin's slug (impersonation guard, mirrors events.routes.ts).
 */
async function verifyPluginInstalled(slug: string, tenantCtx: TenantContext): Promise<string> {
  const plugin = await withCoreDb((db) =>
    db.plugin.findUnique({ where: { slug }, select: { id: true } })
  );
  if (!plugin) {
    throw new ValidationError(`Plugin "${slug}" is not registered`);
  }
  const installation = await withTenantDb(
    (db) =>
      db.pluginInstallation.findFirst({
        where: { pluginId: plugin.id, status: { in: ['active', 'degraded'] } },
        select: { id: true },
      }),
    tenantCtx
  );
  if (!installation) {
    throw new ValidationError(
      `Plugin "${slug}" is not installed in this tenant — cannot emit notifications on its behalf`
    );
  }
  return installation.id;
}

export async function notificationEmitRoutes(fastify: FastifyInstance): Promise<void> {
  // codeql[js/missing-rate-limiting] — per-route Redis-backed rate limit below
  // (mirrors POST /api/v1/events/emit). The 10/min/plugin/user Redis counter is
  // the authoritative emission cap (emit-rate-limit.ts, ADR-012).
  fastify.post(
    '/api/v1/notifications/emit',
    {
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = parseOrThrow(emitBodySchema, request.body);
      const slug = extractSlug(body.type);
      const ctx = request.tenantContext;

      const serviceIdentity = request.pluginServiceIdentity;
      let installId: string;
      if (serviceIdentity) {
        if (
          serviceIdentity.tenantId !== ctx.tenantId ||
          serviceIdentity.scope !== 'events:emit' ||
          !body.type.startsWith(`plugin.${serviceIdentity.pluginSlug}.`)
        )
          throw new ForbiddenError('Plugin service request denied');
        installId = serviceIdentity.installId;
      } else {
        installId = await verifyPluginInstalled(slug, ctx);
        const abacHandler = requireAbac('plugin:access');
        await abacHandler(request, {} as FastifyReply);
      }

      await emitRateLimiter.assert(ctx.tenantId, slug, body.userId);

      // notificationId generated at emission (ADR-035): it doubles as the
      // envelope event_id so the consumer's insert-ignore dedupe is keyed on
      // the exact identifier returned to the caller.
      const notificationId = crypto.randomUUID();
      const event = buildDomainEvent({
        eventId: notificationId,
        type: Topics.notification,
        tenantId: ctx.tenantId,
        producer: { kind: 'plugin', id: installId },
        occurredAt: body.timestamp,
        correlationId: body.correlationId,
        payload: {
          userId: body.userId,
          type: body.type,
          titleKey: body.titleKey,
          ...(body.titleParams === undefined ? {} : { titleParams: body.titleParams }),
          ...(body.bodyKey === undefined ? {} : { bodyKey: body.bodyKey }),
          ...(body.metadata === undefined ? {} : { metadata: body.metadata as JsonObject }),
          notificationId,
        },
      });
      await withCoreDb((db) =>
        db.$transaction((tx) => enqueueEvent(tx, Topics.notification, event))
      );

      // ADR-035 Decision 5: 202 { status: "accepted", notificationId } — the
      // notificationId is returned synchronously; persistence + delivery are
      // asynchronous via the notification consumer. Explicit 202 (a plain
      // object return would default to 200).
      return reply.code(202).send({ status: 'accepted', notificationId });
    }
  );
}

/** Exported for unit testing the slug extraction. */
export const _testExtractSlug = extractSlug;
