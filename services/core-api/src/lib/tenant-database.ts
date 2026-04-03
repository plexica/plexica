// tenant-database.ts
// Transaction-scoped database access for tenant schemas.
//
// H-1 FIX: The global `prisma` client uses a connection pool. Calling
// `SET search_path` on a pooled connection is unreliable because the
// connection is returned to the pool immediately and may be reused by a
// concurrent request before that request sets its own search_path.
//
// The correct solution: wrap every tenant data query in a `$transaction`
// that starts with `SET LOCAL search_path`. SET LOCAL resets when the
// transaction commits or rolls back, ensuring the connection is clean
// before it returns to the pool.
//
// Route handlers MUST use withTenantDb() for all tenant-specific data
// access instead of the global prisma client.
//
// M-04 NOTE: Fastify v5 runs each hook and route handler in its own
// async execution scope, so AsyncLocalStorage.enterWith() set in a
// preHandler does NOT propagate to the route handler. Route handlers
// must pass req.tenantContext explicitly as the second argument.
// The AsyncLocalStorage fallback (getTenantContext) is preserved for
// non-Fastify call sites (e.g. CLI scripts, standalone utilities).

import { prisma } from './database.js';
import { getTenantContext } from './tenant-context-store.js';

import type { TenantContext } from './tenant-context-store.js';
import type { Prisma } from '@prisma/client';

/**
 * Executes a database callback within the current tenant's schema.
 *
 * Opens a PostgreSQL transaction, sets `SET LOCAL search_path` to the
 * tenant's schema, runs the callback, then commits. On error the
 * transaction rolls back automatically and search_path is restored.
 *
 * @param fn     - Callback that receives a Prisma transaction client.
 * @param context - Tenant context. Pass `request.tenantContext` from Fastify
 *                  route handlers (required in Fastify v5 — AsyncLocalStorage
 *                  does not propagate from preHandler to route handler).
 *                  Falls back to AsyncLocalStorage for non-Fastify call sites.
 *
 * @example — Fastify route handler (pass context explicitly):
 *   fastify.get('/path', { preHandler: [tenantContextMiddleware] }, async (req) => {
 *     const workspaces = await withTenantDb((tx) => tx.workspace.findMany(), req.tenantContext);
 *   });
 */
export async function withTenantDb<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  context?: TenantContext
): Promise<T> {
  // Use explicit context when provided (required in Fastify v5 route handlers).
  // Fall back to AsyncLocalStorage for non-Fastify call sites.
  const { schemaName } = context ?? getTenantContext();

  return prisma.$transaction(async (tx) => {
    // schemaName is derived from slug via toSchemaName() which replaces hyphens
    // with underscores — only contains [a-z0-9_]. Safe for $executeRawUnsafe.
    // Controlled exception per Decision Log ID-001 (same validation applies).
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}",core,public`);
    return fn(tx);
  });
}
