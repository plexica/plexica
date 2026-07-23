import { buildTenantClientForCtx } from './db-tenant.helpers.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

export async function seedInvitation(
  tenantContext: TenantContext,
  data: {
    email: string;
    workspaceId: string;
    role: string;
    invitedBy: string;
    token: string;
    status: string;
    expiresAt: Date;
  }
): Promise<string> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    const row = await tenantDb.invitation.create({
      data,
      select: { id: true },
    });
    return (row as { id: string }).id;
  } finally {
    await tenantDb.$disconnect();
  }
}
