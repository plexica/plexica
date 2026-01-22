#!/bin/bash

# Test script for Plugin Gateway endpoints (M2.3)
# Requires: core-api running on port 3000

BASE_URL="http://localhost:3000"
TENANT_ID="test-tenant-123"

echo "=== Testing Plugin Gateway Endpoints ==="
echo ""

echo "1. Testing Service Registration"
curl -X POST $BASE_URL/api/plugin-gateway/services/register \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d '{
    "pluginId": "plugin-crm",
    "serviceName": "crm.contacts",
    "version": "1.0.0",
    "baseUrl": "http://localhost:4001",
    "endpoints": [
      {
        "method": "GET",
        "path": "/contacts",
        "description": "List all contacts"
      },
      {
        "method": "GET",
        "path": "/contacts/:id",
        "description": "Get contact by ID"
      },
      {
        "method": "POST",
        "path": "/contacts",
        "description": "Create new contact"
      }
    ]
  }' | jq

echo -e "\n\n2. Testing Service Discovery"
curl -X GET "$BASE_URL/api/plugin-gateway/services/discover/crm.contacts" \
  -H "X-Tenant-ID: $TENANT_ID" | jq

echo -e "\n\n3. Testing List Services"
curl -X GET "$BASE_URL/api/plugin-gateway/services" \
  -H "X-Tenant-ID: $TENANT_ID" | jq

echo -e "\n\n4. Testing Shared Data - Set"
curl -X POST $BASE_URL/api/plugin-gateway/shared-data \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d '{
    "namespace": "crm",
    "key": "lastSyncTime",
    "value": "2026-01-22T10:00:00Z",
    "ownerPluginId": "plugin-crm",
    "ttlSeconds": 3600
  }' | jq

echo -e "\n\n5. Testing Shared Data - Get"
curl -X GET "$BASE_URL/api/plugin-gateway/shared-data/crm/lastSyncTime" \
  -H "X-Tenant-ID: $TENANT_ID" | jq

echo -e "\n\n6. Testing Shared Data - List Keys"
curl -X GET "$BASE_URL/api/plugin-gateway/shared-data/crm" \
  -H "X-Tenant-ID: $TENANT_ID" | jq

echo -e "\n\n7. Testing Dependency Registration"
curl -X POST $BASE_URL/api/plugin-gateway/dependencies \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d '{
    "pluginId": "plugin-analytics",
    "dependencies": [
      {
        "pluginId": "plugin-crm",
        "version": "^1.0.0",
        "required": true
      }
    ]
  }' | jq

echo -e "\n\n8. Testing Get Dependencies"
curl -X GET "$BASE_URL/api/plugin-gateway/dependencies/plugin-analytics" \
  -H "X-Tenant-ID: $TENANT_ID" | jq

echo -e "\n\n=== Tests Complete ==="
