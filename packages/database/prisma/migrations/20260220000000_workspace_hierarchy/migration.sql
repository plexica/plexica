-- Migration: workspace_hierarchy
-- Adds parent_id, depth, path columns to workspaces for materialised path hierarchy.
-- All new columns have safe defaults so existing rows remain valid.
-- See: ADR-013 (Materialised Path), Spec 011 plan.md §3.1

BEGIN;

-- Phase 1: Add hierarchy columns with safe defaults
ALTER TABLE workspaces
  ADD COLUMN parent_id UUID DEFAULT NULL,
  ADD COLUMN depth INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN path VARCHAR NOT NULL DEFAULT '';

-- Phase 2: Add self-referencing foreign key (ON DELETE RESTRICT prevents orphans)
ALTER TABLE workspaces
  ADD CONSTRAINT fk_workspaces_parent
  FOREIGN KEY (parent_id) REFERENCES workspaces(id)
  ON DELETE RESTRICT;

-- Phase 3: Add depth check constraint
ALTER TABLE workspaces
  ADD CONSTRAINT chk_workspaces_depth
  CHECK (depth >= 0);

-- Phase 4: Drop old slug uniqueness constraint, add new sibling-scoped constraint
-- Old constraint enforced UNIQUE(tenant_id, slug) globally.
-- New strategy: children unique among siblings; roots unique via partial index below.
ALTER TABLE workspaces
  DROP CONSTRAINT IF EXISTS workspaces_tenant_slug;

ALTER TABLE workspaces
  ADD CONSTRAINT uq_workspaces_parent_slug
  UNIQUE (parent_id, slug);

-- Phase 5: Partial unique index for root workspaces (parent_id IS NULL).
-- Required because PostgreSQL treats NULL != NULL, so the composite unique
-- constraint alone would allow duplicate root slugs within the same tenant.
CREATE UNIQUE INDEX idx_workspace_root_slug_unique
  ON workspaces (tenant_id, slug)
  WHERE parent_id IS NULL;

-- Phase 6: B-TREE indexes for hierarchy queries
-- NOTE: idx_workspaces_path uses varchar_pattern_ops so that LIKE 'prefix/%'
-- queries are sargable (index scan, not seq scan). Mandatory per plan.md §14.
CREATE INDEX idx_workspaces_parent ON workspaces (parent_id);
CREATE INDEX idx_workspaces_path   ON workspaces USING btree (path varchar_pattern_ops);
CREATE INDEX idx_workspaces_depth  ON workspaces (depth);

-- Phase 7: Ensure workspace_members workspace_id index exists for aggregation queries
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id
  ON workspace_members (workspace_id);

COMMIT;
