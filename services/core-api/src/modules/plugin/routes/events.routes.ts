// routes/events.routes.ts
// Plugin event emission endpoint — accepts events from plugin backends via SDK.
// SDK posts to /api/v1/events/emit (see packages/sdk/src/index.ts).

import { z } from 'zod';

import { emitEvent } from '../../../lib/kafka.js';
import { requireAbac } from '../../../middleware/abac.js';
import { ValidationError, ForbiddenError } from '../../../lib/app-error.js';
import { logger } from '../../../lib/logger.js';
import { withCoreDb, withTenantDb } from '../../../lib/tenant-database.js';
import { verifyServiceToken } from '../services/service-token.js';

import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TenantContext } from '../../../lib/tenant-context-store.js';

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;
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
      return parts.length >= 3 && typeof slug === 'string' && SLUG_REGEX.test(slug);
    }, 'Event type must be "plugin.{slug}.{type}" with a valid slug'),
  payload: z.any(),
  timestamp: z.string(),
  correlationId: z.string().min(1),
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
async function verifyPluginInstalled(
  slug: string,
  tenantCtx: TenantContext
): Promise<void> {
  const plugin = await withCoreDb((prisma) =>
    prisma.plugin.findUnique({ where: { slug }, select: { id: true } })
  );
  if (!plugin) {
    throw new ValidationError(`Plugin "${slug}" is not registered`);
  }

  const installation = await withTenantDb((tx) => {
    return tx.pluginInstallation.findFirst({
      where: { pluginId: plugin.id, status: { in: ['active', 'degraded', 'deactivated', 'installing'] } },
      select: { id: true },
    });
  }, tenantCtx);

  if (!installation) {
    throw new ValidationError(`Plugin "${slug}" is not installed in this tenant — cannot emit events on its behalf`);
  }
}

export async function eventEmitRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/api/v1/events/emit',
    // Auth + tenant context are resolved by the pluginEventAuth preHandler
    // (registered in the route's scope in src/index.ts). It handles both the
    // service-token path (plugin backends, no JWT) and the Bearer-JWT path
    // (user-initiated). This handler only enforces event-namespace integrity.
    async (request) => {
      const parsed = emitEventSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const { type, payload, correlationId } = parsed.data;
      const slug = extractSlug(type);
      const ctx = request.tenantContext;

      const serviceToken = request.headers['x-plugin-service-token'];
      if (typeof serviceToken === 'string' && serviceToken.length > 0) {
        // Plugin-backend path: pluginEventAuth already verified the token +
        // resolved the tenant. Re-extract the payload (cheap HMAC) to get the
        // installId, then confirm the installation's plugin slug matches the
        // event namespace — prevents a plugin emitting under another's slug.
        const tokenPayload = verifyServiceToken(serviceToken);
        if (!tokenPayload) throw new ForbiddenError('Invalid plugin service token');
        const installation = await withTenantDb((tx) => {
          return tx.pluginInstallation.findUnique({
            where: { id: tokenPayload.installId },
            select: { status: true, pluginId: true },
          });
        }, ctx);
        if (!installation || ['uninstalled', 'failed'].includes(installation.status)) {
          throw new ForbiddenError(`Installation ${tokenPayload.installId} is not active`);
        }
        const plugin = await withCoreDb((db) =>
          db.plugin.findUnique({ where: { id: installation.pluginId }, select: { slug: true } }),
        );
        if (!plugin || plugin.slug !== slug) {
          throw new ForbiddenError(`Service token does not match event slug "${slug}"`);
        }
      } else {
        // User-initiated path — pluginEventAuth ran authMiddleware +
        // tenantContextMiddleware. Enforce ABAC plugin:access (tenant-level).
        const abacHandler = requireAbac('plugin:access');
        await abacHandler(request, {} as FastifyReply);
        await verifyPluginInstalled(slug, ctx);
      }

      try {
        await emitEvent(type, payload as Record<string, unknown>, correlationId);
      } catch (err) {
        logger.error({ err, eventType: type }, 'Failed to emit plugin event');
        throw err;
      }

      return { status: 'emitted', type, correlationId };
    }
  );
}
