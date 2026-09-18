-- 013_email_queue_lease/migration.sql
-- Adds worker lease columns and the idempotent-enqueue dedupe key to
-- core.email_queue (ADR-035, review fixes on feature 006-03).
--   - claimed_at + lease_expires_at: the claim stamps a lease so a crash
--     between claim and settle orphans a row; the worker re-claims `sending`
--     rows whose lease expired (mirrors event_outbox lease).
--   - dedupe_key: consumer event_id, unique — enqueue uses
--     ON CONFLICT (dedupe_key) DO NOTHING so a redelivery cannot double-enqueue.
-- The index is a PLAIN unique index (NOT partial): a partial index
-- (`WHERE dedupe_key IS NOT NULL`) cannot be the inference target of
-- `ON CONFLICT (dedupe_key)` (PG error 42P10) unless the conflict target
-- repeats the predicate. A plain unique index matches `schema.prisma`
-- (`dedupeKey String? @unique` generates a non-partial unique index) and still
-- allows multiple NULL dedupe_key rows (PG unique indexes permit NULLs).
-- Additive; no backfill.

ALTER TABLE core.email_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE core.email_queue ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE core.email_queue ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS email_queue_dedupe_key_key
  ON core.email_queue (dedupe_key);