/**
 * AuditLogService — T008-05 (Spec 008 Admin Interfaces)
 *
 * Append-only audit log service. Writes are fire-and-forget (errors are
 * warn-logged, never re-thrown). Query methods are pagination-safe with
 * a 10K result-window cap (Analysis ISSUE-002).
 *
 * Constitution Article 5.2: No PII in logs (no request bodies stored).
 * Constitution Article 6.3: Structured Pino logging.
 * ADR-025: audit_logs lives in core schema — bounded exception to ADR-002.
 */

import { z } from 'zod';
import { type PrismaClient } from '@plexica/database';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';

// ============================================================================
// Public Interfaces
// ============================================================================

export interface AuditLogEntry {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditLogFilters {
  tenantId?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface AuditLogRecord {
  id: string;
  tenantId: string | null;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLogPage {
  data: AuditLogRecord[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ============================================================================
// Validation
// ============================================================================

const ipv4Schema = z.ipv4();
const ipv6Schema = z.ipv6();

function isValidIp(value: string): boolean {
  return ipv4Schema.safeParse(value).success || ipv6Schema.safeParse(value).success;
}

/** 10 000-row result-window cap (plan §9 inline decision). */
const RESULT_WINDOW_MAX = 10_000;
const AUDIT_LOG_WINDOW_EXCEEDED_CODE = 'AUDIT_LOG_RESULT_WINDOW_EXCEEDED';

function buildWhereClause(filters: AuditLogFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (filters.tenantId !== undefined) where.tenantId = filters.tenantId;
  if (filters.userId !== undefined) where.userId = filters.userId;
  if (filters.action !== undefined) where.action = filters.action;
  if (filters.resourceType !== undefined) where.resourceType = filters.resourceType;

  if (filters.startDate !== undefined || filters.endDate !== undefined) {
    const createdAt: Record<string, Date> = {};
    if (filters.startDate) createdAt.gte = filters.startDate;
    if (filters.endDate) createdAt.lte = filters.endDate;
    where.createdAt = createdAt;
  }

  return where;
}

function checkResultWindowCap(page: number, limit: number): void {
  const offset = (page - 1) * limit;
  if (offset >= RESULT_WINDOW_MAX) {
    const err = new Error(
      `Audit log result window exceeded: offset ${offset} >= ${RESULT_WINDOW_MAX}`
    ) as Error & { code: string; statusCode: number };
    err.code = AUDIT_LOG_WINDOW_EXCEEDED_CODE;
    err.statusCode = 400;
    throw err;
  }
}

// ============================================================================
// Service
// ============================================================================

export class AuditLogService {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = db) {
    this.db = dbClient;
  }

  /**
   * Append an audit log entry.
   * Never throws — errors are warn-logged only (fire-and-forget).
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Validate IP address — invalid values stored as null (ISSUE-010)
      const rawIp = entry.ipAddress ?? null;
      const ipAddress = rawIp !== null && isValidIp(rawIp) ? rawIp : null;

      await this.db.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          userId: entry.userId ?? null,
          action: entry.action,
          resourceType: entry.resourceType ?? null,
          resourceId: entry.resourceId ?? null,
          details: (entry.details ?? {}) as object,
          ipAddress,
          userAgent: entry.userAgent ?? null,
        },
      });
    } catch (err) {
      // Non-blocking: log as warn, never re-throw (plan §4.1)
      logger.warn(
        { err, action: entry.action },
        'AuditLogService.log: failed to write audit entry'
      );
    }
  }

  /**
   * Paginated global query — Super Admin use only.
   * Explicitly named to signal cross-tenant intent (ADR-025 Safeguard #3).
   * Enforces 10K result-window cap.
   */
  async queryAllTenants(filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);

    checkResultWindowCap(page, limit);

    const where = buildWhereClause(filters);

    const [total, items] = await Promise.all([
      this.db.auditLog.count({ where }),
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: items.map((item) => ({
        ...item,
        details: item.details as Record<string, unknown>,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Paginated tenant-scoped query — Tenant Admin use.
   * Always enforces tenantId isolation (NFR-004).
   * Any tenantId in `filters` is ignored — the explicit `tenantId` parameter
   * is always used, preventing cross-tenant data leakage.
   */
  async queryForTenant(tenantId: string, filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    // Strip any tenantId from filters and override with the explicit tenantId
    const isolatedFilters: AuditLogFilters = { ...filters, tenantId };
    return this.queryAllTenants(isolatedFilters);
  }
}

// Singleton export
export const auditLogService = new AuditLogService();
