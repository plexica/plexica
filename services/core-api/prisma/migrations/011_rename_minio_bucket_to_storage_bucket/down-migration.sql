-- DOWN migration (documented rollback, not applied by `prisma migrate`).
-- Reverses migration 011: storage_bucket -> minio_bucket.
-- Used by the rollback runbook (ADR-034 §rollback, <= 5 steps together with
-- server/volume rollback). Values are preserved 1:1.
ALTER TABLE core.tenants
  RENAME COLUMN storage_bucket TO minio_bucket;

ALTER INDEX IF EXISTS core.tenants_storage_bucket_key
  RENAME TO tenants_minio_bucket_key;
