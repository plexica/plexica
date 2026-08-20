// service.ts
// Business logic for querying the audit log.
// Write logic lives in writer.ts — note it is awaited and non-throwing, NOT
// fire-and-forget, and must run outside a $transaction (see its JSDoc).
// Implements: Spec 003, Phase 10

import { AUDIT_ACTION_TYPES } from './action-types.js';
import { queryAuditLog } from './repository.js';

import type { AuditLogDto, AuditLogFilters } from './types.js';
import type { PaginatedResult } from '../../lib/pagination.js';
import type { TenantDbClient } from '../../lib/tenant-database.js';

export async function getAuditLog(
  db: TenantDbClient,
  filters: AuditLogFilters
): Promise<PaginatedResult<AuditLogDto>> {
  return queryAuditLog(db, filters);
}

export function getActionTypes(): Array<{ key: string; label: string; category: string }> {
  return AUDIT_ACTION_TYPES.map(({ key, label, category }) => ({ key, label, category }));
}
