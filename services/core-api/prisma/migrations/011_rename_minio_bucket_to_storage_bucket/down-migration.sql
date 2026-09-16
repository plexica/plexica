-- DOWN migration (documented rollback, not applied by `prisma migrate`).
-- Reverses migration 011: storage_bucket -> minio_bucket.
-- Used by the rollback runbook (ADR-034 §rollback, <= 5 steps together with
-- server/volume rollback). Values are preserved 1:1.
ALTER TABLE core.tenants
  RENAME COLUMN storage_bucket TO minio_bucket;

-- Mirror the up-migration: raise if the index is missing so the rename back
-- never silently skips the uniqueness carryover.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='core' AND tablename='tenants' AND indexname='tenants_storage_bucket_key') THEN
    ALTER INDEX core.tenants_storage_bucket_key RENAME TO tenants_minio_bucket_key;
  ELSE
    RAISE EXCEPTION 'expected unique index core.tenants_storage_bucket_key not found';
  END IF;
END $$;
