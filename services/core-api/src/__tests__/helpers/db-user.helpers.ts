import { randomUUID } from 'node:crypto';

import { buildTenantClientForCtx } from './db-tenant.helpers.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

export async function seedUserProfile(
  tenantContext: TenantContext,
  keycloakUserId: string,
  email: string,
  displayName: string | null = null,
  userId?: string
): Promise<string> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    const row = await tenantDb.userProfile.upsert({
      where: { keycloakUserId },
      create: {
        userId: userId ?? randomUUID(),
        keycloakUserId,
        email,
        displayName,
        timezone: 'UTC',
        language: 'en',
        status: 'active',
      },
      update: {},
      select: { userId: true },
    });
    return (row as { userId: string }).userId;
  } finally {
    await tenantDb.$disconnect();
  }
}

export async function wipeTenantUsers(tenantContext: TenantContext): Promise<void> {
  const tenantDb = buildTenantClientForCtx(tenantContext);
  try {
    await tenantDb.userProfile.deleteMany({});
  } finally {
    await tenantDb.$disconnect();
  }
}
