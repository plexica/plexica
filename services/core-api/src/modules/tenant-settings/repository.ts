// repository.ts
// Data access layer for the tenant-settings module.
// Core table (tenant display name) uses prisma directly.
// Tenant-schema tables (branding) use type-erased db.
// Implements: Spec 003, Phase 9

import { prisma } from '../../lib/database.js';

import type { TenantBrandingDto, TenantSettingsDto } from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const DEFAULT_BRANDING: TenantBrandingDto = {
  id: '',
  primaryColor: '#6366F1',
  darkMode: false,
  logoUrl: null,
};

function brandingRowToDto(row: Record<string, unknown>): TenantBrandingDto {
  return {
    id: String(row['id']),
    primaryColor: String(row['primaryColor'] ?? '#6366F1'),
    darkMode: Boolean(row['darkMode']),
    logoUrl: row['logoPath'] != null ? String(row['logoPath']) : null,
  };
}

// ---------------------------------------------------------------------------
// Core-schema functions (use prisma directly)
// ---------------------------------------------------------------------------

export async function findTenantSettings(tenantId: string): Promise<TenantSettingsDto> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    displayName: tenant.displayName,
    createdAt: tenant.createdAt.toISOString(),
  };
}

export async function updateTenantDisplayName(
  tenantId: string,
  displayName: string
): Promise<TenantSettingsDto> {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { displayName },
  });
  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    displayName: tenant.displayName,
    createdAt: tenant.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tenant-schema functions (use type-erased db)
// ---------------------------------------------------------------------------

export async function findBranding(
  db: unknown,
  tenantId: string
): Promise<TenantBrandingDto | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).tenantBranding.findUnique({ where: { tenantId } });
  if (row === null || row === undefined) return { ...DEFAULT_BRANDING };
  return brandingRowToDto(row as Record<string, unknown>);
}

export async function upsertBranding(
  db: unknown,
  tenantId: string,
  data: { primaryColor?: string; darkMode?: boolean }
): Promise<TenantBrandingDto> {
  const updateData: Record<string, unknown> = {};
  if (data.primaryColor !== undefined) updateData['primaryColor'] = data.primaryColor;
  if (data.darkMode !== undefined) updateData['darkMode'] = data.darkMode;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).tenantBranding.upsert({
    where: { tenantId },
    create: {
      tenantId,
      primaryColor: data.primaryColor ?? DEFAULT_BRANDING.primaryColor,
      darkMode: data.darkMode ?? DEFAULT_BRANDING.darkMode,
      logoPath: null,
    },
    update: updateData,
  });
  return brandingRowToDto(row as Record<string, unknown>);
}

export async function updateLogoPath(
  db: unknown,
  tenantId: string,
  logoPath: string
): Promise<TenantBrandingDto> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).tenantBranding.upsert({
    where: { tenantId },
    create: {
      tenantId,
      primaryColor: DEFAULT_BRANDING.primaryColor,
      darkMode: DEFAULT_BRANDING.darkMode,
      logoPath,
    },
    update: { logoPath },
  });
  return brandingRowToDto(row as Record<string, unknown>);
}
