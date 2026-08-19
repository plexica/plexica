// repository.ts
// Data access layer for querying audit log entries in the tenant schema.
// Implements: Spec 003, Phase 10

import { buildPaginationClause, buildPaginatedResult } from '../../lib/pagination.js';

import type { PaginatedResult } from '../../lib/pagination.js';
import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';
import type { AuditLogDto, AuditLogFilters } from './types.js';

// Generated tenant-schema row for audit_log (ADR-028). Mapped field-by-field
// so a schema drift surfaces here at compile time — same idiom as
// user-profile/repository.ts rowToDto().
type AuditLogRow = TenantPrisma.AuditLogGetPayload<{}>;

function rowToDto(row: AuditLogRow): AuditLogDto {
  return {
    id: row.id,
    actorId: row.actorId,
    actionType: row.actionType,
    targetType: row.targetType,
    targetId: row.targetId,
    // Json columns are JsonValue in the generated client; AuditLogDto types
    // them `unknown`, so they pass through without a cast.
    beforeValue: row.beforeValue ?? null,
    afterValue: row.afterValue ?? null,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function queryAuditLog(
  db: TenantDbClient,
  filters: AuditLogFilters
): Promise<PaginatedResult<AuditLogDto>> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where: TenantPrisma.AuditLogWhereInput = {};
  if (filters.actorId !== undefined) where.actorId = filters.actorId;
  if (filters.actionType !== undefined) where.actionType = filters.actionType;
  if (filters.workspaceId !== undefined) where.targetId = filters.workspaceId;

  // Date range filter
  if (filters.from !== undefined || filters.to !== undefined) {
    const createdAt: TenantPrisma.DateTimeFilter = {};
    if (filters.from !== undefined) createdAt.gte = filters.from;
    if (filters.to !== undefined) createdAt.lte = filters.to;
    where.createdAt = createdAt;
  }

  const { skip, take } = buildPaginationClause({ page, pageSize });

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    db.auditLog.count({ where }),
  ]);

  const data = rows.map(rowToDto);
  return buildPaginatedResult(data, total, { page, pageSize });
}
