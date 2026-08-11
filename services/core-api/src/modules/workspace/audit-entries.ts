// audit-entries.ts
// Builders for workspace audit log entries.
//
// Audit logging is an observational side-effect, NOT part of the atomic
// business unit. Services that run inside an interactive `$transaction`
// therefore BUILD the entry and hand it back to their caller, which persists
// it with `writeAuditLog` on a non-transactional client AFTER the transaction
// has committed. See audit-log/writer.ts for why writing audit rows inside an
// interactive transaction is unsafe (a swallowed INSERT failure still leaves
// PostgreSQL in the aborted-transaction state, SQLSTATE 25P02).
//
// Implements: FR-021, DR-08, plan §5.1.7

import type { AuditLogEntry } from '../audit-log/types.js';
import type { WorkspaceDetailDto } from './types.js';

/**
 * Result of `createWorkspaceService`.
 *
 * `workspace` is the API payload (unchanged contract); `auditEntry` is the
 * pending audit row the caller must persist once the transaction committed.
 */
export interface CreateWorkspaceResult {
  workspace: WorkspaceDetailDto;
  auditEntry: AuditLogEntry;
}

/**
 * Builds the audit entry for a successful workspace creation.
 *
 * Field set is intentionally identical to the entry previously written inline
 * by `createWorkspaceService` (actorId / actionType / targetType / targetId).
 */
export function buildWorkspaceCreateAuditEntry(
  actorId: string,
  workspaceId: string
): AuditLogEntry {
  return {
    actorId,
    actionType: 'workspace.create',
    targetType: 'workspace',
    targetId: workspaceId,
  };
}
