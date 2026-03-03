// File: apps/core-api/src/modules/storage/bucket-provisioner.ts
// Spec 007 T007-12: Tenant bucket provisioning hook
// FR-002: auto-provision per-tenant MinIO bucket on tenant creation
// Non-blocking: bucket creation failure is logged but does not block tenant creation

import { getMinioClient } from '../../services/minio-client.js';
import { logger } from '../../lib/logger.js';

// ============================================================================
// provisionTenantBucket
// ============================================================================

/**
 * Provision a private MinIO bucket for a newly created tenant.
 *
 * - Bucket name: `tenant-{tenantId}` (matches StorageService naming, NFR-007)
 * - Idempotent: calling multiple times is safe (ensureTenantBucket checks existence)
 * - Non-blocking failure: errors are logged but do not propagate to callers
 *   (per spec.md §6 — tenant creation must not be blocked by storage provisioning)
 *
 * @param tenantId - UUID of the tenant being created
 */
export async function provisionTenantBucket(tenantId: string): Promise<void> {
  try {
    const minioSvc = getMinioClient();

    // ensureTenantBucket is idempotent — creates bucket if not exists,
    // skips silently if it already exists.
    await minioSvc.ensureTenantBucket(tenantId);

    logger.info(
      { tenantId, bucket: `tenant-${tenantId}` },
      '[BucketProvisioner] tenant bucket provisioned'
    );
  } catch (err) {
    // Non-blocking: log the error but do NOT rethrow (spec.md §6, FR-002)
    // The tenant record is already created; storage provisioning can be
    // retried separately or via the StorageService.upload() auto-provision path.
    logger.error(
      {
        tenantId,
        bucket: `tenant-${tenantId}`,
        error: err instanceof Error ? err.message : String(err),
      },
      '[BucketProvisioner] failed to provision tenant bucket — non-blocking, tenant creation continues'
    );
  }
}
