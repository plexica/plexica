#!/bin/bash

# ===================================================================
# Plexica Test Setup Script
# ===================================================================
# This script starts the test infrastructure and prepares the environment
# Usage: ./test-infrastructure/scripts/test-setup.sh

set -e

echo "🚀 Starting Plexica test infrastructure..."

# Get the root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$ROOT_DIR/test-infrastructure/docker"

# Load environment variables
if [ -f "$ROOT_DIR/apps/core-api/.env.test" ]; then
  export $(cat "$ROOT_DIR/apps/core-api/.env.test" | grep -v '^#' | xargs)
fi

echo "📁 Root directory: $ROOT_DIR"
echo "🐳 Docker directory: $DOCKER_DIR"

# Detect docker compose command (v2 uses 'docker compose', v1 uses 'docker-compose')
if docker compose version &> /dev/null; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
  DOCKER_COMPOSE="docker-compose"
else
  echo "❌ Neither 'docker compose' nor 'docker-compose' found"
  exit 1
fi

# Start Docker containers
echo ""
echo "🐳 Starting Docker containers..."
cd "$DOCKER_DIR"
$DOCKER_COMPOSE -f docker-compose.test.yml up -d

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'until docker exec plexica-postgres-test pg_isready -U plexica_test > /dev/null 2>&1; do sleep 1; done' || {
  echo "❌ PostgreSQL failed to start"
  exit 1
}
echo "✅ PostgreSQL is ready"

echo ""
echo "⏳ Waiting for Keycloak to be ready..."
timeout 120 bash -c 'until curl -sf http://localhost:9000/health/ready > /dev/null 2>&1; do sleep 2; done' || {
  echo "❌ Keycloak failed to start"
  exit 1
}
echo "✅ Keycloak is ready"

echo ""
echo "⏳ Waiting for Redis to be ready..."
timeout 30 bash -c 'until docker exec plexica-redis-test redis-cli ping > /dev/null 2>&1; do sleep 1; done' || {
  echo "❌ Redis failed to start"
  exit 1
}
echo "✅ Redis is ready"

echo ""
echo "⏳ Waiting for MinIO to be ready..."
timeout 30 bash -c 'until curl -sf http://localhost:9010/minio/health/live > /dev/null 2>&1; do sleep 1; done' || {
  echo "❌ MinIO failed to start"
  exit 1
}
echo "✅ MinIO is ready"

# Run database migrations
echo ""
echo "🔧 Running database migrations..."
cd "$ROOT_DIR/packages/database"

# Set environment variable
export DATABASE_URL="postgresql://plexica_test:plexica_test_password@localhost:5433/plexica_test?schema=core"

# Use test config for Prisma
npx prisma migrate deploy --config prisma/prisma.config.test.ts || {
  echo "❌ Migration failed!"
  echo "Trying to create database with prisma db push..."
  npx prisma db push --config prisma/prisma.config.test.ts || {
    echo "❌ Failed to create database schema"
    exit 1
  }
}

# Generate Prisma client
echo ""
echo "🔧 Generating Prisma client..."
npx prisma generate --config prisma/prisma.config.test.ts

# Seed minimal test data
echo ""
echo "🌱 Seeding minimal test data..."
cd "$ROOT_DIR"

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
echo "✅ Test infrastructure is ready!"
echo ""
echo "📊 Service endpoints:"
echo "   PostgreSQL: localhost:5433"
echo "   Keycloak:   http://localhost:8081"
echo "   Redis:      localhost:6380"
echo "   MinIO:      http://localhost:9010"
echo ""
echo "🔑 Test credentials:"
echo "   Super Admin:  super-admin@test.plexica.local / test123"
echo "   Tenant Admin: admin@acme.test / test123"
echo "   Tenant Member: member@acme.test / test123"
echo ""
