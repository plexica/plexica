-- Migration: Workspace Templates & Plugin Models (Spec 011 Phase 2)
-- Creates workspace_plugins, workspace_templates, workspace_template_items,
-- and workspace_pages tables.
--
-- NOTE: No explicit BEGIN/COMMIT — Prisma wraps each migration in its own
-- transaction automatically.

-- ----------------------------------------------------------------------------
-- Table: workspace_plugins (per-workspace plugin enablement, ADR-014)
-- ----------------------------------------------------------------------------
CREATE TABLE "core"."workspace_plugins" (
  "workspace_id" TEXT NOT NULL,
  "plugin_id"    TEXT NOT NULL,
  "enabled"      BOOLEAN NOT NULL DEFAULT true,
  "configuration" JSONB NOT NULL DEFAULT '{}',
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("workspace_id", "plugin_id"),
  CONSTRAINT "fk_wp_workspace" FOREIGN KEY ("workspace_id")
    REFERENCES "core"."workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "fk_wp_plugin" FOREIGN KEY ("plugin_id")
    REFERENCES "core"."plugins"("id")
);

CREATE INDEX "idx_workspace_plugins_ws"     ON "core"."workspace_plugins" ("workspace_id");
CREATE INDEX "idx_workspace_plugins_plugin" ON "core"."workspace_plugins" ("plugin_id");

-- ----------------------------------------------------------------------------
-- Table: workspace_templates (plugin-provided templates)
-- ----------------------------------------------------------------------------
CREATE TABLE "core"."workspace_templates" (
  "id"                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"                  TEXT NOT NULL,
  "description"           TEXT,
  "provided_by_plugin_id" TEXT NOT NULL,
  "is_default"            BOOLEAN NOT NULL DEFAULT false,
  "metadata"              JSONB NOT NULL DEFAULT '{}',
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_wt_plugin" FOREIGN KEY ("provided_by_plugin_id")
    REFERENCES "core"."plugins"("id")
);

CREATE INDEX "idx_workspace_templates_plugin" ON "core"."workspace_templates" ("provided_by_plugin_id");

-- ----------------------------------------------------------------------------
-- Table: workspace_template_items (discriminated by type)
-- ----------------------------------------------------------------------------
CREATE TABLE "core"."workspace_template_items" (
  "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "template_id"   TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "plugin_id"     TEXT,
  "page_config"   JSONB,
  "setting_key"   TEXT,
  "setting_value" JSONB,
  "sort_order"    INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_template_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_wti_template" FOREIGN KEY ("template_id")
    REFERENCES "core"."workspace_templates"("id") ON DELETE CASCADE,
  CONSTRAINT "chk_wti_type" CHECK ("type" IN ('plugin', 'page', 'setting'))
);

CREATE INDEX "idx_workspace_template_items_template" ON "core"."workspace_template_items" ("template_id");

-- ----------------------------------------------------------------------------
-- Table: workspace_pages (workspace-scoped pages)
-- ----------------------------------------------------------------------------
CREATE TABLE "core"."workspace_pages" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "workspace_id" TEXT NOT NULL,
  "slug"         TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "config"       JSONB NOT NULL DEFAULT '{}',
  "sort_order"   INTEGER NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "workspace_pages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_wpage_workspace" FOREIGN KEY ("workspace_id")
    REFERENCES "core"."workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "uq_workspace_page_slug" UNIQUE ("workspace_id", "slug")
);

CREATE INDEX "idx_workspace_pages_ws" ON "core"."workspace_pages" ("workspace_id");
