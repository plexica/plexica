-- 012_email_queue/migration.sql
-- Adds the core.email_queue table for durable outbound email retry (ADR-035,
-- feature 006-03). Core-schema table, applied via `prisma migrate deploy`.
-- Schema-qualified core.email_queue. Additive; no backfill.

CREATE TABLE IF NOT EXISTS core.email_queue (
  id               UUID          NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        UUID,
  to_address       VARCHAR(255)  NOT NULL,
  subject          VARCHAR(255)  NOT NULL,
  html_body        TEXT          NOT NULL,
  email_type       VARCHAR(63)   NOT NULL,
  status           VARCHAR(16)   NOT NULL DEFAULT 'pending',
  attempts         INTEGER       NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_error       VARCHAR(512),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,

  CONSTRAINT email_queue_pkey           PRIMARY KEY (id),
  CONSTRAINT email_queue_status_check   CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead')),
  CONSTRAINT email_queue_attempts_check CHECK (attempts >= 0),
  CONSTRAINT email_queue_tenant_fk      FOREIGN KEY (tenant_id)
    REFERENCES core.tenants(id) ON DELETE NO ACTION
);

-- Worker claim query: UPDATE ... WHERE status = ... AND next_attempt_at <= now()
-- ORDER BY next_attempt_at LIMIT n (SKIP LOCKED). Backoff is scheduled via
-- next_attempt_at, so the index only needs (status, next_attempt_at).
CREATE INDEX IF NOT EXISTS email_queue_status_next_attempt_idx
  ON core.email_queue (status, next_attempt_at);