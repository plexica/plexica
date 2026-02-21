-- Migration: fix_workspace_fk
-- Drops cross-schema FK constraints on workspace_plugins and workspace_pages
-- that reference core.workspaces(id).
--
-- Background: workspaces are created in per-tenant schemas
-- (e.g. tenant_<slug>.workspaces) by WorkspaceService, not in core.workspaces.
-- The FK constraints added in 20260221000000_workspace_templates are therefore
-- unsatisfiable and cause FK violations when workspace_plugins or workspace_pages
-- rows are inserted. Tenant isolation is enforced at the service layer via
-- JOIN-scoped UPDATE/SELECT (Constitution Art. 5.1, Art. 3.3).
--
-- NOTE: No explicit BEGIN/COMMIT — Prisma wraps each migration in its own
-- transaction automatically.

-- Drop FK from workspace_plugins → core.workspaces
ALTER TABLE "core"."workspace_plugins"
  DROP CONSTRAINT IF EXISTS "fk_wp_workspace";

-- Drop FK from workspace_pages → core.workspaces
ALTER TABLE "core"."workspace_pages"
  DROP CONSTRAINT IF EXISTS "fk_wpage_workspace";
