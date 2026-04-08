// service-branding.ts
// Branding business logic for the tenant-settings module.
// Separated from service.ts to stay within the 200-line file limit.
// Implements: Spec 003, Phase 9

import { Readable } from 'node:stream';


import { config } from '../../lib/config.js';
import { FileTooLargeError } from '../../lib/app-error.js';
import { uploadLogo, getPresignedReadUrl } from '../../lib/minio-client.js';
import { validateMimeType } from '../../lib/file-upload.js';
import { LOGO_ALLOWED_MIME_TYPES } from '../../lib/file-upload.js';
import { writeAuditLog } from '../audit-log/writer.js';

import { findBranding, upsertBranding, updateLogoPath } from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type { TenantBrandingDto, UpdateBrandingInput } from './types.js';
import type { MultipartFile } from '@fastify/multipart';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Reads a Readable stream into a Buffer; throws FileTooLargeError if exceeded. */
async function readStream(stream: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      throw new FileTooLargeError(`File exceeds maximum allowed size of ${maxBytes} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

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
  tenantDb: unknown,
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

export async function updateBranding(
  tenantDb: unknown,
  actorId: string,
  tenantContext: TenantContext,
  input: UpdateBrandingInput,
  logoFile?: MultipartFile
): Promise<TenantBrandingDto> {
  let branding: TenantBrandingDto;

  if (logoFile !== undefined) {
    validateMimeType(logoFile.mimetype, LOGO_ALLOWED_MIME_TYPES);
    const fileBytes = await readStream(logoFile.file as unknown as Readable, config.LOGO_MAX_BYTES);
    const logoPath = await uploadLogo(
      tenantContext.slug,
      Readable.from(fileBytes),
      logoFile.mimetype,
      fileBytes.length
    );
    // Upsert branding fields first, then update logo path
    await upsertBranding(tenantDb, tenantContext.tenantId, input);
    branding = await updateLogoPath(tenantDb, tenantContext.tenantId, logoPath);
  } else {
    branding = await upsertBranding(tenantDb, tenantContext.tenantId, input);
  }

  writeAuditLog(tenantDb, {
    actorId,
    actionType: 'settings.branding_update',
    targetType: 'tenant',
    targetId: tenantContext.tenantId,
  });

  return attachLogoUrl(branding, tenantContext.slug);
}
