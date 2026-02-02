# API Specification - [Endpoint/Module Name]

> **API Version**: v1  
> **Base URL**: `https://api.plexica.io/v1`  
> **Authentication**: Bearer Token (JWT)  
> **Rate Limit**: 1000 req/hour per tenant  
> **Last modified**: [DD MMM YYYY]

---

## Overview

[Brief description of the API module and its main functionalities]

### Available Endpoints

| Method | Endpoint          | Description     | Required Permission          |
| ------ | ----------------- | --------------- | ---------------------------- |
| GET    | `/[resource]`     | List resources  | `[module].[resource].read`   |
| GET    | `/[resource]/:id` | Resource detail | `[module].[resource].read`   |
| POST   | `/[resource]`     | Create resource | `[module].[resource].create` |
| PUT    | `/[resource]/:id` | Update resource | `[module].[resource].update` |
| PATCH  | `/[resource]/:id` | Partial update  | `[module].[resource].update` |
| DELETE | `/[resource]/:id` | Delete resource | `[module].[resource].delete` |

---

## Authentication

### Bearer Token

All requests require a valid JWT token in the `Authorization` header:

```http
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Obtaining a Token

```bash
# Login endpoint
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

# Response
{
  "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

### Refresh Token

```bash
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Required Headers

### Standard Headers

```http
Authorization: Bearer {token}           # Required
Content-Type: application/json          # Required for POST/PUT/PATCH
X-Tenant-ID: {tenant_id}                # Required (extracted from JWT if not present)
X-Request-ID: {uuid}                    # Optional (for tracing)
Accept: application/json                # Optional (default)
Accept-Language: it-IT,en-US            # Optional (default: en-US)
```

### Custom Plugin Headers

```http
X-Plugin-Version: 1.2.3                 # Optional (calling plugin version)
X-Plugin-ID: plugin-crm                 # Optional (plugin identifier)
```

---

## Pagination

### Query Parameters

```
GET /api/[resource]?page=1&limit=20&sort=-createdAt&filter=active
```

| Parameter | Type   | Default      | Description                              |
| --------- | ------ | ------------ | ---------------------------------------- |
| `page`    | number | 1            | Page number                              |
| `limit`   | number | 20           | Results per page (max: 100)              |
| `sort`    | string | `-createdAt` | Sort field (prefix `-` for DESC)         |
| `filter`  | string | -            | Search filter (resource-specific format) |

### Paginated Response

```typescript
{
  "data": Array<Resource>,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  },
  "links": {
    "self": "/api/[resource]?page=1&limit=20",
    "next": "/api/[resource]?page=2&limit=20",
    "prev": null,
    "first": "/api/[resource]?page=1&limit=20",
    "last": "/api/[resource]?page=8&limit=20"
  }
}
```

---

## Filters and Search

### Filter Syntax

```
# Supported operators
?filter=field:eq:value          # Equal
?filter=field:ne:value          # Not equal
?filter=field:gt:100            # Greater than
?filter=field:gte:100           # Greater than or equal
?filter=field:lt:100            # Less than
?filter=field:lte:100           # Less than or equal
?filter=field:like:text         # Contains (case-insensitive)
?filter=field:in:val1,val2      # In array
?filter=field:between:10,20     # Between values

# Multiple filters (AND)
?filter=status:eq:active&filter=role:eq:admin

# Full-text search
?search=keyword
```

### Examples

```bash
# Find active users created in the last 7 days
GET /api/users?filter=status:eq:active&filter=createdAt:gte:2025-01-06

# Search users with email containing "gmail"
GET /api/users?filter=email:like:gmail

# Users with admin or editor role
GET /api/users?filter=role:in:admin,editor
```

---

## Sorting

### Sort Syntax

```
?sort=field              # Ascending
?sort=-field             # Descending
?sort=field1,-field2     # Multiple fields
```

### Examples

```bash
# Sort by creation date (most recent first)
GET /api/users?sort=-createdAt

# Sort by lastName ASC, then firstName ASC
GET /api/users?sort=lastName,firstName

