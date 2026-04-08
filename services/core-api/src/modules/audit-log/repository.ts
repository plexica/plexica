// repository.ts
// Data access layer for querying audit log entries in the tenant schema.
// Implements: Spec 003, Phase 10

import { buildPaginationClause, buildPaginatedResult } from '../../lib/pagination.js';

import type { PaginatedResult } from '../../lib/pagination.js';
import type { AuditLogDto, AuditLogFilters } from './types.js';

function rowToDto(row: Record<string, unknown>): AuditLogDto {
  return {
    id: String(row['id']),
    actorId: String(row['actorId'] ?? row['actor_id']),
    actionType: String(row['actionType'] ?? row['action_type']),
    targetType: String(row['targetType'] ?? row['target_type']),
    targetId:
      row['targetId'] != null
        ? String(row['targetId'])
        : row['target_id'] != null
          ? String(row['target_id'])
          : null,
    createdAt: (row['createdAt'] instanceof Date
      ? row['createdAt']
      : new Date(String(row['createdAt'] ?? row['created_at']))
    ).toISOString(),
  };
}

export async function queryAuditLog(
  db: unknown,
  filters: AuditLogFilters
): Promise<PaginatedResult<AuditLogDto>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = db as any;

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const where: Record<string, unknown> = {};
  if (filters.actorId !== undefined) where['actorId'] = filters.actorId;
  if (filters.actionType !== undefined) where['actionType'] = filters.actionType;

  // Date range filter
  if (filters.from !== undefined || filters.to !== undefined) {
    const createdAt: Record<string, Date> = {};
    if (filters.from !== undefined) createdAt['gte'] = filters.from;
    if (filters.to !== undefined) createdAt['lte'] = filters.to;
    where['createdAt'] = createdAt;
  }

  const { skip, take } = buildPaginationClause({ page, limit: pageSize });

  const [rows, total] = await Promise.all([
    client.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    client.auditLog.count({ where }),
  ]);

  const data = (rows as Record<string, unknown>[]).map(rowToDto);
  return buildPaginatedResult(data, total as number, { page, limit: pageSize });
}
