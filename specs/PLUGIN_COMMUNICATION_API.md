# Plugin Communication API Reference

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: API Specification

**Version**: 1.0 (M2.3)  
**Base URL**: `/api/plugin-gateway`  
**Authentication**: Required (X-Tenant-Slug header)

This API enables plugin-to-plugin communication in the Plexica platform. It provides endpoints for service registration, API calls between plugins, shared data management, and dependency resolution.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Service Registry Endpoints](#service-registry-endpoints)
3. [API Gateway Endpoints](#api-gateway-endpoints)
4. [Shared Data Endpoints](#shared-data-endpoints)
5. [Dependency Resolution Endpoints](#dependency-resolution-endpoints)
6. [Error Responses](#error-responses)
7. [Rate Limits](#rate-limits)

## Related Documents

For architectural context and implementation details, refer to:

- **[PLUGIN_ECOSYSTEM_ARCHITECTURE.md](./PLUGIN_ECOSYSTEM_ARCHITECTURE.md)** - Architecture and design patterns for the plugin ecosystem
- **[TECHNICAL_SPECIFICATIONS.md](./TECHNICAL_SPECIFICATIONS.md)** - Technical implementation of the plugin system (Section 6)
- **[FUNCTIONAL_SPECIFICATIONS.md](./FUNCTIONAL_SPECIFICATIONS.md)** - Plugin communication requirements (Section 7.4: Plugin Communication)

---

## Authentication

All endpoints require the `X-Tenant-Slug` header to identify the tenant context.

```http
X-Tenant-Slug: acme-corp
```

**Error Response** (401 Unauthorized):

```json
{
  "error": "X-Tenant-Slug header required"
}
```

---

## Service Registry Endpoints

### 1. Register Service

Register a plugin service to make it discoverable by other plugins.

**Endpoint**: `POST /api/plugin-gateway/services/register`

**Headers**:

```http
Content-Type: application/json
X-Tenant-Slug: acme-corp
```

**Request Body**:

```json
{
  "pluginId": "plugin-crm",
  "serviceName": "crm.contacts",
  "version": "1.0.0",
  "baseUrl": "http://localhost:3100",
  "endpoints": [
    {
      "method": "GET",
      "path": "/contacts",
      "description": "List all contacts",
      "permissions": ["crm:contacts:read"],
      "metadata": {
        "paginated": true
      }
    },
    {
      "method": "POST",
      "path": "/contacts",
      "description": "Create a new contact",
      "permissions": ["crm:contacts:write"]
    },
    {
      "method": "GET",
      "path": "/contacts/:id",
      "description": "Get contact by ID",
      "permissions": ["crm:contacts:read"]
    }
  ],
  "metadata": {
    "description": "CRM Contacts API",
    "maintainer": "crm-team@example.com"
  }
}
```

**Field Descriptions**:

- `pluginId` (string, required): Plugin identifier (format: `plugin-{name}`)
- `serviceName` (string, required): Service name (format: `{pluginId}.{resource}`)
- `version` (string, required): Semver version (e.g., "1.0.0")
- `baseUrl` (string, optional): Base URL where service is running
- `endpoints` (array, optional): List of API endpoints exposed by this service
  - `method` (enum, required): HTTP method (GET, POST, PUT, PATCH, DELETE)
  - `path` (string, required): Endpoint path
  - `description` (string, optional): Endpoint description
  - `permissions` (array, optional): Required permissions
  - `metadata` (object, optional): Custom metadata
- `metadata` (object, optional): Service-level metadata

**Success Response** (201 Created):

```json
{
  "success": true,
  "serviceId": "svc_abc123",
  "message": "Service registered successfully"
}
```

**Error Responses**:

- `400 Bad Request`: Invalid request body
- `401 Unauthorized`: Missing X-Tenant-Slug header
- `500 Internal Server Error`: Registration failed

**Example**:

```bash
curl -X POST http://localhost:3000/api/plugin-gateway/services/register \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: acme-corp" \
  -d '{
    "pluginId": "plugin-crm",
    "serviceName": "crm.contacts",
    "version": "1.0.0",
    "baseUrl": "http://localhost:3100"
  }'
```

---

### 2. Deregister Service

Remove a plugin service from the registry.

**Endpoint**: `DELETE /api/plugin-gateway/services/:pluginId/:serviceName`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `pluginId` (string): Plugin identifier
- `serviceName` (string): Service name

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Service deregistered successfully"
}
```

**Example**:

```bash
curl -X DELETE http://localhost:3000/api/plugin-gateway/services/plugin-crm/crm.contacts \
  -H "X-Tenant-Slug: acme-corp"
```

---

### 3. Discover Service

Find a registered service by name.

**Endpoint**: `GET /api/plugin-gateway/services/discover/:serviceName`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `serviceName` (string): Service name to discover

**Success Response** (200 OK):

```json
{
  "service": {
    "id": "svc_abc123",
    "pluginId": "plugin-crm",
    "serviceName": "crm.contacts",
    "version": "1.0.0",
    "status": "HEALTHY",
    "endpoints": [
      {
        "method": "GET",
        "path": "/contacts",
        "description": "List all contacts",
        "permissions": ["crm:contacts:read"]
      }
    ],
    "metadata": {
      "description": "CRM Contacts API"
    },
    "lastSeenAt": "2026-01-22T20:00:00Z"
  }
}
```

**Error Responses**:

- `404 Not Found`: Service not found or unavailable
- `401 Unauthorized`: Missing X-Tenant-Slug header
- `500 Internal Server Error`: Discovery failed

**Example**:

```bash
curl http://localhost:3000/api/plugin-gateway/services/discover/crm.contacts \
  -H "X-Tenant-Slug: acme-corp"
```

---

### 4. List Services

Get all registered services for the tenant.

**Endpoint**: `GET /api/plugin-gateway/services`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**Query Parameters** (optional):

- `pluginId` (string): Filter by plugin ID
- `status` (enum): Filter by status (HEALTHY, DEGRADED, UNAVAILABLE)

**Success Response** (200 OK):

```json
{
  "services": [
    {
      "id": "svc_abc123",
      "pluginId": "plugin-crm",
      "serviceName": "crm.contacts",
      "version": "1.0.0",
      "status": "HEALTHY"
    },
    {
      "id": "svc_def456",
      "pluginId": "plugin-crm",
      "serviceName": "crm.deals",
      "version": "1.0.0",
      "status": "HEALTHY"
    }
  ],
  "count": 2
}
```

**Example**:

```bash
# List all services
curl http://localhost:3000/api/plugin-gateway/services \
  -H "X-Tenant-Slug: acme-corp"

# Filter by plugin
curl http://localhost:3000/api/plugin-gateway/services?pluginId=plugin-crm \
  -H "X-Tenant-Slug: acme-corp"
```

---

### 5. Service Heartbeat

Record a service heartbeat to indicate it's alive.

**Endpoint**: `POST /api/plugin-gateway/services/:serviceId/heartbeat`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `serviceId` (string): Service ID

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Heartbeat received"
}
```

**Example**:

```bash
curl -X POST http://localhost:3000/api/plugin-gateway/services/svc_abc123/heartbeat \
  -H "X-Tenant-Slug: acme-corp"
```

---

## API Gateway Endpoints

### 6. Call Plugin API

Make an HTTP request to another plugin's API.

**Endpoint**: `POST /api/plugin-gateway/call`

**Headers**:

```http
Content-Type: application/json
X-Tenant-Slug: acme-corp
```

**Request Body**:

```json
{
  "callerPluginId": "plugin-analytics",
  "targetPluginId": "plugin-crm",
  "targetServiceName": "crm.contacts",
  "method": "GET",
  "path": "/contacts",
  "headers": {
    "Accept": "application/json"
  },
  "query": {
    "limit": "10",
    "offset": "0"
  },
  "body": null
}
```

**Field Descriptions**:

- `callerPluginId` (string, required): ID of the calling plugin
- `targetPluginId` (string, required): ID of the target plugin
- `targetServiceName` (string, required): Name of the target service
- `method` (enum, required): HTTP method (GET, POST, PUT, PATCH, DELETE)
- `path` (string, required): API path (can include path parameters like `/contacts/:id`)
- `headers` (object, optional): Additional HTTP headers
- `query` (object, optional): Query string parameters
- `body` (any, optional): Request body for POST/PUT/PATCH

**Success Response** (200 OK or status from target):

```json
{
  "status": 200,
  "data": [
    {
      "id": "cnt_001",
      "name": "John Doe",
      "email": "john@example.com",
      "company": "Acme Corp"
    }
  ],
  "headers": {
    "content-type": "application/json"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Missing callerPluginId or invalid request
- `401 Unauthorized`: Missing X-Tenant-Slug header
- `404 Not Found`: Target service not found
- `500 Internal Server Error`: API call failed

**How It Works**:

1. Gateway discovers target service using service registry
2. Injects `X-Tenant-ID` and `X-Caller-Plugin-ID` headers
3. Makes HTTP request to target service
4. Returns response with original status code and data

**Example**:

```bash
# Call CRM contacts API
curl -X POST http://localhost:3000/api/plugin-gateway/call \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: acme-corp" \
  -d '{
    "callerPluginId": "plugin-analytics",
    "targetPluginId": "plugin-crm",
    "targetServiceName": "crm.contacts",
    "method": "GET",
    "path": "/contacts",
    "query": { "limit": "10" }
  }'

# Create a new contact
curl -X POST http://localhost:3000/api/plugin-gateway/call \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: acme-corp" \
  -d '{
    "callerPluginId": "plugin-marketing",
    "targetPluginId": "plugin-crm",
    "targetServiceName": "crm.contacts",
    "method": "POST",
    "path": "/contacts",
    "body": {
      "name": "Jane Smith",
      "email": "jane@example.com"
    }
  }'
```

---

## Shared Data Endpoints

### 7. Set Shared Data

Store data that can be accessed by multiple plugins.

**Endpoint**: `POST /api/plugin-gateway/shared-data`

**Headers**:

```http
Content-Type: application/json
X-Tenant-Slug: acme-corp
```

**Request Body**:

```json
{
  "namespace": "crm.cache",
  "key": "contact_count",
  "value": 1250,
  "ownerId": "plugin-crm",
  "ttl": 3600
}
```

**Field Descriptions**:

- `namespace` (string, required): Data namespace for organization
- `key` (string, required): Data key within namespace
- `value` (any, required): Data value (any JSON-serializable type)
- `ownerId` (string, required): Plugin ID that owns this data
- `ttl` (number, optional): Time-to-live in seconds (default: no expiration)

**Success Response** (201 Created):

```json
{
  "success": true,
  "message": "Data stored successfully"
}
```

**Example**:

```bash
# Store a simple value
curl -X POST http://localhost:3000/api/plugin-gateway/shared-data \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: acme-corp" \
  -d '{
    "namespace": "crm.cache",
    "key": "contact_count",
    "value": 1250,
    "ownerId": "plugin-crm",
    "ttl": 3600
  }'

# Store a complex object
curl -X POST http://localhost:3000/api/plugin-gateway/shared-data \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Slug: acme-corp" \
  -d '{
    "namespace": "analytics.reports",
    "key": "monthly_summary",
    "value": {
      "month": "2026-01",
      "totalRevenue": 125000,
      "newCustomers": 45
    },
    "ownerId": "plugin-analytics"
  }'
```

---

### 8. Get Shared Data

Retrieve shared data by namespace and key.

**Endpoint**: `GET /api/plugin-gateway/shared-data/:namespace/:key`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `namespace` (string): Data namespace
- `key` (string): Data key

**Success Response** (200 OK):

```json
{
  "namespace": "crm.cache",
  "key": "contact_count",
  "value": 1250
}
```

**Error Responses**:

- `404 Not Found`: Data not found or expired
- `401 Unauthorized`: Missing X-Tenant-Slug header

**Example**:

```bash
curl http://localhost:3000/api/plugin-gateway/shared-data/crm.cache/contact_count \
  -H "X-Tenant-Slug: acme-corp"
```

---

### 9. Delete Shared Data

Remove shared data by namespace and key.

**Endpoint**: `DELETE /api/plugin-gateway/shared-data/:namespace/:key`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `namespace` (string): Data namespace
- `key` (string): Data key

**Success Response** (200 OK):

```json
{
  "success": true,
  "message": "Data deleted successfully"
}
```

**Error Responses**:

- `404 Not Found`: Data not found
- `401 Unauthorized`: Missing X-Tenant-Slug header

**Example**:

```bash
curl -X DELETE http://localhost:3000/api/plugin-gateway/shared-data/crm.cache/contact_count \
  -H "X-Tenant-Slug: acme-corp"
```

---

### 10. List Keys in Namespace

Get all keys in a namespace, optionally filtered by owner.

**Endpoint**: `GET /api/plugin-gateway/shared-data/:namespace`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `namespace` (string): Data namespace

**Query Parameters** (optional):

- `ownerId` (string): Filter by owner plugin ID

**Success Response** (200 OK):

```json
{
  "namespace": "crm.cache",
  "keys": ["contact_count", "deal_count", "last_sync"],
  "count": 3
}
```

**Example**:

```bash
# List all keys in namespace
curl http://localhost:3000/api/plugin-gateway/shared-data/crm.cache \
  -H "X-Tenant-Slug: acme-corp"

# Filter by owner
curl http://localhost:3000/api/plugin-gateway/shared-data/crm.cache?ownerId=plugin-crm \
  -H "X-Tenant-Slug: acme-corp"
```

---

## Dependency Resolution Endpoints

### 11. Register Dependencies

Register plugin dependencies in the system.

**Endpoint**: `POST /api/plugin-gateway/dependencies`

**Headers**:

```http
Content-Type: application/json
```

**Request Body**:

```json
{
  "dependencies": [
    {
      "pluginId": "plugin-analytics",
      "dependsOnPluginId": "plugin-crm",
      "version": "^1.0.0",
      "required": true
    },
    {
      "pluginId": "plugin-analytics",
      "dependsOnPluginId": "plugin-marketing",
      "version": ">=2.0.0",
      "required": false
    }
  ]
}
```

**Field Descriptions**:

- `dependencies` (array, required): List of dependency definitions
  - `pluginId` (string, required): Plugin that has the dependency
  - `dependsOnPluginId` (string, required): Plugin being depended on
  - `version` (string, required): Version constraint (semver format: `^1.0.0`, `~2.3.4`, `>=1.0.0`)
  - `required` (boolean, optional): Whether dependency is required (default: true)

**Success Response** (201 Created):

```json
{
  "success": true,
  "message": "Dependencies registered"
}
```

**Example**:

```bash
curl -X POST http://localhost:3000/api/plugin-gateway/dependencies \
  -H "Content-Type: application/json" \
  -d '{
    "dependencies": [
      {
        "pluginId": "plugin-analytics",
        "dependsOnPluginId": "plugin-crm",
        "version": "^1.0.0",
        "required": true
      }
    ]
  }'
