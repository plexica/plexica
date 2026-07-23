import { buildTenantClientForCtx } from './db-tenant.helpers.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

interface AbacDecisionLogRow {
  userId: string;
  action: string;
  resourceId: string | null;
  decision: string;
  createdAt: Date;
}

export async function wipeTenantAuditLog(tenantContext: TenantContext): Promise<void> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    await tenantDb.auditLog.deleteMany({});
  } finally {
    await tenantDb.$disconnect();
  }
}

export async function seedAuditLog(
  tenantContext: TenantContext,
  actorId: string,
  actionType: string
): Promise<string> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    const row = await tenantDb.auditLog.create({
      data: { actorId, actionType, targetType: 'workspace' },
      select: { id: true },
    });
    return (row as { id: string }).id;
  } finally {
    await tenantDb.$disconnect();
  }
}

export async function queryAbacDecisionLog(
  tenantContext: TenantContext,
  filter: { userId?: string; action?: string; resourceId?: string }
): Promise<AbacDecisionLogRow[]> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    const rows = await tenantDb.abacDecisionLog.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows as AbacDecisionLogRow[];
  } finally {
    await tenantDb.$disconnect();
  }
}
