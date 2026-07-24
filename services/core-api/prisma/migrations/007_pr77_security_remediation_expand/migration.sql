-- PR #77 event foundation: additive tables and nullable DLQ ownership fields.
CREATE TABLE core.event_outbox (
  event_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES core.tenants(id),
  topic VARCHAR(128) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  schema_version SMALLINT NOT NULL,
  payload JSONB NOT NULL,
  producer_kind VARCHAR(16) NOT NULL,
  producer_id VARCHAR(64) NOT NULL,
  correlation_id UUID NOT NULL,
  causation_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  last_error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_outbox_claim_idx
  ON core.event_outbox(available_at, created_at);
CREATE INDEX event_outbox_tenant_id_idx ON core.event_outbox(tenant_id);

CREATE TABLE core.tenant_event_keys (
  tenant_id UUID NOT NULL REFERENCES core.tenants(id),
  key_version INTEGER NOT NULL,
  status VARCHAR(16) NOT NULL,
  wrapped_key BYTEA,
  wrap_iv BYTEA,
  wrap_tag BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  destroyed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, key_version)
);

CREATE UNIQUE INDEX tenant_event_keys_one_active_idx
  ON core.tenant_event_keys(tenant_id) WHERE status = 'active';

ALTER TABLE core.dead_letter_queue
  ADD COLUMN tenant_id UUID,
  ADD COLUMN install_id UUID,
  ADD COLUMN event_id UUID,
  ADD COLUMN schema_version SMALLINT,
  ADD COLUMN original_topic VARCHAR(128),
  ADD COLUMN original_partition INTEGER,
  ADD COLUMN original_offset BIGINT,
  ADD COLUMN dedupe_key CHAR(64);

-- Legacy rows have neither proven ownership nor complete source coordinates.
-- Purging is the only safe migration; ownership must never be inferred.
DELETE FROM core.dead_letter_queue;
