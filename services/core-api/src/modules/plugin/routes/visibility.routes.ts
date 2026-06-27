// routes/visibility.routes.ts
// Plugin workspace visibility routes.

import { z } from 'zod';
import { ValidationError } from '../../../lib/app-error.js';
import { withTenantDb } from '../../../lib/tenant-database.js';
import { requireAbac } from '../../../middleware/abac.js';
import { setWorkspaceVisibility, clearVisibilityCache } from '../services/visibility.service.js';

import type { FastifyInstance } from 'fastify';

const updateVisibilitySchema = z.object({
  workspaceId: z.string().uuid(),
  isEnabled: z.boolean(),
});

export async function visibilityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/plugins/:installId/visibility',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
      const ctx = request.tenantContext;

      return withTenantDb(async (tx: any) => {
        const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
        if (!installation) return { installId, tenantDefault: 'enabled', overrides: [] };

        const overrides = await tx.pluginWorkspaceVisibility.findMany({
          where: { installId, isOverride: true },
        });

        return {
          installId,
          tenantDefault: installation.tenantDefaultVisibility,
          overrides: overrides.map((o: any) => ({
            workspaceId: o.workspaceId,
            isEnabled: o.isEnabled,
          })),
        };
      }, ctx);
    }
  );

  fastify.put(
    '/api/v1/plugins/:installId/visibility',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = request.params as { installId: string };
      const ctx = request.tenantContext;

      const parsed = updateVisibilitySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const { workspaceId, isEnabled } = parsed.data;

      await withTenantDb(async (tx: any) => {
        await setWorkspaceVisibility(tx, installId, workspaceId, isEnabled, request.user.keycloakUserId);
      }, ctx);

      clearVisibilityCache(installId);
      return { installId, workspaceId, isEnabled };
    }
  );
}
