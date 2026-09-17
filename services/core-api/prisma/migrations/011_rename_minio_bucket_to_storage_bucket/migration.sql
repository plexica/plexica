-- Migration 011: Rename minio_bucket -> storage_bucket (FR-013, ADR-034)
-- Values and the partial unique index are carried over 1:1 — this is a
-- transactional RENAME COLUMN, no data rewrite (NFR-007).
--
-- Deploy rule (spec edge #10 / US-006): the API MUST be stopped during this
-- migration (maintenance window); rolling mixed-version operation is forbidden.
ALTER TABLE core.tenants
  RENAME COLUMN minio_bucket TO storage_bucket;

-- The unique index carryover must never silently skip: raise if missing so
-- the uniqueness invariant stays intact instead of degrading silently.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='core' AND tablename='tenants' AND indexname='tenants_minio_bucket_key') THEN
    ALTER INDEX core.tenants_minio_bucket_key RENAME TO tenants_storage_bucket_key;
  ELSE
    RAISE EXCEPTION 'expected unique index core.tenants_minio_bucket_key not found';
  END IF;
END $$;