```

---

### 12. Resolve Dependencies

Check if all dependencies for a plugin are satisfied.

**Endpoint**: `POST /api/plugin-gateway/dependencies/:pluginId/resolve`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `pluginId` (string): Plugin ID to resolve dependencies for

**Success Response** (200 OK):

```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "installOrder": ["plugin-crm", "plugin-marketing", "plugin-analytics"]
}
```

**Error Response** (400 Bad Request):

```json
{
  "valid": false,
  "errors": [
    "Circular dependency detected: plugin-a → plugin-b → plugin-c → plugin-a",
    "Missing dependency: plugin-crm (required by plugin-analytics)"
  ],
  "warnings": ["Version mismatch: plugin-crm@1.5.0 does not satisfy ^2.0.0"]
}
```

**Example**:

```bash
curl -X POST http://localhost:3000/api/plugin-gateway/dependencies/plugin-analytics/resolve \
  -H "X-Tenant-Slug: acme-corp"
```

---

### 13. Get Dependencies

Get all dependencies for a plugin.

**Endpoint**: `GET /api/plugin-gateway/dependencies/:pluginId`

**URL Parameters**:

- `pluginId` (string): Plugin ID

**Query Parameters** (optional):

- `recursive` (boolean): Include transitive dependencies (default: false)

**Success Response** (200 OK):

```json
{
  "pluginId": "plugin-analytics",
  "dependencies": [
    {
      "pluginId": "plugin-analytics",
      "dependsOnPluginId": "plugin-crm",
      "version": "^1.0.0",
      "required": true
    },
    {
      "pluginId": "plugin-analytics",
      "dependsOnPluginId": "plugin-marketing",
      "version": ">=2.0.0",
      "required": false
    }
  ],
  "count": 2
}
```

**Example**:

```bash
# Direct dependencies only
curl http://localhost:3000/api/plugin-gateway/dependencies/plugin-analytics

