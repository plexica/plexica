-- Migration: Add tenant_id to workspaces table
-- Date: 2026-01-26
-- Description: Adds tenant_id column to workspaces for proper multi-tenant isolation

-- Step 1: Add tenant_id column (nullable initially)
ALTER TABLE core.workspaces 
ADD COLUMN tenant_id VARCHAR(255);

-- Step 2: Drop the old unique constraint on slug
ALTER TABLE core.workspaces 
DROP CONSTRAINT IF EXISTS workspaces_slug_key;

-- Step 3: For existing workspaces, we need to assign a tenant_id
-- This assumes you have a way to determine which tenant each workspace belongs to
-- Option A: If you know the tenant (e.g., from seed data), update directly:
-- UPDATE core.workspaces SET tenant_id = 'tenant-acme-corp' WHERE id = 'workspace-acme-default';
-- UPDATE core.workspaces SET tenant_id = 'tenant-globex-inc' WHERE id = 'workspace-globex-default';
-- UPDATE core.workspaces SET tenant_id = 'tenant-demo-company' WHERE id = 'workspace-demo-default';

-- Option B: If workspaces are empty/dev environment, you can delete all and recreate via seed
-- DELETE FROM core.workspaces;

-- WARNING: Choose Option A or B based on your environment
-- For development/new installations, Option B (delete all) is safe
-- For production with existing data, use Option A (update each workspace)

-- Step 4: Make tenant_id NOT NULL after assigning values
-- (Uncomment after populating tenant_id values)
-- ALTER TABLE core.workspaces 
-- ALTER COLUMN tenant_id SET NOT NULL;

-- Step 5: Create new unique constraint on (tenant_id, slug)
-- (Uncomment after tenant_id is NOT NULL)
-- ALTER TABLE core.workspaces 
-- ADD CONSTRAINT workspaces_tenant_id_slug_key UNIQUE (tenant_id, slug);

-- Step 6: Add index on tenant_id for query performance
-- (Uncomment after tenant_id is NOT NULL)
-- CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id ON core.workspaces(tenant_id);

-- Step 7: Add index on (tenant_id, slug) for lookups
-- (Uncomment after tenant_id is NOT NULL)
-- CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_id_slug ON core.workspaces(tenant_id, slug);

-- ROLLBACK INSTRUCTIONS (if needed):
-- ALTER TABLE core.workspaces DROP COLUMN tenant_id;
-- ALTER TABLE core.workspaces ADD CONSTRAINT workspaces_slug_key UNIQUE (slug);
