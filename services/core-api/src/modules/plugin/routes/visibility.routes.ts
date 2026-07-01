// routes/visibility.routes.ts
// Plugin workspace visibility routes.

import { z } from 'zod';

import { ValidationError, ForbiddenError } from '../../../lib/app-error.js';
import { withTenantDb } from '../../../lib/tenant-database.js';
import { requireAbac } from '../../../middleware/abac.js';
import { evaluate } from '../../../modules/abac/engine.js';
import { redis } from '../../../lib/redis.js';
import { setWorkspaceVisibility, clearVisibilityCache } from '../services/visibility.service.js';
import { updateVisibilityListSchema } from '../schema/api.js';

import type { FastifyInstance } from 'fastify';
import type { TenantPrismaClient } from '../../../lib/tenant-database.js';
import type { AbacContext } from '../../../modules/abac/types.js';

const installIdParamSchema = z.object({ installId: z.string().uuid() });

export async function visibilityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/api/v1/plugins/:installId/visibility',
    { preHandler: [requireAbac('plugin:manage')] },
    async (request) => {
      const { installId } = installIdParamSchema.parse(request.params);
      const ctx = request.tenantContext;

      return withTenantDb(async (tx: TenantPrismaClient) => {
        const installation = await tx.pluginInstallation.findUnique({ where: { id: installId } });
        if (!installation) return { installId, tenantDefault: 'enabled', overrides: [] };

        const overrides = await tx.pluginWorkspaceVisibility.findMany({
          where: { installId, isOverride: true },
        });

        return {
          installId,
          tenantDefault: installation.tenantDefaultVisibility,
          overrides: overrides.map((o: Record<string, unknown>) => ({
            workspaceId: o.workspaceId,
            isEnabled: o.isEnabled,
          })),
        };
      }, ctx);
    }
  );

  fastify.patch(
    '/api/v1/plugins/:installId/visibility',
    // DR-16/AC-03: workspace admins (not just tenant admins) may toggle
    // visibility for their OWN workspace. Requiring tenant-level plugin:manage
    // here would block the documented workspace-admin flow. Authorization is
    // enforced per workspaceId inside the handler via evaluate('workspace:update').
    async (request) => {
      const { installId } = installIdParamSchema.parse(request.params);
      const ctx = request.tenantContext;

      const parsed = updateVisibilityListSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues.map((i) => i.message).join(', '));
      }

      const updates = parsed.data;
      const userId = request.user?.keycloakUserId ?? '';
      const isTenantAdmin = request.user?.roles.includes('tenant_admin') ?? false;

      // Authorize: for each target workspace, the caller must be a workspace
      // admin (or tenant admin). Workspace:update requires the `admin` role.
      if (!isTenantAdmin) {
        for (const { workspaceId } of updates) {
          const abacCtx: AbacContext = {
            userId: request.user.id,
            workspaceId,
            tenantSlug: ctx.slug,
            action: 'workspace:update',
            isTenantAdmin,
          };
          const decision = await withTenantDb((tx) => evaluate(abacCtx, tx, redis), ctx);
          if (!decision.allowed) {
            throw new ForbiddenError(`Workspace admin required for workspace ${workspaceId}: ${decision.reason}`);
          }
        }
      }

      const results = await withTenantDb(async (tx: TenantPrismaClient) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (tx as any).$transaction(async (innerTx: TenantPrismaClient) => {
          const out: Array<{ workspaceId: string; isEnabled: boolean }> = [];
          for (const { workspaceId, isEnabled } of updates) {
            await setWorkspaceVisibility(innerTx, installId, workspaceId, isEnabled, userId);
            out.push({ workspaceId, isEnabled });
          }
          return out;
        });
      }, ctx);

      await clearVisibilityCache(installId);
      return { installId, overrides: results };
    }
  );
}
