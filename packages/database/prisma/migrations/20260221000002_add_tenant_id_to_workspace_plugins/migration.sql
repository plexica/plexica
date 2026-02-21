-- Migration: add_tenant_id_to_workspace_plugins
-- Adds tenant_id column to workspace_plugins to enable tenant-scoped queries
-- without cross-schema JOINs to tenant-schema workspaces tables.
--
-- Background: workspace_plugins lives in the core schema. The workspaces table
-- that stores actual workspace rows lives in per-tenant schemas (tenant_<slug>).
-- Service-level JOINs on "workspaces" previously joined against core.workspaces
-- (empty), making disablePlugin, updateConfig, and cascadeDisable always fail.
-- Storing tenant_id directly in workspace_plugins removes the cross-schema JOIN.
--
-- NOTE: No explicit BEGIN/COMMIT — Prisma wraps each migration in its own
-- transaction automatically.

-- Add tenant_id column (nullable initially to avoid issues with existing rows)
ALTER TABLE "core"."workspace_plugins"
  ADD COLUMN IF NOT EXISTS "tenant_id" TEXT;

-- Backfill any existing rows (none expected in test/prod yet)
UPDATE "core"."workspace_plugins" SET "tenant_id" = '' WHERE "tenant_id" IS NULL;

-- Make NOT NULL
ALTER TABLE "core"."workspace_plugins"
  ALTER COLUMN "tenant_id" SET NOT NULL;

-- Index for cascade-disable queries (filter by plugin_id + tenant_id)
CREATE INDEX IF NOT EXISTS "idx_workspace_plugins_tenant"
  ON "core"."workspace_plugins" ("tenant_id");