# Sort by status DESC, then email ASC
GET /api/users?sort=-status,email
```

---

## Error Handling

### Standard Error Format

```typescript
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      "field": "Additional context",
      "reason": "Why error occurred"
    },
    "timestamp": "2025-01-13T12:00:00Z",
    "path": "/api/resource",
    "requestId": "uuid-v4"
  }
}
```

### HTTP Error Codes

| Status | Meaning               | Example                               |
| ------ | --------------------- | ------------------------------------- |
| 200    | OK                    | Request successful                    |
| 201    | Created               | Resource created                      |
| 204    | No Content            | Deletion successful                   |
| 400    | Bad Request           | Validation failed                     |
| 401    | Unauthorized          | Token missing/invalid                 |
| 403    | Forbidden             | Insufficient permissions              |
| 404    | Not Found             | Resource not found                    |
| 409    | Conflict              | Conflict (e.g., email already exists) |
| 422    | Unprocessable Entity  | Data cannot be processed              |
| 429    | Too Many Requests     | Rate limit exceeded                   |
| 500    | Internal Server Error | Server error                          |
| 503    | Service Unavailable   | Service temporarily unavailable       |

### Error Examples

**401 Unauthorized**:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token",
    "details": {
      "reason": "Token expired at 2025-01-13T11:00:00Z"
    },
    "timestamp": "2025-01-13T12:00:00Z",
    "path": "/api/users",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**400 Bad Request (Validation)**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "errors": [
        {
          "field": "email",
          "message": "Invalid email format",
          "value": "not-an-email"
        },
        {
          "field": "password",
          "message": "Password must be at least 8 characters",
          "value": "***"
        }
      ]
    },
    "timestamp": "2025-01-13T12:00:00Z",
    "path": "/api/users",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**403 Forbidden**:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions",
    "details": {
      "required": "users.create",
      "userRole": "viewer"
    },
    "timestamp": "2025-01-13T12:00:00Z",
    "path": "/api/users",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

---

## Rate Limiting

### Limits

| Tier       | Limit     | Window | Header                     |
| ---------- | --------- | ------ | -------------------------- |
| Standard   | 1000 req  | 1 hour | `X-RateLimit-Limit: 1000`  |
| Premium    | 5000 req  | 1 hour | `X-RateLimit-Limit: 5000`  |
| Enterprise | 10000 req | 1 hour | `X-RateLimit-Limit: 10000` |

### Response Headers

```http
X-RateLimit-Limit: 1000           # Total limit
X-RateLimit-Remaining: 950        # Remaining requests
X-RateLimit-Reset: 1673616000     # Reset timestamp (Unix)
X-RateLimit-Reset-After: 3600     # Seconds until reset
```

### 429 Too Many Requests

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "details": {
      "limit": 1000,
      "resetAt": "2025-01-13T13:00:00Z",
      "retryAfter": 3600
    },
    "timestamp": "2025-01-13T12:00:00Z",
    "requestId": "uuid"
  }
}
```

---

## Detailed Endpoints

### GET /api/[resource]

List all resources (with pagination).

**Permissions**: `[module].[resource].read`

**Query Parameters**:

- `page` (number, optional): Page number
- `limit` (number, optional): Results per page
- `sort` (string, optional): Sort field
- `filter` (string, optional): Search filter
- `search` (string, optional): Full-text search
- `include` (string, optional): Relations to include (comma-separated)

**Request**:

```http
GET /api/[resource]?page=1&limit=20&sort=-createdAt HTTP/1.1
Host: api.plexica.io
Authorization: Bearer {token}
Content-Type: application/json
```

**Response 200**:

