// repository-mutations.ts
// Write-side data access for the user-management module.
// Split out of repository.ts to keep both files under the 200-line limit
// (constitution Rule 4). Read-side queries stay in repository.ts.
//
// Like repository.ts, every function accepts a type-erased tenant-schema Prisma
// client (unknown → any): either the plain client from withTenantDb() or an
// interactive $transaction client — the caller decides.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toClient(db: unknown): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db as any;
}

/**
 * Conditionally soft-deletes a profile.
 *
 * A conditional `updateMany` (WHERE deleted_at IS NULL) rather than `update`
 * so the "is this user still removable?" check and the write are one atomic
 * statement. Two concurrent removeUser() calls can both read the profile as
 * live, but only one UPDATE can match — the loser gets count 0 and aborts its
 * transaction instead of committing a no-op soft delete plus a duplicate audit
 * row and duplicate Keycloak calls.
 *
 * @returns the number of rows actually transitioned (0 or 1).
 */
export async function softDeleteProfile(db: unknown, userId: string): Promise<number> {
  const client = toClient(db);

  const result = (await client.userProfile.updateMany({
    where: { userId, deletedAt: null },
    data: { deletedAt: new Date(), status: 'disabled' },
  })) as { count: number };

  return result.count;
}

/**
 * Acquires a transaction-scoped PostgreSQL advisory lock keyed by tenant, so
 * concurrent removeUser() calls targeting tenant_admins of the SAME tenant
 * serialize: the second waits on the lock until the first COMMITs, then
 * re-reads the admin count and correctly throws 409 instead of both passing
 * the check and leaving zero active admins (TOCTOU race — see admin-guard.ts).
 *
 * Advisory lock, not SELECT ... FOR UPDATE: it expresses exactly the intended
 * invariant (one admin-removal critical section per tenant) without taking
 * row locks on user_profile rows that unrelated profile updates also touch.
 * `pg_advisory_xact_lock` is released automatically at COMMIT/ROLLBACK and
 * runs on the transaction's own connection under Prisma interactive
 * transactions. `hashtextextended` yields a 64-bit key, so cross-tenant
 * collisions (which would only cause harmless extra serialization) are
 * negligible.
 *
 * MUST be called on an interactive $transaction client: on a plain
 * (autocommit) client the xact lock would be released at statement end and
 * protect nothing. The lock key is a constant prefix plus the tenant UUID —
 * never user input — so $queryRawUnsafe is safe here. The subselect projects
 * a constant because pg_advisory_xact_lock returns `void`, which Prisma
 * cannot deserialize ("Failed to deserialize column of type 'void'").
 */
export async function lockTenantAdminRemoval(db: unknown, tenantId: string): Promise<void> {
  const client = toClient(db);

  await client.$queryRawUnsafe(
    'SELECT 1 AS "locked" FROM (SELECT pg_advisory_xact_lock(hashtextextended($1, 0))) AS "_lock"',
    `user-management:last-admin:${tenantId}`
  );
}

/**
 * Deletes every workspace membership of the user and returns the affected
 * workspace IDs.
 *
 * The IDs are read through the same client (and therefore, when the caller
 * passes a transaction client, the same transaction) as the DELETE, so the
 * caller can publish an ABAC revocation tombstone for exactly the workspaces
 * it just removed. Without that list a removed user keeps cached workspace
 * access until the ABAC cache TTL expires — see service-remove.ts.
 */
export async function removeAllMemberships(db: unknown, userId: string): Promise<string[]> {
  const client = toClient(db);

  const rows = (await client.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  })) as Array<{ workspaceId: string }>;

  await client.workspaceMember.deleteMany({ where: { userId } });

  return rows.map((r) => r.workspaceId);
}
