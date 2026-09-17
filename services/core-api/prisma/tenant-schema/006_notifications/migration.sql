-- 006_notifications/migration.sql
-- Adds the tenant-scoped notifications table (ADR-035, feature 006-01).
-- All statements run inside tenant_<slug> schema (search_path is pre-set by multi-schema-migrate.ts).
-- event_id is UNIQUE — the consumer idempotency key (insert-ignore dedupe, plan §5.2 F6).
-- Additive; no backfill.

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID          NOT NULL DEFAULT gen_random_uuid(),
  event_id   VARCHAR(255)  NOT NULL,
  user_id    UUID          NOT NULL,
  type       VARCHAR(63)   NOT NULL,
  title      VARCHAR(255)  NOT NULL,
  body       TEXT,
  metadata   JSONB         NOT NULL DEFAULT '{}',
  read       BOOLEAN       NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT notifications_pkey      PRIMARY KEY (id),
  CONSTRAINT notifications_event_id_key UNIQUE (event_id),
  CONSTRAINT notifications_user_fk   FOREIGN KEY (user_id)
    REFERENCES user_profile(user_id) ON DELETE CASCADE
);

-- Unread list + center pagination (architecture §3.3).
CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON notifications (user_id, read, created_at DESC);