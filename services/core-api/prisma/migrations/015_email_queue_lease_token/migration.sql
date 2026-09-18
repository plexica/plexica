-- 015_email_queue_lease_token/migration.sql
-- Adds the lease fencing claim token to core.email_queue (ADR-035, review
-- fixes on feature 006-03): claim() stamps a per-batch crypto.randomUUID()
-- lease_token and every settle/retry predicate requires it, so a stale holder
-- (lease expired, row re-claimed by a successor after a crash) cannot
-- overwrite the new holder's row state — the 0-row update is logged and
-- ignored. Mirrors event_outbox.lease_token semantics.
-- Additive; no backfill.

ALTER TABLE core.email_queue ADD COLUMN IF NOT EXISTS lease_token UUID;
