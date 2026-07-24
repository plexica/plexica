export async function ensureTenantBucket(tenantSlug: string): Promise<void> {
  const { createBucket } = await import('../../lib/minio-client.js');
  await createBucket(`tenant-${tenantSlug}`);
}

export async function removeTenantBucket(tenantSlug: string): Promise<void> {
  const { deleteBucket } = await import('../../lib/minio-client.js');
  try {
    await deleteBucket(`tenant-${tenantSlug}`);
  } catch {
    // Cleanup is best-effort when the bucket is already absent.
  }
}
