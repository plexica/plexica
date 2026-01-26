# Database Migrations

This directory contains manual SQL migrations that need to be run in specific scenarios.

## Migration Files

### `add_tenant_id_to_workspaces.sql`

**Purpose**: Adds `tenant_id` column to the `workspaces` table for proper multi-tenant isolation.

**When to run**:

- Before deploying code changes that expect `tenant_id` on Workspace model
- After updating Prisma schema with tenantId field

**How to run**:

1. **Development/Fresh Install** (no existing workspace data):

   ```bash
   # Option 1: Use Prisma db push (will auto-generate migration)
   cd packages/database
   pnpm prisma db push

   # Option 2: Run SQL manually
   psql $DATABASE_URL -f migrations/add_tenant_id_to_workspaces.sql
   ```

2. **Production/Existing Data**:

   ```bash
   # Step 1: Add column (nullable)
   psql $DATABASE_URL -c "ALTER TABLE core.workspaces ADD COLUMN tenant_id VARCHAR(255);"

   # Step 2: Update existing records with correct tenant_id
   # (customize based on your data)
   psql $DATABASE_URL -c "UPDATE core.workspaces SET tenant_id = 'your-tenant-id' WHERE ..."

   # Step 3: Make NOT NULL and add constraints
   psql $DATABASE_URL -c "ALTER TABLE core.workspaces ALTER COLUMN tenant_id SET NOT NULL;"
   psql $DATABASE_URL -c "ALTER TABLE core.workspaces ADD CONSTRAINT workspaces_tenant_id_slug_key UNIQUE (tenant_id, slug);"
   psql $DATABASE_URL -c "CREATE INDEX idx_workspaces_tenant_id ON core.workspaces(tenant_id);"
   ```

**Verification**:

```sql
-- Check column exists
\d core.workspaces

-- Check constraints
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'core.workspaces'::regclass;

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'workspaces' AND schemaname = 'core';
```

## Best Practices

1. **Always backup before running migrations in production**
2. **Test migrations in staging environment first**
3. **Run migrations during maintenance windows**
4. **Keep rollback instructions handy**
5. **Use Prisma migrations for new projects** (`prisma migrate dev`)
