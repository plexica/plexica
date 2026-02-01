#!/bin/bash

# ===================================================================
# Plexica Test Reset Script
# ===================================================================
# This script resets the test database to a clean state without
# restarting Docker containers. Useful for running tests sequentially.
# Usage: ./test-infrastructure/scripts/test-reset.sh

set -e

echo "🔄 Resetting test database..."

# Get the root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Load environment variables
if [ -f "$ROOT_DIR/apps/core-api/.env.test" ]; then
  export $(cat "$ROOT_DIR/apps/core-api/.env.test" | grep -v '^#' | xargs)
fi

# Truncate all tables in core schema (preserving structure)
echo "🗑️  Truncating core schema tables..."
docker exec plexica-postgres-test psql -U plexica_test -d plexica_test -c "
DO \$\$
DECLARE
    r RECORD;
BEGIN
    -- Disable triggers temporarily
    SET session_replication_role = replica;
    
    -- Truncate all tables in core schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'core')
    LOOP
        EXECUTE 'TRUNCATE TABLE core.' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
    
    -- Re-enable triggers
    SET session_replication_role = DEFAULT;
END \$\$;
"

# Drop and recreate all tenant schemas
echo "🗑️  Dropping tenant schemas..."
docker exec plexica-postgres-test psql -U plexica_test -d plexica_test -c "
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%')
    LOOP
        EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.schema_name) || ' CASCADE';
    END LOOP;
END \$\$;
"

# Clear Redis cache
echo "🗑️  Clearing Redis cache..."
docker exec plexica-redis-test redis-cli FLUSHALL > /dev/null

# Clear MinIO buckets
echo "🗑️  Clearing MinIO buckets..."
# Note: We use a simple approach - delete and recreate buckets
# This requires mc (MinIO Client) or we do it via the helper in the seed script

# Re-seed minimal test data
echo "🌱 Re-seeding minimal test data..."
cd "$ROOT_DIR"

# Set DATABASE_URL for seed script
export DATABASE_URL="postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core"

# Check if pnpm is available (preferred for monorepo)
if command -v pnpm &> /dev/null; then
  echo "Using pnpm..."
  pnpm exec tsx "$ROOT_DIR/test-infrastructure/fixtures/minimal-seed.ts" || {
    echo "⚠️  Seeding failed"
    exit 1
  }
elif command -v npm &> /dev/null; then
  echo "Using npm..."
  npx tsx "$ROOT_DIR/test-infrastructure/fixtures/minimal-seed.ts" || {
    echo "⚠️  Seeding failed"
    exit 1
  }
else
  echo "❌ Neither pnpm nor npm found. Please install one of them."
  exit 1
fi

echo ""
echo "✅ Test database reset complete!"
echo ""
