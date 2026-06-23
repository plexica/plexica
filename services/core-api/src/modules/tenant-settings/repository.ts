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
    displayName: tenant.name,
    createdAt: tenant.createdAt.toISOString(),
  };
}

export async function updateTenantDisplayName(
  tenantId: string,
  displayName: string
): Promise<TenantSettingsDto> {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: displayName },
  });
  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    displayName: tenant.name,
    createdAt: tenant.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tenant-schema functions (use type-erased db)
// ---------------------------------------------------------------------------

export async function findBranding(
  db: unknown,
  // tenantId param kept for API compatibility — TenantBranding is a singleton per schema
  _tenantId: string
): Promise<TenantBrandingDto | null> {
  // TenantBranding has no tenantId column — it is a singleton record per tenant schema.
  // Use findFirst() to locate the single row (or null if not yet created).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (db as any).tenantBranding.findFirst();
  if (row === null || row === undefined) return { ...DEFAULT_BRANDING };
  return brandingRowToDto(row as Record<string, unknown>);
}

export async function upsertBranding(
  db: unknown,
  // tenantId param kept for API compatibility — TenantBranding is a singleton per schema
  _tenantId: string,
  data: { primaryColor?: string; darkMode?: boolean }
): Promise<TenantBrandingDto> {
  const updateData: Record<string, unknown> = {};
  if (data.primaryColor !== undefined) updateData['primaryColor'] = data.primaryColor;
  if (data.darkMode !== undefined) updateData['darkMode'] = data.darkMode;

  // TenantBranding is a singleton per schema. Find the existing row by id or create new.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db_ = db as any;
  const existing = await db_.tenantBranding.findFirst();
  let row: Record<string, unknown>;
  if (existing !== null && existing !== undefined) {
    row = await db_.tenantBranding.update({
      where: { id: (existing as Record<string, unknown>)['id'] },
      data: updateData,
    });
  } else {
    row = await db_.tenantBranding.create({
      data: {
        primaryColor: data.primaryColor ?? DEFAULT_BRANDING.primaryColor,
        darkMode: data.darkMode ?? DEFAULT_BRANDING.darkMode,
        logoPath: null,
      },
    });
  }
  return brandingRowToDto(row);
}

export async function updateLogoPath(
  db: unknown,
  // tenantId param kept for API compatibility — TenantBranding is a singleton per schema
  _tenantId: string,
  logoPath: string
): Promise<TenantBrandingDto> {
  // TenantBranding is a singleton per schema. Find the existing row by id or create new.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db_ = db as any;
  const existing = await db_.tenantBranding.findFirst();
  let row: Record<string, unknown>;
  if (existing !== null && existing !== undefined) {
    row = await db_.tenantBranding.update({
      where: { id: (existing as Record<string, unknown>)['id'] },
      data: { logoPath },
    });
  } else {
    row = await db_.tenantBranding.create({
      data: {
        primaryColor: DEFAULT_BRANDING.primaryColor,
        darkMode: DEFAULT_BRANDING.darkMode,
        logoPath,
      },
    });
  }
  return brandingRowToDto(row);
}
