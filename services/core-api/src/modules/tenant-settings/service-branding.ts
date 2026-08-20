// service-branding.ts
// Branding business logic for the tenant-settings module.
// Separated from service.ts to stay within the 200-line file limit.
// Implements: Spec 003, Phase 9

import { Readable } from 'node:stream';

import { uploadLogo, getPresignedReadUrl } from '../../lib/minio-client.js';
import { validateFileContent, LOGO_ALLOWED_MIME_TYPES } from '../../lib/file-upload.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findBranding, upsertBranding, updateLogoPath } from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantDbClient, TenantPrismaClient } from '../../lib/tenant-database.js';
import type { TenantBrandingDto, UpdateBrandingInput, LogoFileBuffer } from './types.js';

async function attachLogoUrl(
  branding: TenantBrandingDto,
  tenantSlug: string
): Promise<TenantBrandingDto> {
  if (branding.logoUrl === null) return branding;
  const bucketName = `tenant-${tenantSlug}`;
  const logoUrl = await getPresignedReadUrl(bucketName, branding.logoUrl);
  return { ...branding, logoUrl };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function getBranding(
  tenantDb: TenantDbClient,
  tenantContext: TenantContext
): Promise<TenantBrandingDto> {
  const branding = await findBranding(tenantDb, tenantContext.tenantId);
  const result = branding ?? {
    id: '',
    primaryColor: '#6366F1',
    darkMode: false,
    logoUrl: null,
  };
  return attachLogoUrl(result, tenantContext.slug);
}

// TenantPrismaClient (non-transactional): writes the audit log.
export async function updateBranding(
  tenantDb: TenantPrismaClient,
  actorId: string,
  tenantContext: TenantContext,
  input: UpdateBrandingInput,
  logoFile?: LogoFileBuffer
): Promise<TenantBrandingDto> {
  let branding: TenantBrandingDto;

  if (logoFile !== undefined) {
    // Authoritative check: sniffs magic bytes against the declared type and,
    // for SVG, rejects active content (script, event handlers, XXE, etc).
    // The logo path is the only allowlist that accepts image/svg+xml, so this
    // is the sole place SVG active-content scanning is load-bearing.
    validateFileContent(logoFile.data, logoFile.mimetype, LOGO_ALLOWED_MIME_TYPES);
    const logoPath = await uploadLogo(
      tenantContext.slug,
      Readable.from(logoFile.data),
      logoFile.mimetype,
      logoFile.size
    );
    // Upsert branding fields first, then update logo path
    await upsertBranding(tenantDb, tenantContext.tenantId, input);
    branding = await updateLogoPath(tenantDb, tenantContext.tenantId, logoPath);
  } else {
    branding = await upsertBranding(tenantDb, tenantContext.tenantId, input);
  }

  await writeAuditLog(tenantDb, {
    actorId,
    actionType: 'settings.branding_update',
    targetType: 'tenant',
    targetId: tenantContext.tenantId,
  });

  return attachLogoUrl(branding, tenantContext.slug);
}
