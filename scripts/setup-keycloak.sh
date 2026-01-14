#!/bin/bash

# Plexica - Keycloak Automated Setup Script
# This script configures Keycloak with realms, clients, and test users for development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASS:-admin}"
CLIENT_ID="plexica-web"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3002}"

# Realms to create (add more as needed)
REALMS=("default" "test-tenant" "tenant1" "tenant2")

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Plexica Keycloak Setup Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo -e "  Keycloak URL: ${KEYCLOAK_URL}"
echo -e "  Admin User: ${ADMIN_USER}"
echo -e "  Client ID: ${CLIENT_ID}"
echo -e "  Frontend URL: ${FRONTEND_URL}"
echo -e "  Realms to create: ${REALMS[*]}"
echo ""

# Check if Keycloak is running
echo -e "${BLUE}[1/6]${NC} Checking if Keycloak is running..."
if ! curl -s -f "${KEYCLOAK_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Keycloak is not running at ${KEYCLOAK_URL}${NC}"
    echo -e "${YELLOW}Please start Keycloak first:${NC}"
    echo -e "  docker-compose up -d keycloak"
    exit 1
fi
echo -e "${GREEN}✓ Keycloak is running${NC}"
echo ""

# Wait for Keycloak to be fully ready
echo -e "${BLUE}[2/6]${NC} Waiting for Keycloak to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f "${KEYCLOAK_URL}/realms/master" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Keycloak is ready${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo -n "."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "\n${RED}✗ Keycloak did not become ready in time${NC}"
    exit 1
fi
echo ""

# Get admin access token
echo -e "${BLUE}[3/6]${NC} Obtaining admin access token..."
ADMIN_TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${ADMIN_USER}" \
  -d "password=${ADMIN_PASS}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    echo -e "${RED}✗ Failed to obtain admin token${NC}"
    echo -e "${YELLOW}Please check admin credentials${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Admin token obtained${NC}"
echo ""

# Function to create a realm
create_realm() {
    local realm_name=$1
    # Capitalize first letter (bash 3.x compatible)
    local first_letter=$(echo ${realm_name:0:1} | tr '[:lower:]' '[:upper:]')
    local rest_letters=${realm_name:1}
    local realm_display_name="${first_letter}${rest_letters} Realm"
    
    echo -e "${BLUE}Creating realm: ${realm_name}-realm...${NC}"
    
    # Check if realm already exists
    REALM_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${realm_name}-realm")
    
    if [ "$REALM_EXISTS" = "200" ]; then
        echo -e "${YELLOW}  ⊙ Realm '${realm_name}-realm' already exists, skipping...${NC}"
        return 0
    fi
    
    # Create realm
    REALM_JSON=$(cat <<EOF
{
  "realm": "${realm_name}-realm",
  "displayName": "${realm_display_name}",
  "enabled": true,
  "sslRequired": "none",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "editUsernameAllowed": false,
  "bruteForceProtected": true,
  "rememberMe": true,
  "loginTheme": "keycloak",
  "accessTokenLifespan": 3600,
  "ssoSessionIdleTimeout": 86400,
  "ssoSessionMaxLifespan": 864000
}
EOF
    )
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${KEYCLOAK_URL}/admin/realms" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "${REALM_JSON}")
    
    if [ "$RESPONSE" = "201" ]; then
        echo -e "${GREEN}  ✓ Realm '${realm_name}-realm' created${NC}"
    else
        echo -e "${RED}  ✗ Failed to create realm '${realm_name}-realm' (HTTP ${RESPONSE})${NC}"
        return 1
    fi
}

