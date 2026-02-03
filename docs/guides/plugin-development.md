# Plugin Developer Guide: Plugin-to-Plugin Communication

**Last Updated**: 2025-02-03  
**Status**: Complete  
**Owner**: Engineering Team  
**Document Type**: Developer Guide

**Version**: 1.0 (M2.3)  
**Last Updated**: January 22, 2026  
**Target Audience**: Plugin developers

This guide teaches you how to build Plexica plugins that communicate with each other using the M2.3 Plugin Communication system.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Quick Start](#quick-start)
3. [Plugin Manifest Configuration](#plugin-manifest-configuration)
4. [Exposing Services](#exposing-services)
5. [Calling Other Plugins](#calling-other-plugins)
6. [Sharing Data](#sharing-data)
7. [Managing Dependencies](#managing-dependencies)
8. [Best Practices](#best-practices)
9. [Common Patterns](#common-patterns)
10. [Troubleshooting](#troubleshooting)

## Related Documents

For foundational plugin development concepts and detailed specifications, refer to:

- **[../PLUGIN_DEVELOPMENT.md](../PLUGIN_DEVELOPMENT.md)** - Basic plugin development guide (UI components, structure, deployment)
- **[../../specs/TECHNICAL_SPECIFICATIONS.md#6-plugin-system](../../specs/TECHNICAL_SPECIFICATIONS.md#6-plugin-system)** - Technical specifications for plugin system
- **[../../specs/PLUGIN_COMMUNICATION_API.md](../../specs/PLUGIN_COMMUNICATION_API.md)** - Complete API reference for plugin communication
- **[../../specs/PLUGIN_ECOSYSTEM_ARCHITECTURE.md](../../specs/PLUGIN_ECOSYSTEM_ARCHITECTURE.md)** - Architecture design patterns
- **[../../specs/EXAMPLES_CRM_ANALYTICS_INTEGRATION.md](../../specs/EXAMPLES_CRM_ANALYTICS_INTEGRATION.md)** - Real-world example of plugin communication

---

## Introduction

### What is Plugin-to-Plugin Communication?

Plexica's M2.3 system enables plugins to:

- **Expose APIs** that other plugins can call
- **Consume APIs** from other plugins
- **Share data** across plugin boundaries
- **Declare dependencies** on other plugins
- **Discover services** dynamically

### Use Cases

**Example 1: Analytics + CRM**

- Analytics plugin calls CRM APIs to fetch contact/deal data
- Generates reports without duplicating CRM data

**Example 2: Marketing + CRM**

- Marketing plugin reads contacts from CRM
- Automatically syncs leads to marketing campaigns

**Example 3: Invoicing + CRM**

- Invoicing plugin fetches customer data from CRM
- Creates invoices based on deal information

---

## Quick Start

### 1. Create a Plugin That Exposes an API

**Step 1**: Define your service in `plugin.json`

```json
{
  "id": "plugin-crm",
  "name": "CRM Plugin",
  "version": "1.0.0",
  "api": {
    "services": [
      {
        "name": "crm.contacts",
        "version": "1.0.0",
        "description": "Contact management service",
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
          }
        ]
      }
    ]
  }
}
```

**Step 2**: Implement the API in your backend

```typescript
// apps/plugin-crm/backend/src/routes/contacts.ts
import { FastifyInstance } from 'fastify';

export async function contactsRoutes(fastify: FastifyInstance) {
  // GET /contacts
  fastify.get('/contacts', async (request, reply) => {
    const tenantId = request.headers['x-tenant-id'];

    // Fetch contacts from your database
    const contacts = await fetchContactsFromDB(tenantId);

    reply.send(contacts);
  });

  // GET /contacts/:id
  fastify.get('/contacts/:id', async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.headers['x-tenant-id'];

    const contact = await fetchContactByIdFromDB(tenantId, id);

    if (!contact) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    reply.send(contact);
  });
}
```

**Step 3**: Register your service on startup

```typescript
// apps/plugin-crm/backend/src/index.ts
import axios from 'axios';

async function registerServices() {
  try {
    await axios.post(
      'http://localhost:3000/api/plugin-gateway/services/register',
      {
        pluginId: 'plugin-crm',
        serviceName: 'crm.contacts',
        version: '1.0.0',
        baseUrl: process.env.PLUGIN_BASE_URL || 'http://localhost:3100',
      },
      {
        headers: {
          'X-Tenant-Slug': process.env.TENANT_SLUG || 'default',
        },
      }
    );

    console.log('✅ Service registered successfully');
  } catch (error) {
    console.error('❌ Failed to register service:', error.message);
  }
}

// Call on startup
registerServices();
```

### 2. Create a Plugin That Calls Another Plugin

**Step 1**: Declare dependency in `plugin.json`

```json
{
  "id": "plugin-analytics",
  "name": "Analytics Plugin",
  "version": "1.0.0",
  "api": {
    "dependencies": [
      {
        "pluginId": "plugin-crm",
        "serviceName": "crm.contacts",
        "version": "^1.0.0",
        "required": true,
        "reason": "Fetch contact data for analytics reports"
      }
    ]
  }
}
```

**Step 2**: Call the CRM API

```typescript
// apps/plugin-analytics/backend/src/lib/crm-client.ts
import axios from 'axios';

export class CRMClient {
  private tenantSlug: string;
  private gatewayUrl: string;

  constructor(tenantSlug: string) {
    this.tenantSlug = tenantSlug;
    this.gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  }

  async getContacts(): Promise<any[]> {
    const response = await axios.post(
      `${this.gatewayUrl}/api/plugin-gateway/call`,
      {
        callerPluginId: 'plugin-analytics',
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
      },
      {
        headers: {
          'X-Tenant-Slug': this.tenantSlug,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  }

  async getContactById(id: string): Promise<any> {
    const response = await axios.post(
      `${this.gatewayUrl}/api/plugin-gateway/call`,
      {
        callerPluginId: 'plugin-analytics',
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: `/contacts/${id}`,
      },
      {
        headers: {
          'X-Tenant-Slug': this.tenantSlug,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  }
}
```

**Step 3**: Use the client in your service

```typescript
// apps/plugin-analytics/backend/src/services/analytics.service.ts
import { CRMClient } from '../lib/crm-client';

export class AnalyticsService {
  async generateContactsReport(tenantSlug: string) {
    const crmClient = new CRMClient(tenantSlug);

    // Fetch contacts from CRM plugin
    const contacts = await crmClient.getContacts();

    // Generate analytics
    return {
      totalContacts: contacts.length,
      contactsByCompany: this.groupByCompany(contacts),
      recentContacts: contacts.filter(
        (c) => new Date(c.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ),
    };
  }

  private groupByCompany(contacts: any[]) {
    // Implementation...
  }
}
```

---

## Plugin Manifest Configuration

### Basic Structure

```json
{
  "id": "plugin-{name}",
  "name": "Your Plugin Name",
  "version": "1.0.0",
  "api": {
    "services": [...],
    "dependencies": [...]
  }
}
```

### Services Section

Define services your plugin exposes:

```json
{
  "api": {
    "services": [
      {
        "name": "{pluginId}.{resourceName}",
        "version": "1.0.0",
        "description": "Service description",
        "endpoints": [
          {
            "method": "GET|POST|PUT|DELETE",
            "path": "/path/to/endpoint",
            "description": "Endpoint description",
            "permissions": ["plugin.{name}.{resource}.{action}"],
            "metadata": {
              "rateLimit": 100,
              "cacheTTL": 300
            }
          }
        ],
        "metadata": {
          "rateLimit": 100,
          "cacheTTL": 300
        }
      }
    ]
  }
}
```

**Naming Rules**:

- Plugin ID: `plugin-{name}` (lowercase, hyphens)
- Service Name: `{pluginId}.{resourceName}` (e.g., `crm.contacts`)
- Version: Valid semver (e.g., `1.0.0`, `2.3.1`)

### Dependencies Section

Declare dependencies on other plugins:

```json
{
  "api": {
    "dependencies": [
      {
        "pluginId": "plugin-crm",
        "serviceName": "crm.contacts",
        "version": "^1.0.0",
        "required": true,
        "reason": "Why you need this dependency"
      }
    ]
  }
}
```

**Version Constraints**:

- `^1.0.0` - Compatible with 1.x.x (any 1.x version)
- `~1.2.3` - Compatible with 1.2.x (patch versions only)
- `>=1.0.0` - Any version >= 1.0.0
- `1.0.0` - Exact version 1.0.0

---

## Exposing Services

### 1. Define API Endpoints

Create clear, RESTful endpoints:

```typescript
// Good: RESTful resource design
GET    /contacts          // List contacts
POST   /contacts          // Create contact
GET    /contacts/:id      // Get single contact
PUT    /contacts/:id      // Update contact
DELETE /contacts/:id      // Delete contact

// Bad: Non-RESTful
POST   /createContact
POST   /updateContact
GET    /getContactById
```

### 2. Handle Tenant Context

Always use the `X-Tenant-ID` header injected by the gateway:

```typescript
fastify.get('/contacts', async (request, reply) => {
  // Extract tenant ID from header
  const tenantId = request.headers['x-tenant-id'];

  if (!tenantId) {
    return reply.status(400).send({ error: 'Tenant ID required' });
  }

  // Filter data by tenant
  const contacts = await db.contact.findMany({
    where: { tenantId },
  });

  reply.send(contacts);
});
```

### 3. Handle Caller Context

Use the `X-Caller-Plugin-ID` header for audit logs:

```typescript
fastify.post('/contacts', async (request, reply) => {
  const tenantId = request.headers['x-tenant-id'];
  const callerPluginId = request.headers['x-caller-plugin-id'];

  // Log who called this endpoint
  logger.info({
    action: 'contact.created',
    tenantId,
    callerPluginId,
  });

  const contact = await db.contact.create({
    data: {
      ...request.body,
      tenantId,
      createdBy: callerPluginId,
    },
  });

  reply.status(201).send(contact);
});
```

### 4. Error Handling

Return consistent error responses:

```typescript
// 400 Bad Request
reply.status(400).send({
  error: 'Invalid request',
  message: 'Email is required',
});

// 404 Not Found
reply.status(404).send({
  error: 'Contact not found',
  id: contactId,
});

// 500 Internal Server Error
reply.status(500).send({
  error: 'Internal server error',
  message: error.message,
});
```

### 5. Service Registration

Register your service when the plugin starts:

```typescript
import axios from 'axios';

async function registerService() {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  try {
    const response = await axios.post(
      `${gatewayUrl}/api/plugin-gateway/services/register`,
      {
        pluginId: 'plugin-crm',
        serviceName: 'crm.contacts',
        version: '1.0.0',
        baseUrl: process.env.BASE_URL || 'http://localhost:3100',
        metadata: {
          description: 'Contact management API',
          maintainer: 'crm-team@example.com',
        },
      },
      {
        headers: {
          'X-Tenant-Slug': tenantSlug,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('✅ Service registered:', response.data.serviceId);
  } catch (error) {
    console.error('❌ Failed to register service:', error.message);
    throw error;
  }
}

// Call during startup
async function start() {
  await fastify.listen({ port: 3100 });
  await registerService();
  console.log('🚀 Plugin CRM backend running');
}

start();
```

### 6. Service Deregistration

Deregister when shutting down:

```typescript
async function deregisterService() {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  try {
    await axios.delete(`${gatewayUrl}/api/plugin-gateway/services/plugin-crm/crm.contacts`, {
      headers: {
        'X-Tenant-Slug': tenantSlug,
      },
    });

    console.log('✅ Service deregistered');
  } catch (error) {
    console.error('❌ Failed to deregister service:', error.message);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  await deregisterService();
  await fastify.close();
  process.exit(0);
});
```

---

## Calling Other Plugins

### 1. Service Discovery

Before calling a service, discover it to get connection details:

```typescript
async function discoverService(serviceName: string) {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  try {
    const response = await axios.get(
      `${gatewayUrl}/api/plugin-gateway/services/discover/${serviceName}`,
      {
        headers: {
          'X-Tenant-Slug': tenantSlug,
        },
      }
    );

    return response.data.service;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error(`Service ${serviceName} not found or unavailable`);
    }
    throw error;
  }
}
```

### 2. Making API Calls

Use the API Gateway to call other plugins:

```typescript
async function callPluginApi(request: {
  targetPluginId: string;
  targetServiceName: string;
  method: string;
  path: string;
  body?: any;
  query?: Record<string, string>;
}) {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  try {
    const response = await axios.post(
      `${gatewayUrl}/api/plugin-gateway/call`,
      {
        callerPluginId: process.env.PLUGIN_ID,
        ...request,
      },
      {
        headers: {
          'X-Tenant-Slug': tenantSlug,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('API call failed:', error.message);
    throw error;
  }
}

// Example usage
const contacts = await callPluginApi({
  targetPluginId: 'plugin-crm',
  targetServiceName: 'crm.contacts',
  method: 'GET',
  path: '/contacts',
  query: { limit: '10' },
});
```

### 3. Creating a Typed Client

Create a TypeScript client for better type safety:

```typescript
// lib/crm-client.ts
export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  createdAt: string;
}

export class CRMClient {
  constructor(
    private gatewayUrl: string,
    private tenantSlug: string,
    private callerPluginId: string
  ) {}

  async getContacts(options?: { limit?: number; offset?: number }): Promise<Contact[]> {
    const response = await axios.post(
      `${this.gatewayUrl}/api/plugin-gateway/call`,
      {
        callerPluginId: this.callerPluginId,
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: '/contacts',
        query: {
          limit: options?.limit?.toString(),
          offset: options?.offset?.toString(),
        },
      },
      {
        headers: {
          'X-Tenant-Slug': this.tenantSlug,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  }

  async getContactById(id: string): Promise<Contact> {
    const response = await axios.post(
      `${this.gatewayUrl}/api/plugin-gateway/call`,
      {
        callerPluginId: this.callerPluginId,
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'GET',
        path: `/contacts/${id}`,
      },
      {
        headers: {
          'X-Tenant-Slug': this.tenantSlug,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  }

  async createContact(contact: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact> {
    const response = await axios.post(
      `${this.gatewayUrl}/api/plugin-gateway/call`,
      {
        callerPluginId: this.callerPluginId,
        targetPluginId: 'plugin-crm',
        targetServiceName: 'crm.contacts',
        method: 'POST',
        path: '/contacts',
        body: contact,
      },
      {
        headers: {
          'X-Tenant-Slug': this.tenantSlug,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.data;
  }
}

// Usage
const crm = new CRMClient(process.env.GATEWAY_URL!, process.env.TENANT_SLUG!, 'plugin-analytics');

const contacts = await crm.getContacts({ limit: 10 });
const contact = await crm.getContactById('cnt_123');
```

### 4. Error Handling

Handle API call errors gracefully:

```typescript
try {
  const contacts = await crmClient.getContacts();
} catch (error) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      console.error('Service not found');
    } else if (error.response?.status === 500) {
      console.error('Target service error:', error.response.data);
    } else {
      console.error('API call failed:', error.message);
    }
  } else {
    console.error('Unexpected error:', error);
  }

  // Return fallback data or rethrow
  return [];
}
```

---

## Sharing Data

### 1. Setting Shared Data

Store data that can be accessed by multiple plugins:

```typescript
async function setSharedData(namespace: string, key: string, value: any, ttl?: number) {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  await axios.post(
    `${gatewayUrl}/api/plugin-gateway/shared-data`,
    {
      namespace,
      key,
      value,
      ownerId: process.env.PLUGIN_ID,
      ttl,
    },
    {
      headers: {
        'X-Tenant-Slug': tenantSlug,
        'Content-Type': 'application/json',
      },
    }
  );
}

// Example: Cache contact count
await setSharedData(
  'crm.cache',
  'contact_count',
  1250,
  3600 // Expire after 1 hour
);
```

### 2. Getting Shared Data

Retrieve shared data:

```typescript
async function getSharedData<T = any>(namespace: string, key: string): Promise<T | null> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  try {
    const response = await axios.get(
      `${gatewayUrl}/api/plugin-gateway/shared-data/${namespace}/${key}`,
      {
        headers: {
          'X-Tenant-Slug': tenantSlug,
        },
      }
    );

    return response.data.value;
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Data not found or expired
    }
    throw error;
  }
}

// Example: Read cached contact count
const contactCount = await getSharedData<number>('crm.cache', 'contact_count');
```

### 3. Deleting Shared Data

Remove shared data:

```typescript
async function deleteSharedData(namespace: string, key: string) {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  await axios.delete(`${gatewayUrl}/api/plugin-gateway/shared-data/${namespace}/${key}`, {
    headers: {
      'X-Tenant-Slug': tenantSlug,
    },
  });
}
```

### 4. Listing Keys in Namespace

Get all keys in a namespace:

```typescript
async function listSharedDataKeys(namespace: string, ownerId?: string): Promise<string[]> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  const response = await axios.get(`${gatewayUrl}/api/plugin-gateway/shared-data/${namespace}`, {
    params: { ownerId },
    headers: {
      'X-Tenant-Slug': tenantSlug,
    },
  });

  return response.data.keys;
}

// Example: List all CRM cache keys
const keys = await listSharedDataKeys('crm.cache');
```

### 5. Use Cases for Shared Data

**Caching**:

```typescript
// Cache expensive calculations
await setSharedData('analytics.cache', 'monthly_report', reportData, 86400);
```

**Feature Flags**:

```typescript
// Share feature flags
await setSharedData('system.flags', 'new_ui_enabled', true);
```

**Cross-Plugin State**:

```typescript
// Share workflow state
await setSharedData('workflow.state', 'approval_pending', {
  requestId: '123',
  approver: 'user_456',
});
```

---

## Managing Dependencies

### 1. Declaring Dependencies

In `plugin.json`:

```json
{
  "api": {
    "dependencies": [
      {
        "pluginId": "plugin-crm",
        "serviceName": "crm.contacts",
        "version": "^1.0.0",
        "required": true,
        "reason": "Required to fetch contact data for analytics"
      }
    ]
  }
}
```

### 2. Registering Dependencies

Register during plugin installation:

```typescript
async function registerDependencies() {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';

  await axios.post(
    `${gatewayUrl}/api/plugin-gateway/dependencies`,
    {
      dependencies: [
        {
          pluginId: 'plugin-analytics',
          dependsOnPluginId: 'plugin-crm',
          version: '^1.0.0',
          required: true,
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
```

### 3. Resolving Dependencies

Check if dependencies are satisfied before activation:

```typescript
async function checkDependencies(pluginId: string) {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  try {
    const response = await axios.post(
      `${gatewayUrl}/api/plugin-gateway/dependencies/${pluginId}/resolve`,
      {},
      {
        headers: {
          'X-Tenant-Slug': tenantSlug,
        },
      }
    );

    if (!response.data.valid) {
      console.error('Dependency resolution failed:');
      response.data.errors.forEach((err) => console.error(`  - ${err}`));
      response.data.warnings.forEach((warn) => console.warn(`  - ${warn}`));
      return false;
    }

    console.log('✅ All dependencies satisfied');
    console.log('Install order:', response.data.installOrder);
    return true;
  } catch (error) {
    console.error('Failed to resolve dependencies:', error.message);
    return false;
  }
}
```

### 4. Checking if Plugin Can Uninstall

Before uninstalling, check if other plugins depend on it:

```typescript
async function canUninstall(pluginId: string): Promise<boolean> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const tenantSlug = process.env.TENANT_SLUG || 'default';

  const response = await axios.post(
    `${gatewayUrl}/api/plugin-gateway/dependencies/${pluginId}/can-uninstall`,
    {},
    {
      headers: {
        'X-Tenant-Slug': tenantSlug,
      },
    }
  );

  if (!response.data.canUninstall) {
    console.error('Cannot uninstall plugin:');
    response.data.blockedBy.forEach((blocker) => {
      console.error(`  - ${blocker.pluginId}: ${blocker.reason}`);
    });
    return false;
  }

  return true;
}
```

---

## Best Practices

### 1. API Design

✅ **DO**:

- Use RESTful conventions
- Return consistent error formats
- Version your APIs (in manifest version)
- Document all endpoints clearly
- Use proper HTTP status codes

❌ **DON'T**:

- Expose internal database structure directly
- Use non-standard HTTP methods
- Return HTML instead of JSON
- Break backward compatibility without version bump

### 2. Service Naming

✅ **DO**:

```
crm.contacts
crm.deals
analytics.reports
invoicing.templates
```

❌ **DON'T**:

```
contacts-service
CRM_Contacts
crm/contacts
crm-contacts-v1
```

### 3. Versioning

- Use semantic versioning (semver)
- Increment MAJOR for breaking changes
- Increment MINOR for new features
- Increment PATCH for bug fixes

```
1.0.0 → 1.0.1 (bug fix)
1.0.1 → 1.1.0 (new feature)
1.1.0 → 2.0.0 (breaking change)
```

### 4. Error Handling

Always handle errors gracefully:

```typescript
try {
  const contacts = await crmClient.getContacts();
  return processContacts(contacts);
} catch (error) {
  // Log error
  logger.error({ error }, 'Failed to fetch contacts');

  // Return fallback data
  return {
    contacts: [],
    error: 'Failed to load contacts',
    cached: false,
  };
}
```

### 5. Caching

Cache service discovery results:

```typescript
const serviceCache = new Map<string, { service: any; expiresAt: number }>();

async function discoverServiceCached(serviceName: string) {
  const cached = serviceCache.get(serviceName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.service;
  }

  const service = await discoverService(serviceName);
  serviceCache.set(serviceName, {
    service,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  return service;
}
```

### 6. Security

- Validate all input data
- Never trust data from other plugins
- Use the tenant context properly
- Check permissions before exposing data
- Sanitize user input before storing

```typescript
fastify.post('/contacts', async (request, reply) => {
  // Validate input
  const schema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    company: z.string().optional(),
  });

  try {
    const validatedData = schema.parse(request.body);
    // Process validated data...
  } catch (error) {
    return reply.status(400).send({
      error: 'Validation failed',
      details: error.errors,
    });
  }
});
```

---

## Common Patterns

### Pattern 1: Data Aggregation

Combine data from multiple plugins:

```typescript
async function generateDashboard(tenantSlug: string) {
  const crmClient = new CRMClient(tenantSlug);
  const marketingClient = new MarketingClient(tenantSlug);

  // Fetch data in parallel
  const [contacts, campaigns, deals] = await Promise.all([
    crmClient.getContacts(),
    marketingClient.getCampaigns(),
    crmClient.getDeals(),
  ]);

  // Aggregate data
  return {
    totalContacts: contacts.length,
    activeCampaigns: campaigns.filter((c) => c.status === 'active').length,
    openDeals: deals.filter((d) => d.stage !== 'closed').length,
    totalRevenue: deals
      .filter((d) => d.stage === 'closed-won')
      .reduce((sum, d) => sum + d.amount, 0),
  };
}
```

### Pattern 2: Event-Driven Updates

React to changes in other plugins:

```typescript
// CRM Plugin: Emit event when contact created
fastify.post('/contacts', async (request, reply) => {
  const contact = await db.contact.create({ data: request.body });

  // Store event in shared data
  await setSharedData(
    'crm.events',
    `contact.created.${contact.id}`,
    {
      eventType: 'contact.created',
      contactId: contact.id,
      timestamp: new Date().toISOString(),
    },
    3600 // Keep for 1 hour
  );

  reply.status(201).send(contact);
});

// Marketing Plugin: Poll for new contact events
async function syncNewContacts() {
  const keys = await listSharedDataKeys('crm.events');
  const contactCreatedKeys = keys.filter((k) => k.startsWith('contact.created.'));

  for (const key of contactCreatedKeys) {
    const event = await getSharedData('crm.events', key);
    if (event) {
      await addContactToCampaign(event.contactId);
      await deleteSharedData('crm.events', key); // Mark as processed
    }
  }
}

// Run sync every 5 minutes
setInterval(syncNewContacts, 5 * 60 * 1000);
```

### Pattern 3: Progressive Enhancement

Gracefully degrade when dependencies are unavailable:

```typescript
async function generateReport(tenantSlug: string) {
  let contacts = [];
  let hasCRMData = false;

  try {
    // Try to fetch from CRM
    const crmClient = new CRMClient(tenantSlug);
    contacts = await crmClient.getContacts();
    hasCRMData = true;
  } catch (error) {
    console.warn('CRM plugin unavailable, using limited data');
    // Use cached or default data
    contacts = await getCachedContacts(tenantSlug);
  }

  return {
    contacts,
    contactCount: contacts.length,
    dataSources: {
      crm: hasCRMData,
      cache: !hasCRMData,
    },
    generatedAt: new Date().toISOString(),
  };
}
```

### Pattern 4: Lazy Loading

Load data on-demand:

```typescript
class DataAggregator {
  private contactsCache: any[] | null = null;
  private dealsCache: any[] | null = null;

  async getContacts(tenantSlug: string) {
    if (!this.contactsCache) {
      const crmClient = new CRMClient(tenantSlug);
      this.contactsCache = await crmClient.getContacts();
    }
    return this.contactsCache;
  }

  async getDeals(tenantSlug: string) {
    if (!this.dealsCache) {
      const crmClient = new CRMClient(tenantSlug);
      this.dealsCache = await crmClient.getDeals();
    }
    return this.dealsCache;
  }

  clearCache() {
    this.contactsCache = null;
    this.dealsCache = null;
  }
}
```

---

## Troubleshooting

### Problem: Service Not Found

**Error**: `Service crm.contacts not found or unavailable`

**Solutions**:

1. Check if CRM plugin is running
2. Verify service registration occurred
3. Check service status: `GET /api/plugin-gateway/services`
4. Ensure service name matches exactly (case-sensitive)

```bash
# Check if service is registered
curl http://localhost:3000/api/plugin-gateway/services/discover/crm.contacts \
  -H "X-Tenant-Slug: acme-corp"
```

### Problem: Circular Dependency

**Error**: `Circular dependency detected: plugin-a → plugin-b → plugin-a`

**Solutions**:

1. Review dependency chain
2. Restructure plugins to remove cycle
3. Extract shared functionality to a third plugin

```
# Bad: Circular dependency
plugin-analytics depends on plugin-crm
plugin-crm depends on plugin-analytics

# Good: Extract shared code
plugin-analytics depends on plugin-crm
plugin-crm depends on plugin-shared
plugin-analytics depends on plugin-shared
```

### Problem: Version Mismatch

**Error**: `Version mismatch: plugin-crm@1.5.0 does not satisfy ^2.0.0`

**Solutions**:

1. Update CRM plugin to v2.x
2. Update analytics dependency constraint to `^1.0.0`
3. Check which version is installed: `GET /api/plugin-gateway/dependencies/plugin-analytics`

### Problem: API Call Timeout

**Error**: `API call timeout after 30s`

**Solutions**:

1. Check target service health
2. Optimize slow queries/endpoints
3. Implement caching
4. Add timeout handling:

```typescript
const response = await axios.post(url, data, {
  timeout: 10000, // 10 seconds
});
```

### Problem: Shared Data Not Found

**Error**: `404 Not Found when getting shared data`

**Possible Causes**:

1. Data never set
2. TTL expired
3. Wrong namespace or key
4. Different tenant context

**Debug**:

```typescript
// List all keys in namespace
const keys = await listSharedDataKeys('crm.cache');
console.log('Available keys:', keys);
```

---

## Next Steps

- **See Also**:
  - [Plugin Communication API Reference](../../specs/PLUGIN_COMMUNICATION_API.md)
  - [Architecture Documentation](../../specs/PLUGIN_ECOSYSTEM_ARCHITECTURE.md)
  - [Example: CRM ↔ Analytics](../../specs/EXAMPLES_CRM_ANALYTICS_INTEGRATION.md)
  - [Migration Guide](./plugin-migration.md)

- **Examples**:
  - `apps/plugin-crm/` - Complete CRM plugin example
  - `apps/plugin-analytics/` - Complete Analytics plugin example
  - `scripts/test-plugin-to-plugin.sh` - End-to-end test script

---

**Questions?** Contact backend-team@plexica.com  
**Report Issues**: https://github.com/plexica/plexica/issues  
**Last Updated**: January 22, 2026
