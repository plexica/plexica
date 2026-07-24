-- Enforce the v1 event and normalized DLQ contracts after the legacy purge.
ALTER TABLE core.event_outbox
  ADD CONSTRAINT event_outbox_schema_version_check CHECK (schema_version = 1),
  ADD CONSTRAINT event_outbox_producer_kind_check
    CHECK (producer_kind IN ('core', 'plugin'));

ALTER TABLE core.tenant_event_keys
  ADD CONSTRAINT tenant_event_keys_status_check
    CHECK (status IN ('active', 'destroyed')),
  ADD CONSTRAINT tenant_event_keys_material_check CHECK (
    (status = 'active' AND wrapped_key IS NOT NULL AND wrap_iv IS NOT NULL
      AND wrap_tag IS NOT NULL AND destroyed_at IS NULL)
    OR
    (status = 'destroyed' AND wrapped_key IS NULL AND wrap_iv IS NULL
      AND wrap_tag IS NULL AND destroyed_at IS NOT NULL)
  );

ALTER TABLE core.dead_letter_queue
  ALTER COLUMN event_type TYPE VARCHAR(128),
  ALTER COLUMN plugin_id TYPE UUID USING plugin_id::uuid,
  ALTER COLUMN error_message TYPE VARCHAR(512),
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN install_id SET NOT NULL,
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN schema_version SET NOT NULL,
  ALTER COLUMN original_topic SET NOT NULL,
  ALTER COLUMN original_partition SET NOT NULL,
  ALTER COLUMN original_offset SET NOT NULL,
  ALTER COLUMN dedupe_key SET NOT NULL;

ALTER TABLE core.dead_letter_queue
  ADD CONSTRAINT dead_letter_queue_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES core.tenants(id),
  ADD CONSTRAINT dead_letter_queue_plugin_id_fkey
    FOREIGN KEY (plugin_id) REFERENCES core.plugins(id),
  ADD CONSTRAINT dead_letter_queue_schema_version_check CHECK (schema_version = 1),
  ADD CONSTRAINT dead_letter_queue_status_check
    CHECK (status IN ('pending', 'retrying', 'retried', 'dismissed')),
  ADD CONSTRAINT dead_letter_queue_dedupe_key_key UNIQUE (dedupe_key);

DROP INDEX IF EXISTS core.idx_dead_letter_queue_status_failed;
CREATE INDEX dead_letter_queue_tenant_status_failed_idx
  ON core.dead_letter_queue(tenant_id, status, failed_at);
CREATE INDEX dead_letter_queue_plugin_status_idx
  ON core.dead_letter_queue(plugin_id, status);
