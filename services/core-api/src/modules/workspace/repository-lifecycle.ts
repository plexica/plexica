// repository-lifecycle.ts
// Archive / restore / hierarchy-path mutations for the Workspace module.
// Separated from repository.ts to respect the 200-line file limit (Rule 4).
// Re-exported by repository.ts, so existing import sites are unaffected.

import { assertNonTransactionalDb } from '../../lib/tenant-database.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(tenantDb: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tenantDb as any;
}

/** Accepts a plain client or a `$transaction` client. */
export async function archiveWorkspaces(tenantDb: unknown, ids: string[]): Promise<void> {
  await db(tenantDb).workspace.updateMany({
    where: { id: { in: ids } },
    data: { status: 'archived', archivedAt: new Date() },
  });
}

/** Accepts a plain client or a `$transaction` client. */
export async function restoreWorkspaces(tenantDb: unknown, ids: string[]): Promise<void> {
  await db(tenantDb).workspace.updateMany({
    where: { id: { in: ids } },
    data: { status: 'active', archivedAt: null },
  });
}

/**
 * Rewrites the materialized path of several workspaces atomically.
 *
 * REQUIRES A NON-TRANSACTIONAL CLIENT — unlike its neighbours above, which
 * accept either kind. This function opens its own batch transaction, and
 * Prisma's interactive-transaction clients do not expose `$transaction`, so
 * passing one in would fail with `db(tenantDb).$transaction is not a function`
 * at runtime. `tenantDb` is `unknown`, so the typechecker cannot catch that;
 * the guard below converts the opaque TypeError into an explicit diagnostic.
 * See lib/tenant-database.ts for why this is not enforced by the type system.
 *
 * @param tenantDb - Non-transactional tenant-schema Prisma client.
 * @param updates  - Workspace id → new materialized path.
 */
export async function updateMaterializedPaths(
  tenantDb: unknown,
  updates: Array<{ id: string; materializedPath: string }>
): Promise<void> {
  assertNonTransactionalDb(tenantDb, 'updateMaterializedPaths');

  await db(tenantDb).$transaction(
    updates.map((u) =>
      db(tenantDb).workspace.update({
        where: { id: u.id },
        data: { materializedPath: u.materializedPath },
      })
    )
  );
}
