# Plugin Backend Guide

**Date**: February 10, 2026
**Status**: Active
**Target Audience**: Plugin developers building backend services
**Prerequisites**: Complete the [Quick Start](./PLUGIN_QUICK_START.md) first

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Creating a Backend Server](#creating-a-backend-server)
- [Plugin Manifest (plugin.json)](#plugin-manifest-pluginjson)
- [Exposing REST Endpoints](#exposing-rest-endpoints)
- [Health Check Endpoint](#health-check-endpoint)
- [Tenant Context](#tenant-context)
- [Service Registration](#service-registration)
- [Event System](#event-system)
- [Plugin-to-Plugin Communication](#plugin-to-plugin-communication)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

Plugin backends are **standalone Fastify servers** that run alongside the core-api. Each plugin backend:

1. Starts its own HTTP server on a unique port
2. Exposes REST endpoints for its domain logic
3. Registers its services with the plugin gateway for discovery
4. Receives tenant context via HTTP headers from the core-api proxy

```
Core API (:4000)                    Plugin Backends
 ┌──────────────────────┐            ┌───────────────────┐
 │  Plugin Gateway      │───proxy───▶│ CRM Plugin (:3100)│
 │  /api/plugin-gateway │            │  /contacts        │
 │                      │            │  /deals           │
 │  Service Registry    │            │  /health          │
 │  - Discovers plugins │            └───────────────────┘
 │  - Routes requests   │
 │  - Injects headers   │            ┌───────────────────┐
 │                      │───proxy───▶│ Analytics (:3200) │
 │                      │            │  /reports         │
 └──────────────────────┘            │  /health          │
                                     └───────────────────┘
```

**Key points**:

- Plugins do NOT share a process with core-api
- Plugins do NOT import from core-api directly
- Communication is via HTTP (REST) and events (Kafka)
- Each plugin manages its own data storage (in-memory, database, or external service)

---

## Project Structure

```
apps/plugin-myplugin/
├── backend/
│   ├── package.json               # Dependencies (fastify, etc.)
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts               # Server entry point
│       ├── routes/
│       │   └── my-resource.routes.ts
│       ├── services/
│       │   └── my-resource.service.ts
│       └── types/
│           └── index.ts           # Domain types
├── src/                           # Frontend (see PLUGIN_FRONTEND_GUIDE.md)
│   ├── Plugin.tsx
│   └── ...
├── plugin.json                    # Plugin manifest
├── package.json                   # Root package.json
└── vite.config.ts                 # Frontend build config
```

---

## Creating a Backend Server

Use Fastify as the HTTP framework. Here is a minimal backend entry point:

```typescript
// File: apps/plugin-myplugin/backend/src/index.ts
import Fastify from 'fastify';
import { MyResourceService } from './services/my-resource.service.js';
import { myResourceRoutes } from './routes/my-resource.routes.js';

const PORT = parseInt(process.env.PORT || '3300', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const fastify = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Initialize services
  const myService = new MyResourceService();

  // Health check (required)
  fastify.get('/health', async () => ({
    status: 'ok',
    plugin: 'myplugin',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }));

  // Plugin info (recommended)
  fastify.get('/info', async () => ({
    id: 'plugin-myplugin',
    name: 'My Plugin',
    version: '1.0.0',
    services: [
      {
        name: 'myplugin.resources',
        version: '1.0.0',
        endpoints: [
          { method: 'GET', path: '/resources' },
          { method: 'GET', path: '/resources/:id' },
          { method: 'POST', path: '/resources' },
        ],
      },
    ],
  }));

  // Register routes
  await myResourceRoutes(fastify, myService);

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    reply.status(500).send({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Start
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`Plugin server started on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
```

### Dependencies

```json
{
  "dependencies": {
    "fastify": "^4.28.0",
    "pino-pretty": "^11.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

---

## Plugin Manifest (plugin.json)

The `plugin.json` manifest declares your plugin's capabilities, configuration, permissions, and endpoints. Core-api reads this to manage plugin lifecycle.

### Full Example

```json
{
  "id": "sample-analytics",
  "name": "Sample Analytics Plugin",
  "version": "1.0.0",
  "description": "Analytics capabilities for tracking user activity",
  "category": "analytics",

  "metadata": {
    "author": {
      "name": "Plexica Team",
      "email": "team@plexica.dev"
    },
    "license": "MIT",
    "keywords": ["analytics", "reporting"]
  },

  "config": [
    {
      "key": "apiKey",
      "type": "string",
      "label": "API Key",
      "description": "External service API key",
      "required": true,
      "validation": {
        "minLength": 10,
        "maxLength": 100,
        "pattern": "^[a-zA-Z0-9_-]+$"
      }
    },
    {
      "key": "trackingEnabled",
      "type": "boolean",
      "label": "Enable Tracking",
      "default": true,
      "required": false
    },
    {
      "key": "reportingInterval",
      "type": "number",
      "label": "Reporting Interval (hours)",
      "default": 24,
      "required": false,
      "validation": { "min": 1, "max": 168 }
    }
  ],

  "permissions": [
    {
      "resource": "analytics",
      "action": "read",
      "description": "View analytics data"
    },
    {
      "resource": "analytics",
      "action": "write",
      "description": "Generate reports"
    }
  ],

  "backend": {
    "entry": "./src/index.ts",
    "hooks": [
      {
        "name": "user.login",
        "description": "Track user login events"
      },
      {
        "name": "api.request",
        "description": "Track API requests for usage analytics"
      }
    ],
    "endpoints": [
      {
        "method": "GET",
        "path": "/analytics/dashboard",
        "description": "Get analytics dashboard data",
        "auth": true
      },
      {
        "method": "POST",
        "path": "/analytics/reports",
        "description": "Generate a new report",
        "auth": true
      }
    ]
  },

  "frontend": {
    "routes": [
      {
        "path": "/analytics",
        "component": "AnalyticsDashboard",
        "title": "Analytics"
      }
    ],
    "menuItems": [
      {
        "label": "Analytics",
        "path": "/analytics",
        "icon": "chart-bar",
        "order": 100
      }
    ]
  }
}
```

### Config Field Types

| Type          | Description                    | Extra Properties                               |
| ------------- | ------------------------------ | ---------------------------------------------- |
| `string`      | Text input                     | `validation.pattern`, `minLength`, `maxLength` |
| `number`      | Numeric input                  | `validation.min`, `validation.max`             |
| `boolean`     | Toggle switch                  | `default: true/false`                          |
| `select`      | Single-choice dropdown         | `options: [{value, label}]`                    |
| `multiselect` | Multi-choice dropdown          | `options: [{value, label}]`                    |
| `json`        | JSON editor (advanced configs) | —                                              |

### Backend Manifest Types

The full TypeScript definitions for the manifest are in `apps/core-api/src/types/plugin.types.ts`. Key interfaces:

- `PluginManifest` — top-level structure
- `PluginConfigField` — config field definition
- `PluginPermission` — permission declaration
- `PluginHook` — event hook declaration
- `PluginEndpoint` — REST endpoint declaration
- `PluginApiService` — service exposed for plugin-to-plugin communication
- `PluginApiDependency` — dependency on another plugin's API

---

## Exposing REST Endpoints

### Route Pattern

Register routes as Fastify plugins that receive the service instance:

```typescript
// File: apps/plugin-myplugin/backend/src/routes/items.routes.ts
import type { FastifyInstance } from 'fastify';
import type { ItemsService } from '../services/items.service.js';
import type { CreateItemInput, UpdateItemInput } from '../types/index.js';

export async function itemsRoutes(fastify: FastifyInstance, service: ItemsService) {
  // List
  fastify.get('/items', async (request, reply) => {
    const { skip, take, search } = request.query as any;
    const result = service.list({
      skip: skip ? parseInt(skip) : undefined,
      take: take ? parseInt(take) : undefined,
      search,
    });
    return reply.send({ success: true, data: result.items, total: result.total });
  });

  // Get by ID
  fastify.get<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const item = service.getById(request.params.id);
    if (!item) {
      return reply.status(404).send({ success: false, error: 'Item not found' });
    }
    return reply.send({ success: true, data: item });
  });

  // Create
  fastify.post<{ Body: CreateItemInput }>('/items', async (request, reply) => {
    if (!request.body.name) {
      return reply.status(400).send({ success: false, error: 'name is required' });
    }
    const item = service.create(request.body);
    return reply.status(201).send({ success: true, data: item });
  });

  // Update
  fastify.put<{ Params: { id: string }; Body: UpdateItemInput }>(
    '/items/:id',
    async (request, reply) => {
      const item = service.update(request.params.id, request.body);
      if (!item) {
        return reply.status(404).send({ success: false, error: 'Item not found' });
      }
      return reply.send({ success: true, data: item });
    }
  );

  // Delete
  fastify.delete<{ Params: { id: string } }>('/items/:id', async (request, reply) => {
    const deleted = service.delete(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ success: false, error: 'Item not found' });
    }
    return reply.send({ success: true, message: 'Item deleted' });
  });
}
```

### Response Format Convention

All endpoints should return a consistent response shape:

```typescript
// Success
{ "success": true, "data": { ... } }
{ "success": true, "data": [...], "total": 42 }
{ "success": true, "message": "Item deleted" }

// Error
{ "success": false, "error": "Item not found" }
{ "success": false, "error": "Internal server error", "message": "..." }
```

### Service Pattern

Services encapsulate business logic. They are pure TypeScript classes — no framework dependency:

```typescript
// File: apps/plugin-myplugin/backend/src/services/items.service.ts
import type { Item, CreateItemInput, UpdateItemInput, ListQueryParams } from '../types/index.js';

export class ItemsService {
  private items: Map<string, Item> = new Map();
  private idCounter = 1;

  list(params: ListQueryParams = {}): { items: Item[]; total: number } {
    const { skip = 0, take = 50, search } = params;
    let filtered = Array.from(this.items.values());

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((i) => i.name.toLowerCase().includes(q));
    }

    const total = filtered.length;
    const items = filtered.slice(skip, skip + take);
    return { items, total };
  }

  getById(id: string): Item | null {
    return this.items.get(id) || null;
  }

  create(input: CreateItemInput): Item {
    const id = `item-${this.idCounter++}`;
    const now = new Date();
    const item: Item = { id, ...input, createdAt: now, updatedAt: now };
    this.items.set(id, item);
    return item;
  }

  update(id: string, input: UpdateItemInput): Item | null {
    const existing = this.items.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...input, updatedAt: new Date() };
    this.items.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.items.delete(id);
  }

  count(): number {
    return this.items.size;
  }
}
```

> **Note**: The CRM plugin uses in-memory `Map` storage with seed data. For production plugins, use a database (Prisma, Drizzle, or direct SQL) and scope all queries by tenant.

---

## Health Check Endpoint

Every plugin backend **must** expose a `GET /health` endpoint. The plugin gateway uses this to monitor service availability.

```typescript
fastify.get('/health', async () => ({
  status: 'ok',
  plugin: 'myplugin',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
  // Optional: report service-specific health
  services: {
    database: 'connected',
    externalApi: 'reachable',
  },
}));
```

The service registry tracks three health states:

| State         | Meaning                              |
| ------------- | ------------------------------------ |
| `HEALTHY`     | Health check returns 200             |
| `DEGRADED`    | Health check slow or partial failure |
| `UNAVAILABLE` | Health check fails or times out      |

---

## Tenant Context

When requests arrive through the plugin gateway (proxied by core-api), the gateway injects tenant context as HTTP headers:

| Header               | Description                                                   |
| -------------------- | ------------------------------------------------------------- |
| `X-Tenant-ID`        | The tenant ID for the current request                         |
| `X-Caller-Plugin-ID` | The plugin ID making the request (for plugin-to-plugin calls) |
| `X-User-ID`          | The authenticated user's ID (when available)                  |
| `X-Workspace-ID`     | The active workspace ID (when available)                      |

### Reading Tenant Context

```typescript
fastify.get('/items', async (request, reply) => {
  const tenantId = request.headers['x-tenant-id'] as string;
  const userId = request.headers['x-user-id'] as string | undefined;

  if (!tenantId) {
    return reply.status(400).send({
      success: false,
      error: 'Missing X-Tenant-ID header',
    });
  }

  // Always scope data access by tenant
  const items = service.listByTenant(tenantId);
  return reply.send({ success: true, data: items });
});
```

### Multi-Tenant Data Isolation

Always filter data by `tenantId`. Never return data from one tenant to another:

```typescript
// In your service
listByTenant(tenantId: string): Item[] {
  return Array.from(this.items.values())
    .filter(item => item.tenantId === tenantId);
}
```

---

## Service Registration

Plugins register their services with the plugin gateway so other plugins can discover and call them.

### Registration Request

```bash
curl -X POST http://localhost:4000/api/plugin-gateway/services/register \
  -H "Content-Type: application/json" \
  -d '{
    "pluginId": "plugin-myplugin",
    "services": [
      {
        "name": "myplugin.items",
        "version": "1.0.0",
        "baseUrl": "http://localhost:3300",
        "endpoints": [
          { "method": "GET", "path": "/items" },
          { "method": "GET", "path": "/items/:id" },
          { "method": "POST", "path": "/items" },
          { "method": "PUT", "path": "/items/:id" },
          { "method": "DELETE", "path": "/items/:id" }
        ]
      }
    ]
  }'
```

### Programmatic Registration at Startup

```typescript
// File: apps/plugin-myplugin/backend/src/lib/register.ts
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:4000';

export async function registerWithGateway(pluginId: string, port: number): Promise<void> {
  const response = await fetch(`${GATEWAY_URL}/api/plugin-gateway/services/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pluginId,
      services: [
        {
          name: `${pluginId}.items`,
          version: '1.0.0',
          baseUrl: `http://localhost:${port}`,
          endpoints: [
            { method: 'GET', path: '/items' },
            { method: 'POST', path: '/items' },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error('Failed to register with gateway:', await response.text());
  }
}
```

### Declaring Services in plugin.json

Services can also be declared in the manifest under the `api` key:

```json
{
  "api": {
    "services": [
      {
        "name": "myplugin.items",
        "version": "1.0.0",
        "description": "Item management service",
        "endpoints": [
          { "method": "GET", "path": "/items", "description": "List items" },
          { "method": "POST", "path": "/items", "description": "Create item" }
        ]
      }
    ],
    "dependencies": [
      {
        "pluginId": "plugin-crm",
        "serviceName": "crm.contacts",
        "version": "^1.0.0",
        "required": true,
        "reason": "Fetches contact data for enrichment"
      }
    ]
  }
}
```

---

## Event System

Plexica supports two patterns for asynchronous communication between plugins.

### Legacy Hooks (plugin.json)

Declared in the manifest `backend.hooks` array. The core-api calls your plugin when these events occur:

```json
{
  "backend": {
    "hooks": [
      {
        "name": "user.login",
        "description": "Track user login events"
      },
      {
        "name": "user.logout",
        "description": "Track user logout events"
      }
    ]
  }
}
```

Your plugin receives hook invocations via its `PluginHookContext`:

```typescript
import type { PluginHookContext, PluginHookHandler } from '@plexica/types';

const handleUserLogin: PluginHookHandler = async (context: PluginHookContext) => {
  const { tenantId, userId, data } = context;
  console.log(`User ${userId} logged in for tenant ${tenantId}`);
  // Track the event in your analytics store
};
```

### Decorator-Based Events (M2.1+)

The newer pattern uses decorators for type-safe event handling via `@plexica/event-bus` (Kafka-backed):

```typescript
import { EventHandler, EventPublisher } from '@plexica/event-bus';

class MyPluginEventHandlers {
  @EventHandler('user.login')
  async onUserLogin(event: DomainEvent<{ userId: string }>) {
    // Handle event
  }

  @EventPublisher('myplugin.item.created')
  async publishItemCreated(item: Item) {
    return {
      itemId: item.id,
      name: item.name,
      createdAt: item.createdAt,
    };
  }
}
```

For migration from legacy hooks to decorators, see the [Plugin Migration Guide](./plugin-migration.md).

---

## Plugin-to-Plugin Communication

Plugins can call each other's REST APIs. This is the core pattern demonstrated by the CRM + Analytics plugins.

### HTTP Client Pattern

Create a typed client for the plugin you depend on:

```typescript
// File: apps/plugin-analytics/backend/src/lib/crm-client.ts
export class CRMApiClient {
  constructor(private baseUrl: string) {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getContacts(): Promise<Contact[]> {
    const res = await fetch(`${this.baseUrl}/contacts`);
    const json = await res.json();
    return json.data;
  }

  async getDeals(): Promise<Deal[]> {
    const res = await fetch(`${this.baseUrl}/deals`);
    const json = await res.json();
    return json.data;
  }

  async getPipelineSummary(): Promise<PipelineSummary> {
    const res = await fetch(`${this.baseUrl}/deals/pipeline/summary`);
    const json = await res.json();
    return json.data;
  }
}
```

### Usage in Your Service

```typescript
// File: apps/plugin-analytics/backend/src/services/analytics.service.ts
import { CRMApiClient } from '../lib/crm-client.js';

export class AnalyticsService {
  private crmClient: CRMApiClient;

  constructor(crmBaseUrl: string) {
    this.crmClient = new CRMApiClient(crmBaseUrl);
  }

  async generateReport(): Promise<ReportResult> {
    // Check dependency health first
    const isAvailable = await this.crmClient.healthCheck();
    if (!isAvailable) {
      throw new Error('CRM plugin is not available');
    }

    // Fetch data from CRM plugin
    const [contacts, deals] = await Promise.all([
      this.crmClient.getContacts(),
      this.crmClient.getDeals(),
    ]);

    // Analyze and return
    return {
      totalContacts: contacts.length,
      totalDeals: deals.length,
      // ...
    };
  }
}
```

### Connection Configuration

Pass the dependency URL via environment variable:

```bash
# In your .env or docker-compose
CRM_BASE_URL=http://localhost:3100
```

```typescript
const CRM_BASE_URL = process.env.CRM_BASE_URL || 'http://localhost:3100';
const analyticsService = new AnalyticsService(CRM_BASE_URL);
```

For comprehensive plugin-to-plugin communication patterns (service discovery, shared data, dependency management, circuit breakers), see the [Plugin-to-Plugin Communication Guide](./plugin-development.md).

---

## Testing

### Unit Tests

Test services independently:

```typescript
// File: apps/plugin-myplugin/backend/src/__tests__/items.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ItemsService } from '../services/items.service.js';

describe('ItemsService', () => {
  let service: ItemsService;

  beforeEach(() => {
    service = new ItemsService();
  });

  it('should create an item', () => {
    const item = service.create({ name: 'Test Item' });
    expect(item.id).toBeDefined();
    expect(item.name).toBe('Test Item');
  });

  it('should list items with pagination', () => {
    service.create({ name: 'A' });
    service.create({ name: 'B' });
    service.create({ name: 'C' });

    const result = service.list({ skip: 0, take: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it('should return null for non-existent item', () => {
    expect(service.getById('does-not-exist')).toBeNull();
  });
});
```

### Integration Tests

Test routes with Fastify's `inject` method:

```typescript
// File: apps/plugin-myplugin/backend/src/__tests__/items.routes.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { ItemsService } from '../services/items.service.js';
import { itemsRoutes } from '../routes/items.routes.js';

describe('Items Routes', () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    fastify = Fastify();
    const service = new ItemsService();
    await itemsRoutes(fastify, service);
  });

  it('GET /items returns list', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/items' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('POST /items creates an item', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/items',
      payload: { name: 'New Item' },
    });
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.data.name).toBe('New Item');
  });

  it('GET /items/:id returns 404 for missing item', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/items/nonexistent' });
    expect(response.statusCode).toBe(404);
  });
});
```

---

## Deployment

### Development

```bash
# Start the plugin backend
cd apps/plugin-myplugin/backend
npx tsx src/index.ts

# Or with watch mode
npx tsx watch src/index.ts
```

### Port Allocation

Choose a unique port for your plugin to avoid conflicts:

| Plugin           | Port  |
| ---------------- | ----- |
| Core API         | 4000  |
| CRM Plugin       | 3100  |
| Analytics Plugin | 3200  |
| Your Plugin      | 3300+ |

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
EXPOSE 3300
CMD ["node", "dist/index.js"]
```

### Running Both Frontend and Backend

A plugin with both frontend and backend needs two processes:

```bash
# Terminal 1: Frontend dev server
cd apps/plugin-myplugin
pnpm dev

# Terminal 2: Backend server
cd apps/plugin-myplugin/backend
npx tsx src/index.ts
```

---

## Troubleshooting

### Plugin not discovered by gateway

1. Verify the health endpoint returns `200`:
   ```bash
   curl http://localhost:3300/health
   ```
2. Check that you registered with the gateway (see [Service Registration](#service-registration))
3. Verify the port matches your registration

### Tenant context missing

- Ensure requests go through the plugin gateway (`/api/plugin-gateway/...`), not directly to your plugin
- Direct requests to `localhost:3300` will NOT have `X-Tenant-ID` headers
- For local development, pass headers manually:
  ```bash
  curl -H "X-Tenant-ID: tenant-123" http://localhost:3300/items
  ```

### Plugin-to-plugin calls failing

1. Check the dependency plugin is running: `curl http://localhost:3100/health`
2. Verify the base URL in your environment variable
3. Check for CORS issues if calling from browser context
4. Implement retry logic and health checks before calling

### TypeScript compilation errors

- Use explicit file extensions in imports: `./services/items.service.js` (not `.ts`)
- Set `"moduleResolution": "node16"` or `"bundler"` in tsconfig.json
- Ensure `"type": "module"` in package.json for ESM

---

## Reference

### Example Plugins

| Plugin                      | Location                         | Demonstrates                                |
| --------------------------- | -------------------------------- | ------------------------------------------- |
| CRM Plugin                  | `apps/plugin-crm/backend/`       | Full CRUD, contacts + deals, in-memory data |
| Analytics Plugin            | `apps/plugin-analytics/backend/` | Plugin-to-plugin calls, report generation   |
| Sample Analytics (manifest) | `plugins/sample-analytics/`      | Complete `plugin.json` with all fields      |

### Related Guides

- [Plugin Quick Start](./PLUGIN_QUICK_START.md) — Get running in 15 minutes
- [Plugin Frontend Guide](./PLUGIN_FRONTEND_GUIDE.md) — Building plugin UI
- [Plugin-to-Plugin Communication](./plugin-development.md) — Advanced service communication patterns
- [Plugin Migration Guide](./plugin-migration.md) — Migrating from legacy hooks to decorators

### Type Definitions

- **Frontend types**: `packages/types/src/plugin.ts` — `PluginManifest`, `PluginRoute`, `PluginMenuItem`
- **Backend types**: `apps/core-api/src/types/plugin.types.ts` — `PluginManifest` (richer, includes config/hooks/endpoints/api), `PluginConfigField`, `PluginPermission`, `PluginHook`, `PluginEndpoint`, `PluginApiService`, `PluginApiDependency`

---

_Last updated: February 2026_
