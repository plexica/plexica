-- 002_create_deals.sql
-- CRM plugin: deals/pipeline table in tenant schema.
-- Created in a separate migration to demonstrate multi-migration flow.

CREATE TABLE IF NOT EXISTS crm_deals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  contact_id   UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  title        VARCHAR(255) NOT NULL,
  value        DECIMAL(12, 2) DEFAULT 0,
  stage        VARCHAR(64) NOT NULL DEFAULT 'new',
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for workspace-scoped queries
CREATE INDEX IF NOT EXISTS idx_crm_deals_workspace_id ON crm_deals (workspace_id);

-- Index for stage-based pipeline filtering
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals (stage);

-- Index for contact lookups
CREATE INDEX IF NOT EXISTS idx_crm_deals_contact_id ON crm_deals (contact_id);
