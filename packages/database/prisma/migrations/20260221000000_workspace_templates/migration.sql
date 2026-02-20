-- Migration: Workspace Templates & Plugin Models (Spec 011 Phase 2)
-- Creates workspace_plugins, workspace_templates, workspace_template_items,
-- and workspace_pages tables.
-- All operations wrapped in a transaction for atomicity.

BEGIN;

-- ----------------------------------------------------------------------------
-- Table: workspace_plugins (per-workspace plugin enablement, ADR-014)
-- ----------------------------------------------------------------------------
CREATE TABLE workspace_plugins (
  workspace_id UUID NOT NULL,
  plugin_id    VARCHAR NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  configuration JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, plugin_id),
  CONSTRAINT fk_wp_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT fk_wp_plugin FOREIGN KEY (plugin_id)
    REFERENCES plugins(id)
);

CREATE INDEX idx_workspace_plugins_ws     ON workspace_plugins (workspace_id);
CREATE INDEX idx_workspace_plugins_plugin ON workspace_plugins (plugin_id);

-- ----------------------------------------------------------------------------
-- Table: workspace_templates (plugin-provided templates)
-- ----------------------------------------------------------------------------
CREATE TABLE workspace_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR NOT NULL,
  description           TEXT,
  provided_by_plugin_id VARCHAR NOT NULL,
  is_default            BOOLEAN NOT NULL DEFAULT false,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_wt_plugin FOREIGN KEY (provided_by_plugin_id)
    REFERENCES plugins(id)
);

CREATE INDEX idx_workspace_templates_plugin ON workspace_templates (provided_by_plugin_id);

-- ----------------------------------------------------------------------------
-- Table: workspace_template_items (discriminated by type)
-- ----------------------------------------------------------------------------
CREATE TABLE workspace_template_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   UUID NOT NULL,
  type          VARCHAR NOT NULL,
  plugin_id     VARCHAR,
  page_config   JSONB,
  setting_key   VARCHAR,
  setting_value JSONB,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_wti_template FOREIGN KEY (template_id)
    REFERENCES workspace_templates(id) ON DELETE CASCADE,
  CONSTRAINT chk_wti_type CHECK (type IN ('plugin', 'page', 'setting'))
);

CREATE INDEX idx_workspace_template_items_template ON workspace_template_items (template_id);

-- ----------------------------------------------------------------------------
-- Table: workspace_pages (workspace-scoped pages)
-- ----------------------------------------------------------------------------
CREATE TABLE workspace_pages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  slug         VARCHAR NOT NULL,
  title        VARCHAR NOT NULL,
  config       JSONB NOT NULL DEFAULT '{}',
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_wpage_workspace FOREIGN KEY (workspace_id)
    REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT uq_workspace_page_slug UNIQUE (workspace_id, slug)
);

CREATE INDEX idx_workspace_pages_ws ON workspace_pages (workspace_id);

COMMIT;
