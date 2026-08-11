// writer.ts
// Awaited, non-throwing audit log writer.
// Implements: FR-021, NFR-03, DR-08, plan §5.1.7

import { logger } from '../../lib/logger.js';
import { assertNonTransactionalDb } from '../../lib/tenant-database.js';

import type { AuditLogEntry } from './types.js';

/**
 * Writes an entry to the tenant's audit_log table.
 *
 * Awaiting: callers must `await` this call. `withTenantDb` disconnects the
 * tenant Prisma client in its `finally` block, so an un-awaited write would be
 * silently dropped when the client goes away mid-INSERT. Awaiting keeps the
 * client alive until the INSERT has completed.
 *
 * Rejection: the returned promise never rejects for a *database* failure — a
 * failed INSERT is caught and reported through Pino. The one exception is the
 * transaction-safety guard below, which throws in EVERY environment
 * (production included) because it signals a programming error, not a runtime
 * fault — see assertNonTransactionalDb in lib/tenant-database.ts.
 *
 * TRANSACTION SAFETY — READ BEFORE USE:
 * Swallowing the rejection does NOT undo the failure at the database level.
 * If the INSERT is issued on an interactive `$transaction` client, PostgreSQL
 * puts that transaction into the aborted state (SQLSTATE 25P02); every
 * subsequent statement fails with "current transaction is aborted" and the
 * COMMIT degrades into a ROLLBACK. Because the JS rejection is hidden, the
 * caller has no signal that this happened — in the worst case the API returns
 * a success response for data that was never persisted.
 *
 * Therefore: DO NOT call `writeAuditLog` inside an interactive `$transaction`.
 * Invoke it on a non-transactional tenant client, after the transaction has
 * committed. Services that run inside a transaction should build the entry and
 * return it to their caller (see workspace/audit-entries.ts) so the caller can
 * persist it post-COMMIT. Audit logging is an observational side-effect: its
 * failure must never roll back the business operation it describes.
 *
 * This is enforced at runtime by `assertNonTransactionalDb`, not by the type
 * system — see the feasibility note in lib/tenant-database.ts for why a
 * branded type does not work here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOT THE SAME CONTRACT AS `admin/services/audit-log.service.ts#writeAuditEntry`
 *
 * The codebase has two audit writers with deliberately OPPOSITE transactional
 * contracts. Pick by asking: "if the audit row is lost, is the business
 * operation still correct?"
 *
 *   writeAuditLog (this function) — TENANT audit_log, observational.
 *     Outside a transaction; swallows DB errors. Losing the row must never
 *     fail or roll back the user action it describes (workspace renamed,
 *     member added…). Availability of the operation wins over completeness of
 *     the trail.
 *
 *   writeAuditEntry (admin) — CORE platform_audit_log, compliance evidence.
 *     Inside the transaction; propagates errors. It records privileged
 *     super-admin actions (tenant suspend/reactivate, GDPR purge) where the
 *     record IS part of the operation's correctness. If it cannot be written,
 *     the operation must not be considered to have happened, so the
 *     transaction rolls back. Completeness of the trail wins.
 *
 * The "DO NOT call inside $transaction" rule above is specific to THIS writer.
 * It does not generalise to `writeAuditEntry`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param tenantDb - Non-transactional tenant-schema Prisma client (type-erased)
 * @param entry    - Structured audit log entry
 */
export async function writeAuditLog(
  tenantDb: unknown, // tenant-schema PrismaClient, type-erased pending prisma generate
  entry: AuditLogEntry
): Promise<void> {
  // The `unknown` parameter cannot express "not a transaction client", so the
  // constraint documented above is checked here instead of at compile time.
  assertNonTransactionalDb(tenantDb, 'writeAuditLog');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = tenantDb as any;

  // Awaited (not returned) so the INSERT lands before the client disconnects
  // while the declared `Promise<void>` stays truthful — `create()` resolves
  // with the persisted record, which is not part of this contract.
  await db.auditLog
    .create({
      data: {
        actorId: entry.actorId,
        actionType: entry.actionType,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        beforeValue: entry.beforeValue ?? null,
        afterValue: entry.afterValue ?? null,
        ipAddress: entry.ipAddress ?? null,
      },
    })
    .catch((err: unknown) => {
      // Log only non-sensitive identifiers. The full entry must never reach the
      // logs: `ipAddress` is PII under GDPR and `beforeValue`/`afterValue` can
      // carry arbitrary domain data (AGENTS.md — Security rule 6).
      logger.error(
        {
          err: String(err),
          actionType: entry.actionType,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          actorId: entry.actorId,
        },
        'Failed to write audit log entry'
      );
    });
}
