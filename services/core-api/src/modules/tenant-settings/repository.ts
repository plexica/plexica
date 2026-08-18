// repository.ts
// Data access layer for the tenant-settings module.
// Core table (tenant display name) uses prisma directly.
// Tenant-schema tables (branding) use the TenantDbClient (ADR-028).
// Implements: Spec 003, Phase 9

import { prisma } from '../../lib/database.js';

import type { TenantDbClient, TenantPrisma } from '../../lib/tenant-database.js';
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

interface TenantBrandingRow {
  id: string;
  primaryColor: string;
  darkMode: boolean;
  logoPath: string | null;
}

function brandingRowToDto(row: TenantBrandingRow): TenantBrandingDto {
  return {
    id: row.id,
    // primaryColor is non-nullable in the tenant schema (default '#6366F1').
    primaryColor: row.primaryColor,
    darkMode: row.darkMode,
    logoUrl: row.logoPath,
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
// Tenant-schema functions
// ---------------------------------------------------------------------------

export async function findBranding(
  db: TenantDbClient,
  // tenantId param kept for API compatibility — TenantBranding is a singleton per schema
  _tenantId: string
): Promise<TenantBrandingDto | null> {
  // TenantBranding has no tenantId column — it is a singleton record per tenant schema.
  // Use findFirst() to locate the single row (or null if not yet created).
  const row = await db.tenantBranding.findFirst();
  if (row === null) return { ...DEFAULT_BRANDING };
  return brandingRowToDto(row);
}

export async function upsertBranding(
  db: TenantDbClient,
  // tenantId param kept for API compatibility — TenantBranding is a singleton per schema
  _tenantId: string,
  data: { primaryColor?: string; darkMode?: boolean }
): Promise<TenantBrandingDto> {
  const updateData: TenantPrisma.TenantBrandingUpdateInput = {};
  if (data.primaryColor !== undefined) updateData.primaryColor = data.primaryColor;
  if (data.darkMode !== undefined) updateData.darkMode = data.darkMode;

  // TenantBranding is a singleton per schema. Find the existing row by id or create new.
  const existing = await db.tenantBranding.findFirst();
  const row =
    existing !== null
      ? await db.tenantBranding.update({
          where: { id: existing.id },
          data: updateData,
        })
      : await db.tenantBranding.create({
          data: {
            primaryColor: data.primaryColor ?? DEFAULT_BRANDING.primaryColor,
            darkMode: data.darkMode ?? DEFAULT_BRANDING.darkMode,
            logoPath: null,
          },
        });
  return brandingRowToDto(row);
}

export async function updateLogoPath(
  db: TenantDbClient,
  // tenantId param kept for API compatibility — TenantBranding is a singleton per schema
  _tenantId: string,
  logoPath: string
): Promise<TenantBrandingDto> {
  // TenantBranding is a singleton per schema. Find the existing row by id or create new.
  const existing = await db.tenantBranding.findFirst();
  const row =
    existing !== null
      ? await db.tenantBranding.update({
          where: { id: existing.id },
          data: { logoPath },
        })
      : await db.tenantBranding.create({
          data: {
            primaryColor: DEFAULT_BRANDING.primaryColor,
            darkMode: DEFAULT_BRANDING.darkMode,
            logoPath,
          },
        });
  return brandingRowToDto(row);
}
