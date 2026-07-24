// deletion-step-bucket-delete.ts
// Deletion saga step handler: delete MinIO bucket (ADR-022 Decision 1).
// GDPR requires full erasure — every object in the tenant bucket is removed
// before the bucket itself is deleted. Throws on any failure so the saga
// executor can retry with backoff.

import { deleteBucket } from '../../../lib/minio-client.js';
import { logger } from '../../../lib/logger.js';

/**
 * Force-deletes the MinIO bucket `tenant-<slug>` and all of its objects,
 * then removes the bucket. Idempotent — a missing bucket is treated as
 * success. Throws on MinIO service errors.
 */
export async function executeBucketDelete(tenantId: string, bucketName: string): Promise<void> {
  logger.info({ tenantId }, 'Force-deleting tenant object storage');

  // deleteBucket lists all objects, removes them, then removes the bucket.
  // No partial deletion is left behind — required for GDPR full erasure.
  await deleteBucket(bucketName);

  logger.info({ tenantId }, 'Tenant object storage deletion step complete');
}
