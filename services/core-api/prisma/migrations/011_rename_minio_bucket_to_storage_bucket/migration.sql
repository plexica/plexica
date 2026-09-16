-- Migration 011: Rename minio_bucket -> storage_bucket (FR-013, ADR-034)
-- Values and the partial unique index are carried over 1:1 — this is a
-- transactional RENAME COLUMN, no data rewrite (NFR-007).
--
-- Deploy rule (spec edge #10 / US-006): the API MUST be stopped during this
-- migration (maintenance window); rolling mixed-version operation is forbidden.
ALTER TABLE core.tenants
  RENAME COLUMN minio_bucket TO storage_bucket;

ALTER INDEX IF EXISTS core.tenants_minio_bucket_key
  RENAME TO tenants_storage_bucket_key;
