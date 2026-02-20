-- Migration: workspace_hierarchy_backfill
-- Backfills path and depth for all existing root workspaces.
-- Must run AFTER 20260220000000_workspace_hierarchy.
-- See: Spec 011 plan.md §3.2

BEGIN;

-- Set path = id (as text) and depth = 0 for all existing root workspaces.
-- Root workspaces have parent_id IS NULL and have not yet been given a path.
-- This is idempotent: the WHERE clause skips rows already backfilled.
UPDATE workspaces
  SET path = id::text, depth = 0
  WHERE parent_id IS NULL AND path = '';

-- Verification: assert no root workspaces remain with empty path.
-- This will raise an exception (aborting the migration) if backfill is incomplete.
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
    FROM workspaces
    WHERE path = '' AND parent_id IS NULL;

  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'workspace_hierarchy_backfill: % root workspaces still have empty path after backfill',
      remaining_count;
  END IF;
END $$;

COMMIT;
