// services/audit-log.service.ts
// Platform audit log write + query helpers (S5-301 / ADR-022 Decision 2).
//
// All super-admin actions record an entry here. The table lives in the core
// schema so it survives tenant deletion. metadata is JSONB structural data
// only — NO PII (Security §6). actorId is the Keycloak master realm sub.

import {
  WriteAuditEntrySchema,
  type AuditEntry,
  type AuditLogResponse,
  type AuditQuery,
  type WriteAuditEntry,
} from '../schemas/audit-schemas.js';

import type { PrismaClient, Prisma } from '@prisma/client';

const AUDIT_SELECT = {
  id: true,
  actorId: true,
  action: true,
  resourceType: true,
  resourceId: true,
  tenantId: true,
  metadata: true,
  ipAddress: true,
  createdAt: true,
} as const satisfies Prisma.PlatformAuditLogSelect;

type AuditRow = Prisma.PlatformAuditLogGetPayload<{ select: typeof AUDIT_SELECT }>;

function toEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    actorId: row.actorId,
    action: row.action as AuditEntry['action'],
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    tenantId: row.tenantId,
    metadata: row.metadata as Record<string, unknown>,
    ipAddress: row.ipAddress,
    createdAt: row.createdAt,
  };
}

/**
 * Inserts a platform audit log entry.
 * Validates input via WriteAuditEntrySchema; callers MUST NOT place PII in
 * metadata (Security §6). actorId is the Keycloak master realm sub.
 */
export async function writeAuditEntry(
  prisma: PrismaClient,
  input: WriteAuditEntry
): Promise<AuditEntry> {
  const parsed = WriteAuditEntrySchema.parse(input);

  const data: Prisma.PlatformAuditLogUncheckedCreateInput = {
    actorId: parsed.actorId,
    action: parsed.action,
    resourceType: parsed.resourceType,
    resourceId: parsed.resourceId ?? null,
    tenantId: parsed.tenantId ?? null,
    metadata: parsed.metadata as Prisma.InputJsonValue,
    ipAddress: parsed.ipAddress ?? null,
  };

  const row = await prisma.platformAuditLog.create({
    data,
    select: AUDIT_SELECT,
  });

  return toEntry(row);
}

/**
 * Returns paginated platform audit log entries, optionally filtered by
 * action, tenantId, or actorId. Ordered by createdAt desc (most recent first).
 * Defaults: page=1, pageSize=20.
 */
export async function queryAuditLog(
  prisma: PrismaClient,
  options: AuditQuery
): Promise<AuditLogResponse> {
  const { action, tenantId, actorId, page, pageSize } = options;

  const where: Prisma.PlatformAuditLogWhereInput = {};
  if (action) where.action = action;
  if (tenantId) where.tenantId = tenantId;
  if (actorId) where.actorId = actorId;

  const [rows, total] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      select: AUDIT_SELECT,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.platformAuditLog.count({ where }),
  ]);

  return {
    data: rows.map(toEntry),
    total,
    page,
    pageSize,
  };
}
