// abac.ts
// ABAC preHandler middleware factory — wraps evaluate() for Fastify routes.
// Implements: FR-013, FR-014, FR-018, plan §5.1.9
//
// Design note: TenantContext (from tenant-context-store) has no `.db` field.
// All tenant DB access goes through withTenantDb(), which does NOT open a
// transaction: it hands the callback the CACHED TenantPrismaClient bound to
// the tenant schema via the `?schema=<schemaName>` connection URL parameter
// (ADR-027 — the LRU cache in tenant-db-cache.ts owns the client lifecycle;
// nothing disconnects on the request path).
// Consequences for this file:
//   - the callback argument is a plain client (`db`), not a transaction client;
//     nothing here is atomic, and no `SET LOCAL search_path` is involved;
//   - the callback must do all tenant DB work in ONE withTenantDb() call —
//     evaluate() and logDecision() share the same cached client;
//   - anything not awaited inside the callback runs after the cache pin is
//     released, when an LRU/TTL eviction could $disconnect() the client
//     mid-query (tenant-db-cache-eviction.ts).

import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { withTenantDb } from '../lib/tenant-database.js';
import { evaluate, setAbacMembership, tenantAdminBypassDecision } from '../modules/abac/engine.js';
import { logDecision, shouldSampleDecision } from '../modules/abac/decision-logger.js';
import { TENANT_LEVEL_ACTIONS } from '../modules/abac/policies.js';
import { ForbiddenError } from '../lib/app-error.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { TenantContext } from '../lib/tenant-context-store.js';
import type { AbacContext, AbacDecision } from '../modules/abac/types.js';

/**
 * Persists a decision that was reached without any tenant DB access, acquiring
 * the cached tenant client (ADR-027) ONLY when the sample is kept. Never throws.
 */
async function logSampledDecision(
  ctx: AbacContext,
  decision: AbacDecision,
  tenantCtx: TenantContext
): Promise<void> {
  if (!shouldSampleDecision()) return;
  await withTenantDb((db) => logDecision(db, ctx, decision), tenantCtx).catch((err: unknown) => {
    logger.error(
      { err: String(err), action: ctx.action, workspaceId: ctx.workspaceId },
      'ABAC decision log failed'
    );
  });
}

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

    // Tenant-admin fast path. evaluate() short-circuits on isTenantAdmin as its
    // very first statement (engine.ts §1) without issuing a single query, so
    // routing this case through withTenantDb() would only pin a cache entry —
    // since ADR-027 the client is reused from the LRU cache, not constructed
    // and disconnected per call (and Prisma connects lazily, so a callback
    // that issues no query never opens a connection). The bypass is still
    // hoisted above withTenantDb() to skip even the cache pin; the decision
    // is still recorded, and only a kept sample touches the client cache.
    if (isTenantAdmin) {
      await logSampledDecision(ctx, tenantAdminBypassDecision(action), tenantCtx);
      return;
    }

    // Single withTenantDb() call: evaluate() and the decision log share the
    // tenant's cached Prisma client (ADR-027). NOTE: the sampling gate below
    // runs INSIDE the callback, i.e. after evaluate() has already run its
    // queries on the client — it saves the decision-log INSERT and nothing
    // else. Only the tenant-admin fast path above avoids the cache entirely.
    //
    // The decision log must never influence the authorization outcome: it is
    // awaited (once the callback returns the cache pin is released and an
    // eviction could disconnect the client mid-INSERT) but any failure is
    // logged and swallowed, and `d` is returned regardless.
    const decision = await withTenantDb(async (db) => {
      const d = await evaluate(ctx, db, redis);
      if (shouldSampleDecision()) {
        await logDecision(db, ctx, d).catch((err: unknown) => {
          logger.error(
            { err: String(err), action: ctx.action, workspaceId },
            'ABAC decision log failed'
          );
        });
      }
      return d;
    }, tenantCtx);

    if (!decision.allowed) {
      logger.debug(
        { action, userId: ctx.userId, workspaceId, reason: decision.reason },
        'ABAC denied'
      );
      throw new ForbiddenError(`Access denied: ${decision.reason}`);
    }
  };
}

// Re-exported for use by service modules.
// setAbacMembership is the ONLY supported way to mutate a membership cache
// entry: pass the post-mutation state (role: null = no longer a member).
// There is deliberately no delete/invalidate counterpart — see engine.ts.
export { setAbacMembership };
