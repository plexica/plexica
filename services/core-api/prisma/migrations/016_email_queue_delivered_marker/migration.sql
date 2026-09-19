-- 016_email_queue_delivered_marker/migration.sql
-- Adds the delivered_at delivery marker to core.email_queue (ADR-035,
-- CodeRabbit #10): the worker writes delivered_at = now() immediately after a
-- confirmed SMTP send (fenced by the claim's lease_token), so a crash or a
-- settle('sent') failure after delivery can never cause a later lease re-claim
-- to re-send the same email. claim() now skips rows with delivered_at set, and
-- a delivered-but-unsettled row (delivered_at set, lease expired) is retired
-- to 'sent' by the worker's housekeeping without re-sending. The only
-- remaining duplicate window is a crash between SMTP acceptance and the
-- marker write — bounded to milliseconds (ADR-035 at-least-once).
-- Additive; no backfill.

ALTER TABLE core.email_queue ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;