# Function to create a client in a realm
create_client() {
    local realm_name=$1
    
    echo -e "${BLUE}Creating client '${CLIENT_ID}' in ${realm_name}-realm...${NC}"
    
    # Check if client already exists
    CLIENT_ID_PARAM=$(echo "${CLIENT_ID}" | jq -sRr @uri)
    EXISTING_CLIENTS=$(curl -s \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${realm_name}-realm/clients?clientId=${CLIENT_ID_PARAM}")
    
    if [ "$(echo $EXISTING_CLIENTS | jq 'length')" -gt 0 ]; then
        echo -e "${YELLOW}  ⊙ Client '${CLIENT_ID}' already exists in '${realm_name}-realm', skipping...${NC}"
        return 0
    fi
    
    # Create client
    CLIENT_JSON=$(cat <<EOF
{
  "clientId": "${CLIENT_ID}",
  "name": "Plexica Web Application",
  "description": "Frontend web client for Plexica platform",
  "enabled": true,
  "protocol": "openid-connect",
  "publicClient": true,
  "directAccessGrantsEnabled": false,
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "serviceAccountsEnabled": false,
  "authorizationServicesEnabled": false,
  "fullScopeAllowed": true,
  "redirectUris": [
    "${FRONTEND_URL}/*",
    "http://localhost:5173/*",
    "http://localhost:3001/*",
    "http://localhost:3002/*"
  ],
  "webOrigins": [
    "${FRONTEND_URL}",
    "http://localhost:5173",
    "http://localhost:3001",
    "http://localhost:3002"
  ],
  "attributes": {
    "pkce.code.challenge.method": "S256"
  }
}
EOF
    )
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${KEYCLOAK_URL}/admin/realms/${realm_name}-realm/clients" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "${CLIENT_JSON}")
    
    if [ "$RESPONSE" = "201" ]; then
        echo -e "${GREEN}  ✓ Client '${CLIENT_ID}' created in '${realm_name}-realm'${NC}"
    else
        echo -e "${RED}  ✗ Failed to create client in '${realm_name}-realm' (HTTP ${RESPONSE})${NC}"
        return 1
    fi
}

# Function to create a test user
create_test_user() {
    local realm_name=$1
    local username="testuser"
    local password="testpass123"
    local email="test@plexica.dev"
    local first_name="Test"
    local last_name="User"
    
    echo -e "${BLUE}Creating test user '${username}' in ${realm_name}-realm...${NC}"
    
    # Check if user already exists
    EXISTING_USER=$(curl -s \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        "${KEYCLOAK_URL}/admin/realms/${realm_name}-realm/users?username=${username}" | jq -r '.[0].id')
    
    if [ "$EXISTING_USER" != "null" ] && [ -n "$EXISTING_USER" ]; then
        echo -e "${YELLOW}  ⊙ User '${username}' already exists in '${realm_name}-realm', skipping...${NC}"
        return 0
    fi
    
    # Create user
    USER_JSON=$(cat <<EOF
{
  "username": "${username}",
  "email": "${email}",
  "firstName": "${first_name}",
  "lastName": "${last_name}",
  "enabled": true,
  "emailVerified": true,
  "credentials": [
    {
      "type": "password",
      "value": "${password}",
      "temporary": false
    }
  ]
}
EOF
    )
    
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${KEYCLOAK_URL}/admin/realms/${realm_name}-realm/users" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "${USER_JSON}")
    
    if [ "$RESPONSE" = "201" ]; then
        echo -e "${GREEN}  ✓ User '${username}' created in '${realm_name}-realm'${NC}"
        echo -e "${GREEN}    Username: ${username}${NC}"
        echo -e "${GREEN}    Password: ${password}${NC}"
        echo -e "${GREEN}    Email: ${email}${NC}"
    else
        echo -e "${RED}  ✗ Failed to create user in '${realm_name}-realm' (HTTP ${RESPONSE})${NC}"
        return 1
    fi
}

# Main setup process
echo -e "${BLUE}[4/6]${NC} Creating realms..."
for realm in "${REALMS[@]}"; do
    create_realm "$realm"
    echo ""
done

echo -e "${BLUE}[5/6]${NC} Creating clients..."
for realm in "${REALMS[@]}"; do
    create_client "$realm"
    echo ""
done

echo -e "${BLUE}[6/6]${NC} Creating test users..."
for realm in "${REALMS[@]}"; do
    create_test_user "$realm"
    echo ""
done

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Created Realms:${NC}"
for realm in "${REALMS[@]}"; do
    echo -e "  • ${realm}-realm"
done
echo ""
echo -e "${YELLOW}Test Credentials (for all realms):${NC}"
echo -e "  Username: testuser"
echo -e "  Password: testpass123"
echo -e "  Email: test@plexica.dev"
echo ""
echo -e "${YELLOW}Frontend URLs configured:${NC}"
echo -e "  • ${FRONTEND_URL}"
echo -e "  • http://localhost:5173"
echo -e "  • http://localhost:3001"
echo -e "  • http://localhost:3002"
echo ""
echo -e "${YELLOW}Keycloak Admin Console:${NC}"
echo -e "  URL: ${KEYCLOAK_URL}/admin"
echo -e "  Username: ${ADMIN_USER}"
echo -e "  Password: ${ADMIN_PASS}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo -e "  1. Ensure tenant 'default' exists in database"
echo -e "  2. Start frontend: cd apps/web && pnpm dev"
echo -e "  3. Navigate to: ${FRONTEND_URL}"
echo -e "  4. Login with test credentials"
echo ""
