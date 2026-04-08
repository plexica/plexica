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
  db.abacDecisionLog
    .create({
      data: {
        user_id: ctx.userId,
        resource_type: 'workspace',
        resource_id: ctx.workspaceId,
        action: ctx.action,
        decision: decision.decision,
        rules_evaluated: [{ action: ctx.action, reason: decision.reason }],
        log_level: 'info',
      },
    })
    .catch((err: unknown) => {
      logger.error({ err: String(err), ctx }, 'Failed to write ABAC decision log');
    });
}
