-- Migration: 20260308000000_create_layout_configs
-- Spec 014 Frontend Layout Engine: layout_configs table
-- ADR-002: layout_configs lives in the TENANT schema (not core schema).
--   Each tenant gets its own layout_configs table provisioned at creation time.
--   This migration is applied per-tenant via TenantMigrationService, which
--   substitutes the {tenant_schema} placeholder with the actual schema name
--   (e.g. "tenant_acme") before executing the SQL.
--
-- Key design decisions (plan.md §3.1–3.4):
--   - plugin_id is stored as UUID but NOT a FK (cross-schema FK unsupported — ADR-002).
--     Validated at the application layer by LayoutConfigService.
--   - Two PARTIAL unique indexes handle NULL scope_id for tenant-scope rows
--     (PostgreSQL treats NULL ≠ NULL in unique indexes).
--   - deleted_at IS NULL in unique index predicates ensures soft-deleted rows
--     do not conflict with active configs (FR-024).
--   - updated_at serves as ETag for optimistic concurrency control.

-- ============================================================================
-- layout_configs table (Tenant Schema Template)
-- ============================================================================

CREATE TABLE IF NOT EXISTS {tenant_schema}."layout_configs" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "form_id"          VARCHAR(255)   NOT NULL,
  "plugin_id"        UUID           NOT NULL,
  "scope_type"       VARCHAR(20)    NOT NULL CHECK ("scope_type" IN ('tenant', 'workspace')),
  "scope_id"         UUID,          -- NULL for tenant scope; workspace UUID for workspace scope
  "fields"           JSONB          NOT NULL DEFAULT '[]',
  "sections"         JSONB          NOT NULL DEFAULT '[]',
  "columns"          JSONB          NOT NULL DEFAULT '[]',
  "previous_version" JSONB,         -- Snapshot for single-step undo (FR-018, FR-019)
  "created_by"       UUID           NOT NULL,
  "updated_by"       UUID           NOT NULL,
  "deleted_at"       TIMESTAMPTZ,   -- Soft delete on plugin uninstall (FR-024)
  "created_at"       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ    NOT NULL DEFAULT now(),

  CONSTRAINT "layout_configs_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- Indexes (plan.md §3.3)
-- ============================================================================

-- Unique: one active tenant-scope config per (form_id, plugin_id).
-- plugin_id is included to avoid cross-plugin form_id collisions (P1-A fix).
-- Uses partial index to handle NULL scope_id (PostgreSQL NULL ≠ NULL).
-- deleted_at IS NULL ensures soft-deleted rows don't conflict.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_layout_tenant"
  ON {tenant_schema}."layout_configs" ("form_id", "plugin_id")
  WHERE "scope_type" = 'tenant' AND "deleted_at" IS NULL;

-- Unique: one active workspace-scope config per (form_id, plugin_id, scope_id).
-- plugin_id added to match tenant-scope uniqueness invariant.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_layout_workspace"
  ON {tenant_schema}."layout_configs" ("form_id", "plugin_id", "scope_id")
  WHERE "scope_type" = 'workspace' AND "deleted_at" IS NULL;

-- B-tree: fast lookup by plugin_id (for cascade soft-delete on plugin uninstall).
CREATE INDEX IF NOT EXISTS "idx_layout_configs_plugin"
  ON {tenant_schema}."layout_configs" ("plugin_id");

-- B-tree partial: fast lookup by scope_id (for workspace-scoped resolution).
CREATE INDEX IF NOT EXISTS "idx_layout_configs_scope_workspace"
  ON {tenant_schema}."layout_configs" ("scope_id")
  WHERE "scope_type" = 'workspace';