# Include transitive dependencies
curl http://localhost:3000/api/plugin-gateway/dependencies/plugin-analytics?recursive=true
```

---

### 14. Get Dependents

Get all plugins that depend on a specific plugin.

**Endpoint**: `GET /api/plugin-gateway/dependencies/:pluginId/dependents`

**URL Parameters**:

- `pluginId` (string): Plugin ID

**Success Response** (200 OK):

```json
{
  "pluginId": "plugin-crm",
  "dependents": ["plugin-analytics", "plugin-marketing", "plugin-sales"],
  "count": 3
}
```

**Example**:

```bash
curl http://localhost:3000/api/plugin-gateway/dependencies/plugin-crm/dependents
```

---

### 15. Check if Plugin Can Be Uninstalled

Check if a plugin can be safely uninstalled without breaking dependencies.

**Endpoint**: `POST /api/plugin-gateway/dependencies/:pluginId/can-uninstall`

**Headers**:

```http
X-Tenant-Slug: acme-corp
```

**URL Parameters**:

- `pluginId` (string): Plugin ID to check

**Success Response** (200 OK):

```json
{
  "canUninstall": false,
  "blockedBy": [
    {
      "pluginId": "plugin-analytics",
      "reason": "Required dependency"
    },
    {
      "pluginId": "plugin-marketing",
      "reason": "Required dependency"
    }
  ]
}
```

**When can uninstall**:

```json
{
  "canUninstall": true,
  "blockedBy": []
}
```

**Example**:

```bash
curl -X POST http://localhost:3000/api/plugin-gateway/dependencies/plugin-crm/can-uninstall \
  -H "X-Tenant-Slug: acme-corp"
