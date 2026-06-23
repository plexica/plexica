// 003-default-branding.ts
// Seeds the default tenant_branding row for a newly provisioned tenant.
// Idempotent — exits early if a branding row already exists.

// TODO: Run 'pnpm db:generate' to generate tenant client types before this compiles.
 
// @ts-ignore — generated/tenant-client does not exist until after 'pnpm db:generate'
import type { PrismaClient } from '../../../generated/tenant-client/index.js';

/**
 * Seeds the default branding row for the tenant.
 * Idempotent — exits early if any branding row already exists.
 *
 * @param tenantDb - PrismaClient connected to the tenant schema (not core).
 */
export async function seedDefaultBranding(tenantDb: PrismaClient): Promise<void> {
  const existing = await tenantDb.tenantBranding.count();
  if (existing > 0) return;

  await tenantDb.tenantBranding.create({
    data: {
      logoPath: null,
      primaryColor: '#6366F1',
      darkMode: false,
    },
  });
}
