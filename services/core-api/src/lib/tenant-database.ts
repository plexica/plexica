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

import type { Prisma } from '@prisma/client';

import { prisma } from './database.js';
import { getTenantContext } from './tenant-context-store.js';

/**
 * Executes a database callback within the current tenant's schema.
 *
 * Opens a PostgreSQL transaction, sets `SET LOCAL search_path` to the
 * tenant's schema, runs the callback, then commits. On error the
 * transaction rolls back automatically and search_path is restored.
 *
 * @example
 *   const workspaces = await withTenantDb((tx) => tx.workspace.findMany());
 */
export async function withTenantDb<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  // getTenantContext() reads from AsyncLocalStorage wired by enterWithTenant()
  // in tenant-context.ts. Throws InvalidTenantContextError if called outside
  // a tenant request scope.
  const { schemaName } = getTenantContext();

  return prisma.$transaction(async (tx) => {
    // schemaName is derived from slug via toSchemaName() which replaces hyphens
    // with underscores — only contains [a-z0-9_]. Safe for $executeRawUnsafe.
    // Controlled exception per Decision Log ID-001 (same validation applies).
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}",core,public`);
    return fn(tx);
  });
}
