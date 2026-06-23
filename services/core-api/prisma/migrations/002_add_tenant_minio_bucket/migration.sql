-- Migration 002: Add minio_bucket column to core.tenants
ALTER TABLE core.tenants
  ADD COLUMN IF NOT EXISTS minio_bucket VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_minio_bucket_key
  ON core.tenants (minio_bucket)
  WHERE minio_bucket IS NOT NULL;
