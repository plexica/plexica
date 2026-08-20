// decision-logger.ts
// Non-throwing ABAC decision log writer.
// Implements: FR-015, NFR-08, DR-09, AC-07

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { assertNonTransactionalDb } from '../../lib/tenant-database.js';

import type { TenantPrismaClient } from '../../lib/tenant-database.js';
import type { AbacContext, AbacDecision } from './types.js';

/**
 * Returns true when this decision should be persisted to the decision log.
 *
 * What the gate actually saves: one INSERT. Nothing more.
 *
 * It lives outside logDecision() so callers can express "don't log this one"
 * without entering the write path, but on the main ABAC route the gate is
 * evaluated INSIDE the withTenantDb() callback — i.e. after evaluate() has
 * already caused a TenantPrismaClient to be constructed and connected. An
 * earlier revision of this comment claimed the gate let callers skip acquiring
 * a DB client; that stopped being true when evaluate() and logDecision() were
 * unified onto a single shared client. The only caller that genuinely avoids a
 * connection is the tenant-admin fast path in middleware/abac.ts, which checks
 * the gate BEFORE calling withTenantDb() at all.
 *
 * Sampling rate controlled by ABAC_DECISION_LOG_SAMPLE_RATE (0.0–1.0).
 * Math.random() returns [0, 1), so the comparison must be strict `<`:
 * with `<=`, rate=0 would still log whenever Math.random() returned exactly 0.
 * With `<`, rate=0 never logs and rate=1 always logs.
 */
export function shouldSampleDecision(): boolean {
  return Math.random() < config.ABAC_DECISION_LOG_SAMPLE_RATE;
}

/**
 * Writes an ABAC decision to the tenant's abac_decision_log table.
 *
 * The returned promise settles only once the INSERT has completed, so callers
 * must await it before their `withTenantDb` callback returns. Since ADR-027
 * the client is NOT disconnected when the callback returns — `withTenantDb`
 * only releases the cache pin (`releaseTenantClient`). But once the callback
 * returns the cached entry is idle and becomes evictable: an LRU-cap or TTL
 * eviction (tenant-db-cache-eviction.ts) `$disconnect()`s the client, which
 * rejects any query still in flight. Awaiting keeps the INSERT inside the
 * pin window, so it always completes on a live client.
 * Write failures are logged and swallowed so that a decision-log outage can
 * never fail the request being authorized.
 *
 * TRANSACTION SAFETY: like `writeAuditLog`, this writer swallows its own
 * database errors, so it must run OUTSIDE an interactive `$transaction` —
 * a failed INSERT would otherwise abort the surrounding transaction
 * (SQLSTATE 25P02) and turn its COMMIT into a silent ROLLBACK. Enforced at
 * compile time by the `TenantPrismaClient` parameter (a transaction client
 * does not typecheck — lib/tenant-database.ts names the decision logger
 * among the functions that must stay out of transactions) AND at runtime by
 * `assertNonTransactionalDb`, kept as defence in depth for untyped call
 * paths. Same contract as audit-log/writer.ts.
 *
 * Callers are responsible for the sampling gate — see shouldSampleDecision().
 * Implements: FR-015, NFR-08, DR-09, AC-07
 */
export async function logDecision(
  tenantDb: TenantPrismaClient,
  ctx: AbacContext,
  decision: AbacDecision
): Promise<void> {
  // Compile-time: the TenantPrismaClient parameter already rejects transaction
  // clients. Runtime: the guard stays as defence in depth for untyped callers.
  assertNonTransactionalDb(tenantDb, 'logDecision');

  // resourceId is nullable (UUID | null) — pass null when workspaceId is empty
  // so routes without a workspace param don't fail with a UUID format error.
  const resourceId = ctx.workspaceId !== '' ? ctx.workspaceId : null;

  // Awaited (so the INSERT lands while the caller's `withTenantDb` callback
  // still pins the cached client — see JSDoc), but never rethrown.
  await tenantDb.abacDecisionLog
    .create({
      data: {
        userId: ctx.userId,
        resourceType: 'workspace',
        resourceId,
        action: ctx.action,
        decision: decision.decision,
        rulesEvaluated: [{ action: ctx.action, reason: decision.reason }],
        logLevel: 'info',
      },
    })
    .catch((err: unknown) => {
      // Never log the full AbacContext — it carries userId (PII).
      // See AGENTS.md § Sicurezza point 6.
      logger.error(
        {
          err: String(err),
          action: ctx.action,
          workspaceId: resourceId,
          decision: decision.decision,
        },
        'Failed to write ABAC decision log'
      );
    });
}
