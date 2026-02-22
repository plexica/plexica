// File: apps/core-api/src/services/provisioning-steps/minio-bucket-step.ts
// Spec 001 T001-04: Create per-tenant MinIO bucket provisioning step

import { getMinioClient } from '../minio-client.js';
import { logger } from '../../lib/logger.js';
import type { ProvisioningStep } from '../provisioning-orchestrator.js';

export class MinioBucketStep implements ProvisioningStep {
  readonly name = 'minio_bucket';

  constructor(private readonly slug: string) {}

  async execute(): Promise<void> {
    const client = getMinioClient();
    logger.info({ tenantSlug: this.slug }, 'Creating MinIO tenant bucket');
    await client.ensureTenantBucket(this.slug);
    logger.info({ tenantSlug: this.slug }, 'MinIO tenant bucket ready');
  }

  async rollback(): Promise<void> {
    const client = getMinioClient();
    logger.info({ tenantSlug: this.slug }, 'Rolling back MinIO tenant bucket');
    try {
      await client.removeTenantBucket(this.slug);
    } catch (err) {
      logger.warn({ tenantSlug: this.slug, error: err }, 'MinIO bucket rollback failed (ignored)');
    }
  }
}
