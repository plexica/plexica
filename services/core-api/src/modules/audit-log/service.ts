// service.ts
// Business logic for querying the audit log.
// Writer logic lives in writer.ts (fire-and-forget).
// Implements: Spec 003, Phase 10

import { AUDIT_ACTION_TYPES } from './action-types.js';
import { queryAuditLog } from './repository.js';

import type { AuditLogDto, AuditLogFilters } from './types.js';
import type { PaginatedResult } from '../../lib/pagination.js';

export async function getAuditLog(
  db: unknown,
  filters: AuditLogFilters
): Promise<PaginatedResult<AuditLogDto>> {
  return queryAuditLog(db, filters);
}

export function getActionTypes(): Array<{ key: string; label: string; category: string }> {
  return AUDIT_ACTION_TYPES.map(({ key, label, category }) => ({ key, label, category }));
}
