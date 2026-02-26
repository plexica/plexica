-- Migration: 20260224000000_add_plugin_lifecycle_status
-- Adds a separate PluginLifecycleStatus enum and lifecycleStatus column to the
-- plugins table. This tracks runtime deployment state (REGISTERED → ACTIVE etc.)
-- independently of the marketplace publishing state (PluginStatus).
-- See ADR-018 for the decision rationale.

-- 1. Create the new enum type in the "core" schema
CREATE TYPE "core"."PluginLifecycleStatus" AS ENUM (
  'REGISTERED',
  'INSTALLING',
  'INSTALLED',
  'ACTIVE',
  'DISABLED',
  'UNINSTALLING',
  'UNINSTALLED'
);

-- 2. Add the column with a default of REGISTERED (safe for all existing rows)
ALTER TABLE "core"."plugins"
  ADD COLUMN "lifecycle_status" "core"."PluginLifecycleStatus" NOT NULL DEFAULT 'REGISTERED';

-- 3. Backfill: PUBLISHED plugins are already deployed, so treat them as INSTALLED
UPDATE "core"."plugins"
  SET "lifecycle_status" = 'INSTALLED'
  WHERE "status" = 'PUBLISHED';

-- 4. Index for efficient status-based queries (e.g. "list all ACTIVE plugins")
CREATE INDEX "idx_plugins_lifecycle_status"
  ON "core"."plugins" ("lifecycle_status");
