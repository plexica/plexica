#!/bin/bash

# Plexica - Database Tenant Setup Script (Docker Version)
# Creates necessary tenants in the database for development using Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-plexica-postgres}"
DB_NAME="${DB_NAME:-plexica}"
DB_USER="${DB_USER:-plexica}"

# Tenants to create (must match Keycloak realms)
TENANTS=(
    "default:Default Organization:default-realm"
    "test-tenant:Test Tenant:test-tenant-realm"
    "tenant1:Tenant One:tenant1-realm"
    "tenant2:Tenant Two:tenant2-realm"
)

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Plexica Database Tenant Setup${NC}"
echo -e "${BLUE}  (Docker Version)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Container: ${CONTAINER_NAME}"
echo -e "  Database: ${DB_NAME}"
echo -e "  User: ${DB_USER}"
echo -e "  Tenants to create: ${#TENANTS[@]}"
echo ""

# Check if Docker container is running
echo -e "${BLUE}[1/4]${NC} Checking Docker container..."
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}✗ Container '${CONTAINER_NAME}' is not running${NC}"
    echo -e "${YELLOW}Please start it with: docker-compose up -d postgres${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Container is running${NC}"
echo ""

# Check if database is accessible
echo -e "${BLUE}[2/4]${NC} Checking database connection..."
if ! docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -c '\q' 2>/dev/null; then
    echo -e "${RED}✗ Cannot connect to database${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Check if tenants table exists
echo -e "${BLUE}[3/4]${NC} Checking if tenants table exists..."
TABLE_EXISTS=$(docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -t -c \
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'tenants');" 2>/dev/null | xargs)

if [ "$TABLE_EXISTS" != "t" ]; then
    echo -e "${YELLOW}⚠  Tenants table does not exist${NC}"
    echo -e "${YELLOW}Running Prisma migrations first...${NC}"
    
    # Run Prisma migrations
    if [ -d "packages/database" ]; then
        cd packages/database
        if [ -f "package.json" ]; then
            echo -e "${BLUE}Running: pnpm prisma migrate deploy${NC}"
            pnpm prisma migrate deploy
            cd ../..
        else
            cd ../..
            echo -e "${RED}✗ package.json not found in packages/database${NC}"
            exit 1
        fi
    else
        echo -e "${RED}✗ packages/database directory not found${NC}"
        echo -e "${YELLOW}Please run Prisma migrations manually:${NC}"
        echo -e "  cd packages/database"
        echo -e "  pnpm prisma migrate deploy"
        exit 1
    fi
    
    # Verify table was created
    TABLE_EXISTS=$(docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -t -c \
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'tenants');" 2>/dev/null | xargs)
    
    if [ "$TABLE_EXISTS" != "t" ]; then
        echo -e "${RED}✗ Tenants table still doesn't exist after migration${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Tenants table created${NC}"
else
    echo -e "${GREEN}✓ Tenants table exists${NC}"
fi
echo ""

# Function to create a tenant using Docker exec
create_tenant() {
    local slug=$1
    local name=$2
    local realm=$3
    
    echo -e "${BLUE}Creating tenant: ${slug}...${NC}"
    
    # Check if tenant already exists
    TENANT_EXISTS=$(docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -t -c \
        "SELECT COUNT(*) FROM core.tenants WHERE slug = '${slug}';" 2>/dev/null | xargs)
    
    if [ "$TENANT_EXISTS" -gt 0 ]; then
        echo -e "${YELLOW}  ⊙ Tenant '${slug}' already exists, skipping...${NC}"
        return 0
    fi
    
    # Generate UUID (use SQL function for portability)
    TENANT_ID=$(docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -t -c \
        "SELECT gen_random_uuid();" 2>/dev/null | xargs)
    
    # Create tenant
    SQL=$(cat <<EOF
INSERT INTO core.tenants (id, slug, name, status, created_at, updated_at)
VALUES (
    '${TENANT_ID}',
    '${slug}',
    '${name}',
    'ACTIVE',
    NOW(),
    NOW()
);
EOF
    )
    
    if docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -c "${SQL}" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✓ Tenant '${slug}' created${NC}"
        echo -e "${GREEN}    ID: ${TENANT_ID}${NC}"
        echo -e "${GREEN}    Name: ${name}${NC}"
        echo -e "${GREEN}    Realm: ${realm}${NC}"
        
        # Create tenant schema
        echo -e "${BLUE}  Creating schema for tenant '${slug}'...${NC}"
        SCHEMA_NAME="tenant_${slug//-/_}"
        
        SCHEMA_SQL=$(cat <<EOF
CREATE SCHEMA IF NOT EXISTS "${SCHEMA_NAME}";

-- Workspaces table
CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}".workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(slug)
);

-- Workspace members table
CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}".workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES "${SCHEMA_NAME}".workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

-- Teams table
CREATE TABLE IF NOT EXISTS "${SCHEMA_NAME}".teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES "${SCHEMA_NAME}".workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON "${SCHEMA_NAME}".workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON "${SCHEMA_NAME}".workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_workspace_id ON "${SCHEMA_NAME}".teams(workspace_id);
EOF
        )
        
        if docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -c "${SCHEMA_SQL}" > /dev/null 2>&1; then
            echo -e "${GREEN}  ✓ Schema '${SCHEMA_NAME}' created with tables${NC}"
        else
            echo -e "${RED}  ✗ Failed to create schema '${SCHEMA_NAME}'${NC}"
            return 1
        fi
    else
        echo -e "${RED}  ✗ Failed to create tenant '${slug}'${NC}"
        return 1
    fi
}

# Main setup process
echo -e "${BLUE}[4/4]${NC} Creating tenants and schemas..."
echo ""
for tenant_config in "${TENANTS[@]}"; do
    IFS=':' read -r slug name realm <<< "$tenant_config"
    create_tenant "$slug" "$name" "$realm"
    echo ""
done

# Verification
echo -e "${BLUE}Verifying tenant creation...${NC}"
TENANT_COUNT=$(docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -t -c \
    "SELECT COUNT(*) FROM core.tenants WHERE status = 'ACTIVE';" 2>/dev/null | xargs)

echo -e "${GREEN}✓ Total active tenants: ${TENANT_COUNT}${NC}"
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Created Tenants:${NC}"
docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -c \
    "SELECT slug, name, status FROM core.tenants ORDER BY slug;" 2>/dev/null

echo ""
echo -e "${YELLOW}Tenant Schemas Created:${NC}"
docker exec ${CONTAINER_NAME} psql -U ${DB_USER} -d ${DB_NAME} -c \
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name;" 2>/dev/null

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Run Keycloak setup: ./scripts/setup-keycloak.sh"
echo -e "  2. Start backend API: cd apps/core-api && pnpm dev"
echo -e "  3. Start frontend: cd apps/web && pnpm dev"
echo -e "  4. Access app with tenant URL"
echo ""
