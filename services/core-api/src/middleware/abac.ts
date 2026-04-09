// abac.ts
// ABAC preHandler middleware factory — wraps evaluate() for Fastify routes.
// Implements: FR-013, FR-014, FR-018, plan §5.1.9
//
// Design note: TenantContext (from tenant-context-store) has no `.db` field.
// All tenant DB access goes through withTenantDb(), which opens a SET LOCAL
// search_path transaction. evaluate() receives the transaction client (tx).
// logDecision() is called fire-and-forget after the decision is made.

import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { withTenantDb } from '../lib/tenant-database.js';
import { evaluate, invalidateAbacCache } from '../modules/abac/engine.js';
import { logDecision } from '../modules/abac/decision-logger.js';
import { TENANT_LEVEL_ACTIONS } from '../modules/abac/policies.js';
import { ForbiddenError } from '../lib/app-error.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AbacContext } from '../modules/abac/types.js';

/**
 * requireAbac(action) — returns a Fastify preHandler for the given action.
 *
 * Usage:
 *   { preHandler: [authenticate, requireTenantContext, requireAbac('workspace:read')] }
 *
 * Requires: authenticate and requireTenantContext must run first.
 * workspaceId is extracted from route params (`:id` or `:workspaceId`).
 */
export function requireAbac(action: string) {
  return async function abacPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    // request.tenantContext is set by tenantContextMiddleware (see tenant-context.ts:179)
    const tenantCtx = request.tenantContext;
    const isTenantAdmin = request.user.roles.includes('tenant_admin');

    // Extract workspaceId from route params — supports both :id and :workspaceId
    const params = request.params as Record<string, string>;
    const workspaceId = params['workspaceId'] ?? params['id'] ?? '';

    // If there is no workspaceId in the URL, we cannot do workspace-level
    // membership checks. Two cases:
    //
    // 1. Tenant-level actions (workspace:create, audit:read, settings:*,
    //    branding:*, user:*, etc.) — require tenant_admin role.
    // 2. Workspace-scoped collection endpoints (workspace:read on
    //    GET /api/v1/workspaces) — allow through; the service layer
    //    filters results by the caller's memberships.
    if (workspaceId === '') {
      if (isTenantAdmin) return; // tenant admin — always allowed
      if (TENANT_LEVEL_ACTIONS.has(action)) {
        throw new ForbiddenError('Tenant admin role required');
      }
      // Non-admin on a workspace-scoped list endpoint — allow through,
      // service layer filters by membership.
      return;
    }

    const ctx: AbacContext = {
      userId: request.user.id,
      workspaceId,
      tenantSlug: tenantCtx.slug,
      action,
      isTenantAdmin,
    };

    // Run evaluate() inside a withTenantDb transaction so the Prisma client
    // has the correct search_path set (tenant schema isolation).
    const decision = await withTenantDb((tx) => evaluate(ctx, tx, redis), tenantCtx);

    // Fire-and-forget: log the decision asynchronously, never block the request.
    // Errors are logged (not silently swallowed) to maintain audit compliance.
    withTenantDb((tx) => logDecision(tx, ctx, decision), tenantCtx).catch((err) => {
      logger.error({ err, action: ctx.action, workspaceId }, 'ABAC decision log failed');
    });

    if (!decision.allowed) {
      logger.debug(
        { action, userId: ctx.userId, workspaceId, reason: decision.reason },
        'ABAC denied'
      );
      throw new ForbiddenError(`Access denied: ${decision.reason}`);
    }
  };
}

// Re-export invalidateAbacCache for use by service modules
export { invalidateAbacCache };
