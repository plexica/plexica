# Plugin Migration Guide

**Version:** 1.0  
**Last Updated:** January 2025  
**Milestone:** M2.3 - Plugin-to-Plugin Communication

## Table of Contents

1. [Overview](#overview)
2. [What's New in M2.3](#whats-new-in-m23)
3. [Migration Checklist](#migration-checklist)
4. [Step-by-Step Migration](#step-by-step-migration)
5. [Before & After Examples](#before--after-examples)
6. [Testing Your Migration](#testing-your-migration)
7. [Backward Compatibility](#backward-compatibility)
8. [Troubleshooting](#troubleshooting)

---

## Overview

This guide helps you upgrade existing Plexica plugins to support the **M2.3 Plugin-to-Plugin Communication** features introduced in January 2025.

### Who Should Read This

- **Plugin developers** who want to expose services to other plugins
- **Plugin developers** who want to consume services from other plugins
- **System administrators** upgrading Plexica deployments

### What You'll Achieve

After following this guide, your plugin will be able to:

✅ **Expose services** that other plugins can discover and call  
✅ **Consume services** from other plugins with automatic discovery  
✅ **Declare dependencies** with semantic version constraints  
✅ **Share data** with other plugins using the Shared Data Service  
✅ **Monitor service health** and handle failures gracefully

---

## What's New in M2.3

### New Features

**1. Service Registry**

- Register plugin services with endpoints
- Discover services by name
- Monitor service health (HEALTHY, DEGRADED, UNAVAILABLE)
- Automatic stale service detection

**2. Dependency Resolution**

- Declare plugin dependencies in `plugin.json`
- Semantic version constraints (e.g., `^1.0.0`)
- Automatic validation before installation
- Circular dependency detection

**3. API Gateway**

- Route plugin-to-plugin API calls
- Automatic service discovery
- Tenant and caller context injection
- Endpoint validation and error handling

**4. Shared Data Service**

- Namespaced key-value store
- TTL (time-to-live) support
- Owner tracking
- Automatic cleanup of expired data

### Breaking Changes

**None!** M2.3 is a new feature set with no breaking changes. Existing plugins continue to work without modification.

### New Requirements (Optional)

M2.3 features are **opt-in**. You only need to adopt them if you want to:

- Expose services to other plugins
- Consume services from other plugins
- Share state between plugins

---

## Migration Checklist

### For Plugins Exposing Services

- [ ] Add `api.services` section to `plugin.json`
- [ ] List all endpoints in each service definition
- [ ] Register services on plugin startup
- [ ] Deregister services on plugin shutdown
- [ ] Implement health check endpoint
- [ ] (Optional) Send periodic heartbeats

### For Plugins Consuming Services

- [ ] Add `api.dependencies` section to `plugin.json`
- [ ] Create API client for calling other plugins
- [ ] Use service discovery or direct HTTP calls
- [ ] Handle service unavailability gracefully
- [ ] (Optional) Implement retry logic

### For Plugins Sharing State

- [ ] Install `@plexica/shared-data` SDK (when available)
- [ ] Choose namespace for your data
- [ ] Replace direct DB access with Shared Data API
- [ ] (Optional) Set TTL for temporary data

---

## Step-by-Step Migration

### Scenario 1: Exposing a Service

**Goal:** Make your plugin's APIs discoverable by other plugins.

#### Step 1: Update `plugin.json`

Add the `api.services` section:

```json
{
  "id": "plugin-inventory",
  "name": "Inventory Plugin",
  "version": "2.0.0",

  "api": {
    "services": [
      {
        "name": "inventory.products",
        "version": "1.0.0",
        "description": "Product inventory management",
        "endpoints": [
          {
            "method": "GET",
            "path": "/products",
            "description": "List all products",
            "permissions": ["plugin.inventory.products.read"]
          },
          {
            "method": "GET",
            "path": "/products/:id",
            "description": "Get product by ID",
            "permissions": ["plugin.inventory.products.read"]
          },
          {
            "method": "POST",
            "path": "/products",
            "description": "Create a new product",
            "permissions": ["plugin.inventory.products.write"]
          },
          {
            "method": "PUT",
            "path": "/products/:id",
            "description": "Update a product",
            "permissions": ["plugin.inventory.products.write"]
          },
          {
            "method": "DELETE",
            "path": "/products/:id",
            "description": "Delete a product",
            "permissions": ["plugin.inventory.products.write"]
          }
        ],
        "metadata": {
          "rateLimit": 100,
          "cacheTTL": 300
        }
      }
    ],
    "dependencies": []
  }
}
```

**Key Points:**

- `name` must be unique across all plugins in tenant
- `version` follows semantic versioning (major.minor.patch)
- `endpoints` list all HTTP endpoints with method and path
- `permissions` specify required permissions for each endpoint
- `metadata` is optional (rate limits, cache TTL, etc.)

#### Step 2: Create Service Registration Module

Create `src/lib/service-registry.ts`:

```typescript
import axios from 'axios';

interface ServiceRegistration {
  pluginId: string;
  tenantId: string;
  serviceName: string;
  version: string;
  baseUrl?: string;
  endpoints?: Array<{
    method: string;
    path: string;
    description?: string;
    permissions?: string[];
  }>;
}

export async function registerServices(options: {
  pluginId: string;
  tenantId: string;
  baseUrl: string;
  services: Array<{ name: string; version: string }>;
}) {
  const coreApiUrl = process.env.CORE_API_URL || 'http://localhost:3000';

  for (const service of options.services) {
    const registration: ServiceRegistration = {
      pluginId: options.pluginId,
      tenantId: options.tenantId,
      serviceName: service.name,
      version: service.version,
      baseUrl: options.baseUrl,
      // Endpoints are parsed from plugin.json by core-api
    };

    try {
      const response = await axios.post(`${coreApiUrl}/api/services/register`, registration);
      console.log(`✅ Registered service: ${service.name} (${response.data.serviceId})`);
    } catch (error) {
      console.error(`❌ Failed to register service ${service.name}:`, error);
      throw error;
    }
  }
}

export async function deregisterServices(options: {
  pluginId: string;
  tenantId: string;
  services: string[];
}) {
  const coreApiUrl = process.env.CORE_API_URL || 'http://localhost:3000';

  for (const serviceName of options.services) {
    try {
      await axios.delete(`${coreApiUrl}/api/services/deregister`, {
        data: {
          pluginId: options.pluginId,
          tenantId: options.tenantId,
          serviceName,
        },
      });
      console.log(`✅ Deregistered service: ${serviceName}`);
    } catch (error) {
      console.error(`❌ Failed to deregister service ${serviceName}:`, error);
    }
  }
}
```

#### Step 3: Register on Startup

Update your plugin's entry point (e.g., `src/index.ts`):

```typescript
import Fastify from 'fastify';
import { registerServices, deregisterServices } from './lib/service-registry.js';

async function start() {
  const app = Fastify({ logger: true });

  // Register routes
  await app.register(productsRoutes);
  await app.register(categoriesRoutes);

  // Start server
  const port = Number(process.env.PORT) || 3100;
  await app.listen({ port, host: '0.0.0.0' });

  // Register services with Plexica
  const pluginId = 'plugin-inventory';
  const tenantId = process.env.TENANT_ID || 'default-tenant';
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

  await registerServices({
    pluginId,
    tenantId,
    baseUrl,
    services: [
      { name: 'inventory.products', version: '1.0.0' },
      { name: 'inventory.categories', version: '1.0.0' },
    ],
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');

    await deregisterServices({
      pluginId,
      tenantId,
      services: ['inventory.products', 'inventory.categories'],
    });

    await app.close();
    process.exit(0);
  });

  console.log(`✅ Inventory Plugin ready on port ${port}`);
}

start().catch((err) => {
  console.error('Failed to start plugin:', err);
  process.exit(1);
});
```

#### Step 4: (Optional) Add Health Check

Add a health endpoint for service monitoring:

```typescript
// src/routes/health.ts
import type { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (request, reply) => {
    // Check database connection
    const dbHealthy = await checkDatabase();

    // Check external dependencies
    const depsHealthy = await checkDependencies();

    const healthy = dbHealthy && depsHealthy;

    return {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealthy ? 'ok' : 'error',
        dependencies: depsHealthy ? 'ok' : 'error',
      },
    };
  });
};

export default healthRoutes;
```

### Scenario 2: Consuming a Service

**Goal:** Call another plugin's APIs with automatic service discovery.

#### Step 1: Declare Dependencies in `plugin.json`

```json
{
  "id": "plugin-reports",
  "name": "Reports Plugin",
  "version": "1.0.0",

  "api": {
    "services": [
      {
        "name": "reports.generator",
        "version": "1.0.0",
        "description": "Report generation service",
        "endpoints": [
          {
            "method": "POST",
            "path": "/reports/generate",
            "description": "Generate a report"
          }
        ]
      }
    ],
    "dependencies": [
      {
        "pluginId": "plugin-inventory",
        "serviceName": "inventory.products",
        "version": "^1.0.0",
        "required": true,
        "reason": "Fetch product data for inventory reports"
      },
      {
        "pluginId": "plugin-crm",
        "serviceName": "crm.contacts",
        "version": "^1.0.0",
        "required": false,
        "reason": "Optional: Link products to customers"
      }
    ]
  }
}
```

**Key Points:**

- `version` uses semver constraints (`^1.0.0` = compatible with 1.x.x)
- `required: true` prevents installation if dependency is missing
- `required: false` allows installation but warns if dependency unavailable
- `reason` explains why the dependency is needed (for documentation)

#### Step 2: Create API Client

Create `src/lib/inventory-client.ts`:

```typescript
import axios, { type AxiosInstance } from 'axios';

export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  quantity: number;
}

export class InventoryApiClient {
  private client: AxiosInstance;

  constructor(baseUrl: string) {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getProducts(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<Product[]> {
    try {
      const response = await this.client.get('/products', { params });
      return response.data.data;
    } catch (error) {
      console.error('Failed to fetch products from inventory plugin:', error);
      throw new Error('Inventory service unavailable');
    }
  }

  async getProductById(id: string): Promise<Product | null> {
    try {
      const response = await this.client.get(`/products/${id}`);
      return response.data.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch product ${id}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.status === 'ok';
    } catch (error) {
      return false;
    }
  }
}
```

#### Step 3: Use API Client in Your Service

```typescript
// src/services/reports.service.ts
import { InventoryApiClient } from '../lib/inventory-client.js';

export class ReportsService {
  private inventoryClient: InventoryApiClient;

  constructor(inventoryBaseUrl: string) {
    this.inventoryClient = new InventoryApiClient(inventoryBaseUrl);
  }

  async generateInventoryReport(): Promise<InventoryReport> {
    // Check service availability
    const isAvailable = await this.inventoryClient.healthCheck();
    if (!isAvailable) {
      throw new Error('Inventory service is not available');
    }

    // Fetch products
    const products = await this.inventoryClient.getProducts();

    // Generate report
    return {
      totalProducts: products.length,
      totalValue: products.reduce((sum, p) => sum + p.price * p.quantity, 0),
      lowStock: products.filter((p) => p.quantity < 10),
      outOfStock: products.filter((p) => p.quantity === 0),
      generatedAt: new Date(),
    };
  }
}
```

#### Step 4: Configure Base URL

Use environment variable for the inventory service URL:

```typescript
// src/index.ts
const inventoryBaseUrl = process.env.INVENTORY_BASE_URL || 'http://localhost:3100';
const reportsService = new ReportsService(inventoryBaseUrl);
```

**Environment file (`.env`):**

```env
INVENTORY_BASE_URL=http://plugin-inventory:3000
```

### Scenario 3: Using Shared Data Service

**Goal:** Share state between plugins using the Shared Data Service.

#### Step 1: Install SDK (Future)

```bash
pnpm add @plexica/shared-data
```

_Note: SDK is coming soon. For now, use REST API directly._

#### Step 2: Set Shared Data

```typescript
import axios from 'axios';

async function setSharedData<T>(
  tenantId: string,
  namespace: string,
  key: string,
  value: T,
  ownerId: string,
  ttl?: number
) {
  const coreApiUrl = process.env.CORE_API_URL || 'http://localhost:3000';

  await axios.post(`${coreApiUrl}/api/shared-data/set`, {
    tenantId,
    namespace,
    key,
    value,
    ownerId,
    ttl,
  });
}

// Example: Cache product count
await setSharedData(
  'tenant-123',
  'inventory.cache',
  'product-count',
  { count: 150, timestamp: new Date() },
  'plugin-inventory',
  300 // 5 minutes TTL
);
```

#### Step 3: Get Shared Data

```typescript
async function getSharedData<T>(
  tenantId: string,
  namespace: string,
  key: string
): Promise<T | null> {
  const coreApiUrl = process.env.CORE_API_URL || 'http://localhost:3000';

  try {
    const response = await axios.get(`${coreApiUrl}/api/shared-data/get`, {
      params: { tenantId, namespace, key },
    });
    return response.data.value;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// Example: Get cached product count
const cachedCount = await getSharedData<{ count: number; timestamp: Date }>(
  'tenant-123',
  'inventory.cache',
  'product-count'
);

if (cachedCount) {
  console.log(`Cached product count: ${cachedCount.count}`);
} else {
  // Cache miss - fetch fresh data
}
```

---

## Before & After Examples

### Example 1: Inventory → Reports Integration

**Before M2.3 (Hard-coded URLs):**

```typescript
// ❌ BAD: Hard-coded URL, no dependency management
const INVENTORY_URL = 'http://localhost:3100';

async function generateReport() {
  const response = await axios.get(`${INVENTORY_URL}/products`);
  const products = response.data;

  // What if inventory plugin moves to a different URL?
  // What if inventory plugin is uninstalled?
  // No version checking!
}
```

**After M2.3 (Service Discovery):**

```typescript
// ✅ GOOD: Declared dependency, service discovery
// plugin.json
{
  "api": {
    "dependencies": [
      {
        "pluginId": "plugin-inventory",
        "serviceName": "inventory.products",
        "version": "^1.0.0",
        "required": true
      }
    ]
  }
}

// reports.service.ts
import { InventoryApiClient } from '../lib/inventory-client.js';

const inventoryClient = new InventoryApiClient(process.env.INVENTORY_BASE_URL);

async function generateReport() {
  // Dependency validated at installation time
  // Version constraint checked
  // Service discovery finds correct URL
  const products = await inventoryClient.getProducts();

  // If inventory is unavailable, graceful error handling
}
```

### Example 2: Caching Product Data

**Before M2.3 (Local cache only):**

```typescript
// ❌ BAD: Each plugin has its own cache
const cache = new Map<string, Product[]>();

async function getProducts(): Promise<Product[]> {
  const cached = cache.get('all-products');
  if (cached) return cached;

  const products = await db.product.findMany();
  cache.set('all-products', products);
  return products;
}

// Problem: Cache not shared across plugins!
// Problem: No TTL - stale data
```

**After M2.3 (Shared Data Service):**

```typescript
// ✅ GOOD: Shared cache with TTL
import { SharedDataService } from '@plexica/shared-data';

const sharedData = new SharedDataService(/* ... */);

async function getProducts(): Promise<Product[]> {
  // Check shared cache (all plugins can access)
  const cached = await sharedData.get<Product[]>(tenantId, 'inventory.cache', 'all-products');

  if (cached) return cached;

  const products = await db.product.findMany();

  // Store with 5-minute TTL (auto-expires)
  await sharedData.set(tenantId, 'inventory.cache', 'all-products', products, 'plugin-inventory', {
    ttl: 300,
  });

  return products;
}
```

---

## Testing Your Migration

### 1. Unit Tests

Test your API client:

```typescript
import { describe, it, expect } from 'vitest';
import { InventoryApiClient } from '../src/lib/inventory-client';

describe('InventoryApiClient', () => {
  it('should fetch products from inventory plugin', async () => {
    const client = new InventoryApiClient('http://localhost:3100');
    const products = await client.getProducts();

    expect(products).toBeDefined();
    expect(Array.isArray(products)).toBe(true);
  });

  it('should handle service unavailability', async () => {
    const client = new InventoryApiClient('http://invalid-url:9999');

    await expect(client.getProducts()).rejects.toThrow('Inventory service unavailable');
  });
});
```

### 2. Integration Tests

Test plugin-to-plugin communication:

```typescript
import { describe, it, beforeAll, afterAll } from 'vitest';
import { startInventoryPlugin, stopInventoryPlugin } from './helpers/inventory';
import { ReportsService } from '../src/services/reports.service';

describe('Inventory → Reports Integration', () => {
  beforeAll(async () => {
    await startInventoryPlugin();
  });

  afterAll(async () => {
    await stopInventoryPlugin();
  });

  it('should generate inventory report using inventory data', async () => {
    const reportsService = new ReportsService('http://localhost:3100');
    const report = await reportsService.generateInventoryReport();

    expect(report.totalProducts).toBeGreaterThan(0);
    expect(report.totalValue).toBeGreaterThan(0);
    expect(report.lowStock).toBeDefined();
  });
});
```

### 3. End-to-End Tests

Create a test script (`scripts/test-migration.sh`):

```bash
#!/bin/bash

echo "🧪 Testing Plugin Migration"
echo "============================"

# Step 1: Start plugins
echo "1️⃣  Starting inventory plugin..."
cd apps/plugin-inventory/backend
PORT=3100 pnpm dev &
INVENTORY_PID=$!

sleep 3

echo "2️⃣  Starting reports plugin..."
cd ../../plugin-reports/backend
PORT=3200 INVENTORY_BASE_URL=http://localhost:3100 pnpm dev &
REPORTS_PID=$!

sleep 3

# Step 2: Test service discovery
echo "3️⃣  Testing service discovery..."
curl -s http://localhost:3000/api/services/discover?serviceName=inventory.products | jq .

# Step 3: Test report generation
echo "4️⃣  Generating report..."
curl -s -X POST http://localhost:3200/reports/generate | jq .

# Step 4: Cleanup
echo "5️⃣  Cleaning up..."
kill $INVENTORY_PID $REPORTS_PID

echo "✅ Migration test complete!"
```

---

## Backward Compatibility

### Existing Plugins Continue to Work

**M2.3 features are opt-in.** Plugins that don't declare `api.services` or `api.dependencies` continue to function as before.

**No Changes Required If:**

- Your plugin doesn't need to communicate with other plugins
- Your plugin doesn't need to share state
- Your plugin is standalone

**Recommended to Adopt If:**

- You want other plugins to discover your services
- You want to consume services from other plugins
- You want to build an ecosystem of integrated plugins

### Deprecation Timeline

**Current (M2.3):**

- All M2.3 features are optional
- No deprecations

**Future (M3.0+):**

- Hard-coded URLs between plugins may be discouraged
- Service Registry may become required for all plugins
- Direct database access between plugins may be restricted

**Recommendation:** Start adopting M2.3 features now to future-proof your plugins.

---

## Troubleshooting

### Issue 1: Service Registration Fails

**Error:**

```
❌ Failed to register service inventory.products: 400 Bad Request
```

**Solution:**

- Check `plugin.json` syntax (valid JSON)
- Ensure `api.services[].name` is unique
- Verify `api.services[].version` follows semver (e.g., `1.0.0`)
- Check `api.services[].endpoints` have required fields (`method`, `path`)

### Issue 2: Dependency Validation Fails

**Error:**

```
Cannot install plugin-reports: Missing required dependency 'inventory.products'
```

**Solution:**

- Install the dependency plugin first
- Check dependency plugin is installed for the same tenant
- Verify dependency plugin version satisfies constraint
- If dependency is optional, set `required: false` in `plugin.json`

### Issue 3: Service Not Discoverable

**Error:**

```
Service not found: inventory.products
```

**Solutions:**

1. **Check service is registered:**

   ```bash
   curl http://localhost:3000/api/services/list?tenantId=tenant-123
   ```

2. **Check service status:**

   ```sql
   SELECT * FROM plugin_services WHERE service_name = 'inventory.products';
   ```

3. **Re-register service:**
   Restart the plugin to trigger re-registration

4. **Check tenant ID:**
   Ensure both plugins use the same `tenantId`

### Issue 4: Stale Service Data

**Error:**

```
Service unavailable: inventory.products
```

**Solutions:**

1. **Check plugin is running:**

   ```bash
   curl http://localhost:3100/health
   ```

2. **Send heartbeat:**

   ```bash
   curl -X POST http://localhost:3000/api/services/heartbeat \
     -H "Content-Type: application/json" \
     -d '{"pluginId":"plugin-inventory","tenantId":"tenant-123","serviceName":"inventory.products"}'
   ```

3. **Check `lastSeenAt` timestamp:**

   ```sql
   SELECT service_name, status, last_seen_at
   FROM plugin_services
   WHERE plugin_id = 'plugin-inventory';
   ```

4. **Manually mark as healthy:**
   ```bash
   curl -X PUT http://localhost:3000/api/services/{serviceId}/health \
     -H "Content-Type: application/json" \
     -d '{"status":"HEALTHY"}'
   ```

### Issue 5: Circular Dependencies

**Error:**

```
Circular dependency detected: plugin-a -> plugin-b -> plugin-c -> plugin-a
```

**Solution:**

- Redesign plugin architecture to remove circular dependencies
- Extract shared functionality into a separate plugin
- Use Shared Data Service instead of direct API calls
- Make one dependency optional (`required: false`)

### Issue 6: Version Mismatch

**Error:**

```
Version mismatch for inventory.products: requires ^2.0.0, installed 1.5.0
```

**Solutions:**

1. **Upgrade dependency plugin:**

   ```bash
   # Update inventory plugin to 2.x.x
   ```

2. **Relax version constraint:**

   ```json
   {
     "version": ">=1.5.0 <3.0.0"
   }
   ```

3. **Pin to specific version:**
   ```json
   {
     "version": "1.5.0"
   }
   ```

---

## Summary

### Migration Steps Recap

1. ✅ **Understand M2.3 features** (service registry, dependencies, shared data)
2. ✅ **Update `plugin.json`** (add `api.services` and/or `api.dependencies`)
3. ✅ **Register services on startup** (call service registry API)
4. ✅ **Create API clients** (for calling other plugins)
5. ✅ **Handle errors gracefully** (service unavailability, version mismatches)
6. ✅ **Test thoroughly** (unit, integration, end-to-end)
7. ✅ **Deploy incrementally** (migrate one plugin at a time)

### Key Benefits

- **Loose Coupling** - Plugins communicate via contracts, not hard-coded URLs
- **Version Safety** - Semantic version constraints prevent incompatibilities
- **Automatic Discovery** - No manual service configuration
- **Health Monitoring** - Detect and handle service failures
- **Shared State** - Plugins can collaborate via Shared Data Service

### Next Steps

- Read the [Plugin Developer Guide](./plugin-development.md)
- Review the [CRM ↔ Analytics Example](../../specs/EXAMPLES_CRM_ANALYTICS_INTEGRATION.md)
- Check the [API Reference](../../specs/PLUGIN_COMMUNICATION_API.md)
- Join the community forum for questions

---

**Related Documentation:**

- [Plugin Developer Guide](./plugin-development.md) - Building M2.3-compatible plugins
- [API Reference](../../specs/PLUGIN_COMMUNICATION_API.md) - Complete API documentation
- [Architecture Overview](../../specs/PLUGIN_ECOSYSTEM_ARCHITECTURE.md) - System design

---

_Plexica Migration Guide v1.0_  
_Last Updated: January 2025_  
_Milestone: M2.3 - Plugin-to-Plugin Communication_
