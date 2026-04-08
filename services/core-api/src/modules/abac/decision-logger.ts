// decision-logger.ts
// Fire-and-forget ABAC decision log writer.
// Implements: FR-015, NFR-08, DR-09, AC-07

import { config } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';

import type { AbacContext, AbacDecision } from './types.js';

/**
 * Writes an ABAC decision to the tenant's abac_decision_log table.
 * Fire-and-forget: never throws, never blocks the caller.
 * Sampling rate controlled by ABAC_DECISION_LOG_SAMPLE_RATE (0.0–1.0).
 */
export async function logDecision(
  tenantDb: unknown, // tenant-schema PrismaClient, type-erased pending prisma generate
  ctx: AbacContext,
  decision: AbacDecision
): Promise<void> {
  // Sampling: skip based on ABAC_DECISION_LOG_SAMPLE_RATE (0.0–1.0)
  if (Math.random() > config.ABAC_DECISION_LOG_SAMPLE_RATE) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = tenantDb as any;

  // Fire-and-forget: never throw, never block
  // resourceId is nullable (UUID | null) — pass null when workspaceId is empty
  // so routes without a workspace param don't fail with a UUID format error.
  const resourceId = ctx.workspaceId !== '' ? ctx.workspaceId : null;

  db.abacDecisionLog
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
      logger.error({ err: String(err), ctx }, 'Failed to write ABAC decision log');
    });
}
