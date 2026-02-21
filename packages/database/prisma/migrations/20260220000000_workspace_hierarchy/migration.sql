-- Migration: workspace_hierarchy
-- Adds tenant_id, parent_id, depth, path columns to workspaces for
-- materialised path hierarchy. All new columns have safe defaults so
-- existing rows remain valid.
-- See: ADR-013 (Materialised Path), Spec 011 plan.md §3.1
--
-- NOTE: No explicit BEGIN/COMMIT — Prisma wraps each migration in its own
-- transaction automatically. Nesting transactions causes "current transaction
-- is aborted" errors on PostgreSQL.

-- Phase 1: Add tenant_id (workspaces were not yet tenant-scoped)
ALTER TABLE "core"."workspaces"
  ADD COLUMN "tenant_id" TEXT;

-- Backfill tenant_id for any existing rows (set to empty string placeholder;
-- real tenant assignment is an application-level concern).
UPDATE "core"."workspaces" SET "tenant_id" = '' WHERE "tenant_id" IS NULL;

-- Make tenant_id NOT NULL after backfill
ALTER TABLE "core"."workspaces"
  ALTER COLUMN "tenant_id" SET NOT NULL;

-- Phase 2: Add hierarchy columns with safe defaults
ALTER TABLE "core"."workspaces"
  ADD COLUMN "parent_id" TEXT DEFAULT NULL,
  ADD COLUMN "depth"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "path"      VARCHAR NOT NULL DEFAULT '';

-- Phase 3: Add self-referencing foreign key (ON DELETE RESTRICT prevents orphans)
ALTER TABLE "core"."workspaces"
  ADD CONSTRAINT "fk_workspaces_parent"
  FOREIGN KEY ("parent_id") REFERENCES "core"."workspaces"("id")
  ON DELETE RESTRICT;

-- Phase 4: Add depth check constraint
ALTER TABLE "core"."workspaces"
  ADD CONSTRAINT "chk_workspaces_depth"
  CHECK ("depth" >= 0);

-- Phase 5: Drop old global slug uniqueness index and replace with sibling-scoped unique constraint.
-- The original index "workspaces_slug_key" enforced UNIQUE(slug) globally.
-- New strategy: children unique among siblings; roots unique via partial index below.
DROP INDEX IF EXISTS "core"."workspaces_slug_key";

ALTER TABLE "core"."workspaces"
  ADD CONSTRAINT "uq_workspaces_parent_slug"
  UNIQUE ("parent_id", "slug");

-- Phase 6: Partial unique index for root workspaces (parent_id IS NULL).
-- Required because PostgreSQL treats NULL != NULL, so the composite unique
-- constraint alone would allow duplicate root slugs within the same tenant.
CREATE UNIQUE INDEX "idx_workspace_root_slug_unique"
  ON "core"."workspaces" ("tenant_id", "slug")
  WHERE "parent_id" IS NULL;

-- Phase 7: B-TREE indexes for hierarchy queries
-- NOTE: idx_workspaces_path uses varchar_pattern_ops so that LIKE 'prefix/%'
-- queries are sargable (index scan, not seq scan). Mandatory per plan.md §14.
CREATE INDEX "idx_workspaces_tenant"  ON "core"."workspaces" ("tenant_id");
CREATE INDEX "idx_workspaces_parent"  ON "core"."workspaces" ("parent_id");
CREATE INDEX "idx_workspaces_path"    ON "core"."workspaces" USING btree ("path" varchar_pattern_ops);
CREATE INDEX "idx_workspaces_depth"   ON "core"."workspaces" ("depth");

-- Phase 8: Ensure workspace_members workspace_id index exists for aggregation queries
CREATE INDEX IF NOT EXISTS "idx_workspace_members_workspace_id"
  ON "core"."workspace_members" ("workspace_id");
