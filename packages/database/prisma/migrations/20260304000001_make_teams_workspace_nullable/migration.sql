-- Migration: make core.teams.workspace_id nullable and drop FK to core.users
--
-- Context (Spec 008 Admin Interfaces):
-- Teams can be created by tenant admins without an associated workspace.
-- User identities are managed in Keycloak; owner_id is not guaranteed to exist
-- in core.users at team-creation time, so the FK is removed.
--
-- Per-tenant team tables (managed by SchemaStep) are updated inline in
-- schema-step.ts and are created fresh for each new tenant.

-- Drop the NOT NULL constraint on workspace_id
ALTER TABLE "core"."teams" ALTER COLUMN "workspace_id" DROP NOT NULL;

-- Drop FK from workspace_id to workspaces (we keep the cascade-delete behavior
-- only when workspace_id IS set, enforced at application layer)
ALTER TABLE "core"."teams" DROP CONSTRAINT IF EXISTS "teams_workspace_id_fkey";

-- Re-add FK as optional (allows NULL, but if set must reference a valid workspace)
ALTER TABLE "core"."teams"
  ADD CONSTRAINT "teams_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "core"."workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- Drop FK from owner_id to users (owner is a Keycloak user ID, not a core.users row)
ALTER TABLE "core"."teams" DROP CONSTRAINT IF EXISTS "teams_owner_id_fkey";