```typescript
{
  "data": [
    {
      "id": "uuid-v4",
      "field1": "value",
      "field2": 123,
      "createdAt": "2025-01-13T12:00:00Z",
      "updatedAt": "2025-01-13T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

**Response 401**: Not authenticated  
**Response 403**: Insufficient permissions  
**Response 500**: Internal error

---

### GET /api/[resource]/:id

Retrieve single resource detail.

**Permissions**: `[module].[resource].read`

**Path Parameters**:

- `id` (string, required): Unique resource ID (UUID)

**Query Parameters**:

- `include` (string, optional): Relations to include (e.g., `include=author,comments`)

**Request**:

```http
GET /api/[resource]/a1b2c3d4-e5f6-7890-abcd-ef1234567890 HTTP/1.1
Host: api.plexica.io
Authorization: Bearer {token}
```

**Response 200**:

```typescript
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "field1": "value",
  "field2": 123,
  "nested": {
    "subfield": "value"
  },
  "createdAt": "2025-01-13T12:00:00Z",
  "updatedAt": "2025-01-13T12:00:00Z",
  "createdBy": {
    "id": "user-uuid",
    "name": "John Doe"
  }
}
```

**Response 401**: Not authenticated  
**Response 403**: Insufficient permissions  
**Response 404**: Resource not found  
**Response 500**: Internal error

---

### POST /api/[resource]

Create new resource.

**Permissions**: `[module].[resource].create`

**Request Body**:

```typescript
{
  "field1": string,           // Required
  "field2": number,           // Optional
  "field3": boolean,          // Optional, default: false
  "nested": {                 // Optional
    "subfield": string
  }
}
```

**Validation**:

- `field1`: Required, length 3-255 characters
- `field2`: Optional, positive number
- `field3`: Optional, boolean

**Request**:

```http
POST /api/[resource] HTTP/1.1
Host: api.plexica.io
Authorization: Bearer {token}
Content-Type: application/json

{
  "field1": "Example value",
  "field2": 42
}
```

**Response 201**:

```typescript
{
  "id": "newly-created-uuid",
  "field1": "Example value",
  "field2": 42,
  "field3": false,
  "createdAt": "2025-01-13T12:00:00Z",
  "updatedAt": "2025-01-13T12:00:00Z"
}
```

**Response 400**: Validation failed  
**Response 401**: Not authenticated  
**Response 403**: Insufficient permissions  
**Response 409**: Conflict (resource already exists)  
**Response 500**: Internal error

---

### PUT /api/[resource]/:id

Fully update existing resource (all fields).

**Permissions**: `[module].[resource].update`

**Path Parameters**:

- `id` (string, required): Resource ID

**Request Body**:

```typescript
{
  "field1": string,           // Required
  "field2": number,           // Required
  "field3": boolean           // Required
}
```

**Request**:

```http
PUT /api/[resource]/a1b2c3d4-e5f6-7890-abcd-ef1234567890 HTTP/1.1
Host: api.plexica.io
Authorization: Bearer {token}
Content-Type: application/json

{
  "field1": "Updated value",
  "field2": 99,
  "field3": true
}
```

**Response 200**: Resource updated  
**Response 400**: Validation failed  
**Response 401**: Not authenticated  
**Response 403**: Insufficient permissions  
**Response 404**: Resource not found  
**Response 500**: Internal error

---

### PATCH /api/[resource]/:id

Partially update resource (only specified fields).

**Permissions**: `[module].[resource].update`

**Path Parameters**:

- `id` (string, required): Resource ID

**Request Body** (all fields optional):

```typescript
{
  "field1"?: string,
  "field2"?: number,
  "field3"?: boolean
}
```

**Request**:

```http
PATCH /api/[resource]/a1b2c3d4-e5f6-7890-abcd-ef1234567890 HTTP/1.1
Host: api.plexica.io
Authorization: Bearer {token}
Content-Type: application/json

