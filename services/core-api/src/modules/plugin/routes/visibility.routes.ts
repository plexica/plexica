// routes/visibility.routes.ts
// Plugin workspace visibility routes.

import { z } from 'zod';
import { ValidationError } from '../../../lib/app-error.js';
import { withTenantDb } from '../../../lib/tenant-database.js';
import { requireAbac } from '../../../middleware/abac.js';
import { setWorkspaceVisibility, clearVisibilityCache } from '../services/visibility.service.js';
import { updateVisibilityListSchema } from '../schema/api.js';

import type { FastifyInstance } from 'fastify';

const installIdParamSchema = z.object({ installId: z.string().uuid() });

export async function visibilityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/plugins/:installId/visibility',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = installIdParamSchema.parse(request.params);
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

  fastify.patch(
    '/api/v1/plugins/:installId/visibility',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = installIdParamSchema.parse(request.params);
      const ctx = request.tenantContext;

      const parsed = updateVisibilityListSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const updates = parsed.data;
      const userId = request.user?.keycloakUserId ?? '';

      const results = await withTenantDb(async (tx: any) => {
        return tx.$transaction(async (innerTx: any) => {
          const out: Array<{ workspaceId: string; isEnabled: boolean }> = [];
          for (const { workspaceId, isEnabled } of updates) {
            await setWorkspaceVisibility(innerTx, installId, workspaceId, isEnabled, userId);
            out.push({ workspaceId, isEnabled });
          }
          return out;
        });
      }, ctx);

      clearVisibilityCache(installId);
      return { installId, overrides: results };
    }
  );
}
