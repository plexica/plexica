#!/bin/bash

# Verification script for E2E test environment
# Run this before executing tests to ensure everything is ready

echo "🔍 Plexica E2E Test Environment Verification"
echo "=============================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0
warnings=0

# Function to check if a port is open
check_port() {
    local port=$1
    local service=$2
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✅ $service${NC} is running on port $port"
    else
        echo -e "${RED}❌ $service${NC} is NOT running on port $port"
        ((errors++))
    fi
}

# Check required ports
echo "📡 Checking Services..."
check_port 5432 "PostgreSQL"
check_port 6379 "Redis"
check_port 3000 "Core API"
check_port 3002 "Super-Admin"

# Optional: Keycloak
if nc -z localhost 8080 2>/dev/null; then
    echo -e "${GREEN}✅ Keycloak${NC} is running on port 8080"
else
    echo -e "${YELLOW}⚠️  Keycloak${NC} is NOT running on port 8080 (may be optional)"
    ((warnings++))
fi

echo ""

# Check if super-admin is accessible
echo "🌐 Checking Super-Admin App..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 | grep -q "200\|301\|302"; then
    echo -e "${GREEN}✅ Super-Admin app${NC} is accessible at http://localhost:3002"
else
    echo -e "${RED}❌ Super-Admin app${NC} is NOT accessible at http://localhost:3002"
    ((errors++))
fi

echo ""

# Check if core API is accessible
echo "🔌 Checking Core API..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}✅ Core API${NC} is responding at http://localhost:3000"
else
    echo -e "${YELLOW}⚠️  Core API${NC} may not have a /health endpoint (this is OK)"
    ((warnings++))
fi

echo ""

# Check if Playwright is installed
echo "🎭 Checking Playwright..."
if [ -d "node_modules/@playwright/test" ] || [ -d "../../node_modules/@playwright/test" ]; then
    echo -e "${GREEN}✅ Playwright${NC} is installed"
    
    # Check if browsers are installed
    if command -v npx &> /dev/null; then
        if npx playwright --version &> /dev/null; then
            echo -e "${GREEN}✅ Playwright browsers${NC} are ready"
        else
            echo -e "${YELLOW}⚠️  Playwright browsers${NC} may need installation. Run: npx playwright install chromium"
            ((warnings++))
        fi
    fi
else
    echo -e "${RED}❌ Playwright${NC} is NOT installed. Run: pnpm install"
    ((errors++))
fi

echo ""

# Check if auth directory exists
echo "🔐 Checking Authentication Setup..."
if [ -d "tests/e2e/.auth" ]; then
    echo -e "${GREEN}✅ Auth directory${NC} exists"
    
    if [ -f "tests/e2e/.auth/user.json" ]; then
        echo -e "${GREEN}✅ Auth state file${NC} exists (from previous run)"
    else
        echo -e "${YELLOW}⚠️  Auth state file${NC} doesn't exist yet (will be created on first run)"
        ((warnings++))
    fi
else
    echo -e "${RED}❌ Auth directory${NC} doesn't exist. Creating it..."
    mkdir -p tests/e2e/.auth
    ((warnings++))
fi

echo ""

# Check if global setup exists
if [ -f "tests/e2e/global-setup.ts" ]; then
    echo -e "${GREEN}✅ Global setup${NC} file exists"
else
    echo -e "${RED}❌ Global setup${NC} file is missing"
    ((errors++))
fi

echo ""

# Summary
echo "📊 Summary"
echo "=========="

if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✅ All checks passed!${NC} You're ready to run E2E tests."
    echo ""
    echo "Run tests with:"
    echo "  pnpm test:e2e"
    exit 0
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠️  ${warnings} warning(s)${NC} - tests may still work"
    echo ""
    echo "You can try running tests with:"
    echo "  pnpm test:e2e"
    exit 0
else
    echo -e "${RED}❌ ${errors} error(s)${NC} - please fix before running tests"
    echo ""
    echo "Common fixes:"
    echo "  1. Start infrastructure: pnpm infra:start"
    echo "  2. Start core-api: cd apps/core-api && pnpm dev"
    echo "  3. Start super-admin: cd apps/super-admin && pnpm dev"
    echo "  4. Install dependencies: pnpm install"
    echo ""
    echo "See AUTH_SETUP.md for more help"
    exit 1
fi