```

---

## Error Responses

All endpoints follow a consistent error response format:

### 400 Bad Request

```json
{
  "error": "Invalid request",
  "message": "Missing required field: pluginId"
}
```

### 401 Unauthorized

```json
{
  "error": "X-Tenant-Slug header required"
}
```

### 404 Not Found

```json
{
  "error": "Service not found",
  "serviceName": "crm.contacts"
}
```

### 500 Internal Server Error

```json
{
  "error": "Failed to register service",
  "message": "Database connection error"
}
```

---

## Rate Limits

**Current**: No rate limits enforced  
**Future**: 1000 requests/minute per tenant (planned for Phase 3)

---

## Best Practices

### 1. Service Registration

- Register services on plugin startup
- Deregister services on plugin shutdown
- Use heartbeats for long-running services
- Include comprehensive endpoint metadata

### 2. API Calls

- Always specify `callerPluginId` for audit trails
- Handle HTTP errors gracefully
- Use query parameters for filtering/pagination
- Cache service discovery results (TTL: 5 minutes)

### 3. Shared Data

- Use meaningful namespaces (e.g., `{pluginId}.{category}`)
- Set appropriate TTL for temporary data
- Clean up data when no longer needed
- Avoid storing large objects (>1MB)

### 4. Dependencies

- Register dependencies during plugin installation
- Resolve dependencies before enabling plugin
- Check `can-uninstall` before uninstalling plugins
- Use semver constraints properly

---

## Performance Characteristics

| Operation          | Latency (p95) | Caching               |
| ------------------ | ------------- | --------------------- |
| Service Discovery  | <10ms         | Yes (Redis, 5min TTL) |
| API Call           | <100ms        | No                    |
| Shared Data Get    | <5ms          | Yes (Redis, 1hr TTL)  |
| Shared Data Set    | <20ms         | N/A                   |
| Dependency Resolve | <50ms         | No                    |

---

## SDK Support

The Plexica Plugin SDK provides wrapper functions for all these endpoints:

```typescript
import { PluginSDK } from '@plexica/plugin-sdk';

const sdk = new PluginSDK({
  pluginId: 'plugin-analytics',
  tenantSlug: 'acme-corp',
});

// Register service
await sdk.registerService({
  serviceName: 'analytics.reports',
  version: '1.0.0',
});

// Call another plugin
const contacts = await sdk.callPluginApi({
  targetPluginId: 'plugin-crm',
  targetServiceName: 'crm.contacts',
  method: 'GET',
  path: '/contacts',
});

// Share data
await sdk.setSharedData('analytics.cache', 'report_data', data);
```

See [Plugin Developer Guide](../guides/plugin-development.md) for more examples.

---

## Changelog

**Version 1.0** (M2.3 - January 2026):

- Initial release
- 15 REST endpoints
- Service registry, API gateway, shared data, dependencies
- Support for multi-service plugins
- Heartbeat mechanism
- Circular dependency detection

---

**Last Updated**: January 22, 2026  
**Maintained by**: Plexica Backend Team  
**Support**: backend-team@plexica.com