{
  "field2": 100
}
```

**Response 200**:

```typescript
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "field1": "Previous value",    // Unchanged
  "field2": 100,                  // Updated
  "field3": false,                // Unchanged
  "updatedAt": "2025-01-13T12:30:00Z"
}
```

**Response 400**: Validation failed  
**Response 401**: Not authenticated  
**Response 403**: Insufficient permissions  
**Response 404**: Resource not found  
**Response 500**: Internal error

---

### DELETE /api/[resource]/:id

Delete resource.

**Permissions**: `[module].[resource].delete`

**Path Parameters**:

- `id` (string, required): Resource ID

**Query Parameters**:

- `soft` (boolean, optional): Soft delete (default: false)

**Request**:

```http
DELETE /api/[resource]/a1b2c3d4-e5f6-7890-abcd-ef1234567890 HTTP/1.1
Host: api.plexica.io
Authorization: Bearer {token}
```

**Response 204**: No Content (deletion completed)

**Response 401**: Not authenticated  
**Response 403**: Insufficient permissions  
**Response 404**: Resource not found  
**Response 409**: Conflict (resource has dependencies)  
**Response 500**: Internal error

---

## Batch Operations

### POST /api/[resource]/batch

Batch operations on multiple resources.

**Permissions**: Depends on operation

**Request Body**:

```typescript
{
  "operation": "create" | "update" | "delete",
  "items": Array<{
    id?: string,        // Required for update/delete
    data?: object       // Required for create/update
  }>
}
```

**Request**:

```http
POST /api/[resource]/batch HTTP/1.1
Host: api.plexica.io
Authorization: Bearer {token}
Content-Type: application/json

{
  "operation": "update",
  "items": [
    {
      "id": "uuid-1",
      "data": { "status": "active" }
    },
    {
      "id": "uuid-2",
      "data": { "status": "inactive" }
    }
  ]
}
```

**Response 200**:

```typescript
{
  "success": true,
  "processed": 2,
  "results": [
    {
      "id": "uuid-1",
      "status": "success"
    },
    {
      "id": "uuid-2",
      "status": "success"
    }
  ],
  "errors": []
}
```

---

## Webhooks (Optional)

### Webhook Configuration

```http
POST /api/webhooks
Content-Type: application/json

{
  "url": "https://example.com/webhook",
  "events": ["[resource].created", "[resource].updated", "[resource].deleted"],
  "secret": "webhook_secret_key"
}
```

### Webhook Payload

```typescript
{
  "event": "[resource].created",
  "timestamp": "2025-01-13T12:00:00Z",
  "data": {
    "id": "uuid",
    "field1": "value"
  },
  "metadata": {
    "tenantId": "tenant-uuid",
    "userId": "user-uuid"
  }
}
```

### Signature Verification

```typescript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return signature === digest;
}
```

---

## SDK Examples

### TypeScript/JavaScript

```typescript
import { PlexicaClient } from '@plexica/sdk';

const client = new PlexicaClient({
  apiKey: 'your-api-key',
  baseURL: 'https://api.plexica.io/v1'
});

// List resources
const resources = await client.[resource].list({
  page: 1,
  limit: 20,
  filter: { status: 'active' }
});

// Create resource
const newResource = await client.[resource].create({
  field1: 'value',
  field2: 42
});

// Update resource
const updated = await client.[resource].update('uuid', {
  field1: 'new value'
});

// Delete resource
await client.[resource].delete('uuid');
```

### cURL

```bash
# List resources
curl -X GET "https://api.plexica.io/v1/[resource]?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create resource
curl -X POST "https://api.plexica.io/v1/[resource]" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"field1": "value", "field2": 42}'

# Update resource
curl -X PATCH "https://api.plexica.io/v1/[resource]/UUID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"field2": 100}'

# Delete resource
curl -X DELETE "https://api.plexica.io/v1/[resource]/UUID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Testing

### Test Environment

- **Base URL**: `https://api-sandbox.plexica.io/v1`
- **Credentials**: Use test account
- **Rate Limit**: Reduced (100 req/hour)

### Postman Collection

Download complete Postman collection:  
[Download Postman Collection](https://api.plexica.io/postman/[resource].json)

---

## API Changelog

### v1.0.0 (2025-01-13)

- Initial release
- Complete CRUD for [resource]
- Pagination and filters
- Rate limiting

---

## Support

- **Documentation**: https://docs.plexica.io/api/[resource]
- **API Status**: https://status.plexica.io
- **Support**: api-support@plexica.io

---

_API Specification [Resource] v1.0_  
_Last updated: January 2025_  
_Team: Plexica Engineering_
