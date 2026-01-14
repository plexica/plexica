#!/bin/bash

# Plexica - Complete Development Setup Script
# Sets up Keycloak realms and database tenants for local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${CYAN}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ██╗     ███████╗██╗  ██╗██╗ ██████╗ █████╗    ║
║   ██╔══██╗██║     ██╔════╝╚██╗██╔╝██║██╔════╝██╔══██╗   ║
║   ██████╔╝██║     █████╗   ╚███╔╝ ██║██║     ███████║   ║
║   ██╔═══╝ ██║     ██╔══╝   ██╔██╗ ██║██║     ██╔══██║   ║
║   ██║     ███████╗███████╗██╔╝ ██╗██║╚██████╗██║  ██║   ║
║   ╚═╝     ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝   ║
║                                                           ║
║              Development Environment Setup                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${YELLOW}This script will set up:${NC}"
echo -e "  1. Keycloak realms (default, test-tenant, tenant1, tenant2)"
echo -e "  2. Keycloak clients (plexica-web)"
echo -e "  3. Test users in each realm"
echo -e "  4. Database tenants"
echo -e "  5. Tenant schemas with tables"
echo ""
echo -e "${YELLOW}Press ENTER to continue or Ctrl+C to cancel...${NC}"
read

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}✗ jq is not installed${NC}"
    echo -e "${YELLOW}Please install jq:${NC}"
    echo -e "  macOS: brew install jq"
    echo -e "  Ubuntu: sudo apt-get install jq"
    exit 1
fi
echo -e "${GREEN}✓ jq is installed${NC}"

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}✗ psql is not installed${NC}"
    echo -e "${YELLOW}Please install PostgreSQL client${NC}"
    exit 1
fi
echo -e "${GREEN}✓ psql is installed${NC}"

# Check if uuidgen is available
if ! command -v uuidgen &> /dev/null; then
    echo -e "${RED}✗ uuidgen is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ uuidgen is installed${NC}"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Step 1: Database Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ -f "${SCRIPT_DIR}/setup-database-tenants.sh" ]; then
    bash "${SCRIPT_DIR}/setup-database-tenants.sh"
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Database setup failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ setup-database-tenants.sh not found${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Step 2: Keycloak Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ -f "${SCRIPT_DIR}/setup-keycloak.sh" ]; then
    bash "${SCRIPT_DIR}/setup-keycloak.sh"
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Keycloak setup failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ setup-keycloak.sh not found${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  🎉 Setup Complete! 🎉${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${CYAN}Your Plexica development environment is ready!${NC}"
echo ""
echo -e "${YELLOW}Quick Start:${NC}"
echo ""
echo -e "${BLUE}1. Start the backend:${NC}"
echo -e "   cd apps/core-api"
echo -e "   pnpm dev"
echo ""
echo -e "${BLUE}2. Start the frontend (in a new terminal):${NC}"
echo -e "   cd apps/web"
echo -e "   pnpm dev"
echo ""
echo -e "${BLUE}3. Access the application:${NC}"
echo -e "   ${GREEN}http://localhost:3002${NC} (or 5173)"
echo ""
echo -e "${BLUE}4. Login with test credentials:${NC}"
echo -e "   Username: ${GREEN}testuser${NC}"
echo -e "   Password: ${GREEN}testpass123${NC}"
echo ""
echo -e "${YELLOW}Available Tenants:${NC}"
echo -e "   • default (URL: localhost → default-realm)"
echo -e "   • test-tenant (URL: test-tenant.localhost → test-tenant-realm)"
echo -e "   • tenant1 (URL: tenant1.localhost → tenant1-realm)"
echo -e "   • tenant2 (URL: tenant2.localhost → tenant2-realm)"
echo ""
echo -e "${YELLOW}Admin Consoles:${NC}"
echo -e "   • Keycloak: ${GREEN}http://localhost:8080/admin${NC}"
echo -e "     User: admin / Pass: admin"
echo ""
echo -e "${YELLOW}Configuration Files:${NC}"
echo -e "   • Frontend: apps/web/.env"
echo -e "   • Backend: apps/core-api/.env"
echo ""
echo -e "${CYAN}For subdomain testing, add to /etc/hosts:${NC}"
echo -e "   127.0.0.1 tenant1.localhost"
echo -e "   127.0.0.1 tenant2.localhost"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"
echo ""
