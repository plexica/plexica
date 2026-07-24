-- Durable context and ownership for distributed GDPR deletion recovery.
ALTER TABLE core.tenants
  ADD COLUMN IF NOT EXISTS deletion_context JSONB;

ALTER TABLE core.tenant_deletion_steps
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenant_deletion_steps_lease
  ON core.tenant_deletion_steps(status, lease_expires_at);
