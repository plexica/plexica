-- 001_create_contacts.sql
-- CRM plugin: contacts table in tenant schema.
-- Tables are created with crm_ prefix per plugin table naming convention.

CREATE TABLE IF NOT EXISTS crm_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(64),
  notes       TEXT,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for workspace-scoped queries (enforces isolation)
CREATE INDEX IF NOT EXISTS idx_crm_contacts_workspace_id ON crm_contacts (workspace_id);

-- Index for contact search
CREATE INDEX IF NOT EXISTS idx_crm_contacts_name ON crm_contacts (name);
