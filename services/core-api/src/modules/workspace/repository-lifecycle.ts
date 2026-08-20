// repository-lifecycle.ts
// Archive / restore / hierarchy-path mutations for the Workspace module.
// Separated from repository.ts to respect the 200-line file limit (Rule 4).
// Re-exported by repository.ts, so existing import sites are unaffected.

import { assertNonTransactionalDb } from '../../lib/tenant-database.js';

import type { TenantDbClient, TenantPrismaClient } from '../../lib/tenant-database.js';

/** Accepts a plain client or a `$transaction` client. */
export async function archiveWorkspaces(tenantDb: TenantDbClient, ids: string[]): Promise<void> {
  await tenantDb.workspace.updateMany({
    where: { id: { in: ids } },
    data: { status: 'archived', archivedAt: new Date() },
  });
}

/** Accepts a plain client or a `$transaction` client. */
export async function restoreWorkspaces(tenantDb: TenantDbClient, ids: string[]): Promise<void> {
  await tenantDb.workspace.updateMany({
    where: { id: { in: ids } },
    data: { status: 'active', archivedAt: null },
  });
}

/**
 * Rewrites the materialized path of several workspaces atomically.
 *
 * REQUIRES A NON-TRANSACTIONAL CLIENT — unlike its neighbours above, which
 * accept either kind. This function opens its own batch transaction, and
 * Prisma's interactive-transaction clients do not expose `$transaction` —
 * since ADR-028 the parameter type (TenantPrismaClient, not the
 * TenantDbClient union) makes passing one a compile error. The runtime guard
 * below is kept as defence in depth for untyped call paths (plain test
 * doubles, JS callers).
 *
 * @param tenantDb - Non-transactional tenant-schema Prisma client.
 * @param updates  - Workspace id → new materialized path.
 */
export async function updateMaterializedPaths(
  tenantDb: TenantPrismaClient,
  updates: Array<{ id: string; materializedPath: string }>
): Promise<void> {
  assertNonTransactionalDb(tenantDb, 'updateMaterializedPaths');

  await tenantDb.$transaction(
    updates.map((u) =>
      tenantDb.workspace.update({
        where: { id: u.id },
        data: { materializedPath: u.materializedPath },
      })
    )
  );
}
