// tenant-database.ts
// Tenant-scoped database access using a dedicated TenantPrismaClient.
//
// ARCHITECTURE NOTE (Decision Log ID-001 follow-up):
// The original implementation used `prisma.$transaction` with `SET LOCAL search_path`.
// This approach failed because the core Prisma client only knows core-schema models
// (Tenant, TenantConfig, …) and cannot access tenant-schema models (workspace,
// workspaceMember, invitation, auditLog, userProfile, …).
//
// The correct solution: create a TenantPrismaClient per request using the
// `?schema=<schemaName>` connection URL parameter. This is the same pattern
// already used by db.helpers.ts (buildTenantClient) and tested in integration.
//
// Trade-off: one extra PrismaClient per request (no connection pooling for
// tenant schemas). Acceptable for v2 phase 1; a PgBouncer/Prisma Accelerate
// layer can be added later if connection limits become a concern.
//
// M-04 NOTE: Fastify v5 runs each hook and route handler in its own
// async execution scope, so AsyncLocalStorage.enterWith() set in a
// preHandler does NOT propagate to the route handler. Route handlers
// must pass req.tenantContext explicitly as the second argument.
// The AsyncLocalStorage fallback (getTenantContext) is preserved for
// non-Fastify call sites (e.g. CLI scripts, standalone utilities).

// @ts-ignore — generated at build time via 'pnpm db:generate'
import { PrismaClient as TenantPrismaClient } from '../../generated/tenant-client/index.js';
import { getTenantContext } from './tenant-context-store.js';

import type { TenantContext } from './tenant-context-store.js';

export type { TenantPrismaClient };

/**
 * Executes a database callback within the current tenant's schema.
 *
 * Creates a TenantPrismaClient connected to the tenant's schema via the
 * `?schema=<schemaName>` connection URL parameter, runs the callback,
 * then disconnects. On error the client is disconnected and the error
 * is re-thrown.
 *
 * @param fn      - Callback that receives a TenantPrismaClient instance.
 * @param context - Tenant context. Pass `request.tenantContext` from Fastify
 *                  route handlers (required in Fastify v5 — AsyncLocalStorage
 *                  does not propagate from preHandler to route handler).
 *                  Falls back to AsyncLocalStorage for non-Fastify call sites.
 *
 * @example — Fastify route handler (pass context explicitly):
 *   fastify.get('/path', { preHandler: [tenantContextMiddleware] }, async (req) => {
 *     const workspaces = await withTenantDb(
 *       (db) => db.workspace.findMany(),
 *       req.tenantContext
 *     );
 *   });
 */
export async function withTenantDb<T>(
  fn: (db: InstanceType<typeof TenantPrismaClient>) => Promise<T>,
  context?: TenantContext
): Promise<T> {
  // Use explicit context when provided (required in Fastify v5 route handlers).
  // Fall back to AsyncLocalStorage for non-Fastify call sites.
  const { schemaName } = context ?? getTenantContext();

  const baseUrl = process.env['DATABASE_URL'] ?? '';
  const tenantUrl = baseUrl.includes('?')
    ? `${baseUrl}&schema=${schemaName}`
    : `${baseUrl}?schema=${schemaName}`;

  const tenantDb = new TenantPrismaClient({ datasources: { db: { url: tenantUrl } } });
  try {
    return await fn(tenantDb);
  } finally {
    await tenantDb.$disconnect();
  }
}
