// writer.ts
// Fire-and-forget audit log writer.
// Implements: FR-021, NFR-03, DR-08, plan §5.1.7

import { logger } from '../../lib/logger.js';

import type { AuditLogEntry } from './types.js';

/**
 * Writes an entry to the tenant's audit_log table.
 * Fire-and-forget: synchronous call, never awaits, never throws.
 * Errors are captured and logged via Pino — they never propagate to callers.
 *
 * @param tenantDb - Tenant-schema Prisma transaction client (type-erased)
 * @param entry    - Structured audit log entry
 */
export function writeAuditLog(
  tenantDb: unknown, // tenant-schema PrismaClient, type-erased pending prisma generate
  entry: AuditLogEntry
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = tenantDb as any;

  // Fire-and-forget: never await, never throw
  db.auditLog
    .create({
      data: {
        actor_id: entry.actorId,
        action_type: entry.actionType,
        target_type: entry.targetType,
        target_id: entry.targetId ?? null,
        before_value: entry.beforeValue ?? null,
        after_value: entry.afterValue ?? null,
        ip_address: entry.ipAddress ?? null,
      },
    })
    .catch((err: unknown) => {
      logger.error({ err: String(err), entry }, 'Failed to write audit log entry');
    });
}
