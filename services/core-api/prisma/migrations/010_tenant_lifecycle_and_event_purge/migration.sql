CREATE TABLE IF NOT EXISTS core.tenant_lifecycle_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES core.tenants(id),
  target_version INTEGER NOT NULL,
  desired_status core."TenantStatus" NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  last_error_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT tenant_lifecycle_desired_status_check
    CHECK (desired_status IN ('active', 'suspended')),
  CONSTRAINT tenant_lifecycle_status_check
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  CONSTRAINT tenant_lifecycle_attempts_check CHECK (attempts >= 0),
  CONSTRAINT tenant_lifecycle_tenant_version_key UNIQUE (tenant_id, target_version)
);

CREATE INDEX IF NOT EXISTS tenant_lifecycle_reconciliation_claim_idx
  ON core.tenant_lifecycle_reconciliations(status, available_at, lease_expires_at);

INSERT INTO core.tenant_lifecycle_reconciliations (
  tenant_id, target_version, desired_status, status
)
SELECT id, version, 'suspended'::core."TenantStatus", 'pending'
FROM core.tenants
WHERE status = 'suspended'
ON CONFLICT (tenant_id, target_version) DO NOTHING;

ALTER TABLE core.tenant_deletion_steps
  DROP CONSTRAINT IF EXISTS tenant_deletion_steps_step_check;
ALTER TABLE core.tenant_deletion_steps
  ADD CONSTRAINT tenant_deletion_steps_step_check
  CHECK (step IN ('event_data_purge', 'schema_drop', 'realm_delete', 'bucket_delete'));

INSERT INTO core.tenant_deletion_steps (tenant_id, step, status)
SELECT id, 'event_data_purge', 'pending'
FROM core.tenants
WHERE status = 'pending_deletion'
ON CONFLICT (tenant_id, step) DO NOTHING;
