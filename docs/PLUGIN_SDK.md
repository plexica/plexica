# Plugin SDK Developer Guide

**Last Updated**: 2026-02-24
**Status**: Complete
**Audience**: Plugin developers
**Prerequisites**: Node.js 20+, TypeScript 5.x, familiarity with async/await
**Time to Complete**: 20-30 minutes

## Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Plugin Manifest Reference](#plugin-manifest-reference)
4. [PlexicaPlugin Base Class](#plexicaplugin-base-class)
5. [Decorators](#decorators)
6. [Event System](#event-system)
7. [Permission System](#permission-system)
8. [Hook System](#hook-system)
9. [API Client](#api-client)
10. [Service Registration](#service-registration)
11. [Shared Data](#shared-data)
12. [Testing Guide](#testing-guide)
13. [Troubleshooting](#troubleshooting)
14. [See Also](#see-also)

---

## Quick Start

Get a working plugin running in 5 minutes:

```bash
# 1. Install the SDK in your plugin project
pnpm add @plexica/sdk

# 2. Enable decorator support in your tsconfig.json
```

```json
// tsconfig.json — add these two compiler options
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

```typescript
// File: src/my-plugin.ts
import 'reflect-metadata';
import { PlexicaPlugin, EventPublisher, EventHandler, Permission, Hook } from '@plexica/sdk';
import type { PluginContext, ServiceDefinition } from '@plexica/sdk';

@EventPublisher()
@Permission('contacts:read', 'Read Contacts', 'Allows reading the contacts list')
export class MyCrmPlugin extends PlexicaPlugin {
  getServiceDefinitions(): ServiceDefinition[] {
    return [
      {
        name: 'crm.contacts',
        version: '1.0.0',
        baseUrl: 'http://localhost:4100',
        endpoints: [{ method: 'GET', path: '/contacts' }],
      },
    ];
  }

  async onActivate(context: PluginContext): Promise<void> {
    await this.events?.subscribe(
      'core.tenant.created',
      async (event) => {
        console.log('New tenant:', event.data);
      },
      { coreEvent: true }
    );
  }

  @EventHandler('plugin.crm.contact-created')
  async onContactCreated() {
    console.log('A contact was created!');
  }

  @Hook('created')
  async onWorkspaceCreated(context: PluginContext) {
    console.log('Workspace created in tenant:', context.tenantId);
  }
}

// Start the plugin
const plugin = new MyCrmPlugin({
  pluginId: 'plugin-crm',
  name: 'CRM Plugin',
  version: '1.0.0',
  apiBaseUrl: 'http://localhost:4000',
});

await plugin.start('tenant-abc123');
```

**Verify it works**:

```bash
# Run your plugin tests
pnpm test

# Type-check
npx tsc --noEmit
```

---

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Plugin Process                          │
│                                                                 │
│  ┌──────────────┐   ┌─────────────┐   ┌──────────────────────┐ │
│  │ PlexicaPlugin│   │  ApiClient  │   │    EventClient       │ │
│  │  (your code) │──>│  REST calls │   │ publish / subscribe  │ │
│  └──────┬───────┘   └──────┬──────┘   └──────────┬───────────┘ │
│         │                  │                      │             │
│         │           ┌──────▼──────────────────────▼──────────┐ │
│         │           │         Core API (port 4000)           │ │
│         │           │  /api/v1/plugins  /api/v1/workspaces   │ │
│         │           └────────────────────────────────────────┘ │
│         │                                                       │
│  ┌──────▼──────────────────────────────────────────────────┐   │
│  │  Decorators (metadata read by plugin loader at startup)  │   │
│  │  @EventHandler  @EventPublisher  @Permission  @Hook      │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │  Redpanda (Kafka)
                    ┌──────▼──────────┐
                    │   Event Topics   │
                    │  plugin.<id>.*   │
                    └─────────────────┘
```

### Key Concepts

**Plugin Context**
: The `PluginContext` object holds the runtime identity of the current plugin invocation: `pluginId`, `tenantId`, and optionally `workspaceId` and `userId`. All SDK clients are automatically scoped to this context.

**Lifecycle**
: Plugins go through a lifecycle managed by the core API: `REGISTERED → INSTALLING → INSTALLED → ACTIVE → DISABLED → UNINSTALLING → UNINSTALLED`. The `onInstall`, `onActivate`, `onDeactivate`, and `onUninstall` hooks fire at the corresponding transitions.

**Decorators**
: TypeScript decorators (`@EventHandler`, `@EventPublisher`, `@Permission`, `@Hook`) are metadata hints that the Plexica plugin loader reads via `reflect-metadata` to automatically wire event subscriptions, declare permissions, and register workspace hook handlers.

**Multi-tenancy**
: Every plugin instance is scoped to a single tenant. The `tenantId` in `PluginContext` is set at `start()` time. For multi-tenant plugins, create one instance per tenant or update `context.tenantId` per-request.

### File Structure

```
my-plugin/
├── src/
│   ├── my-plugin.ts          # PlexicaPlugin subclass
│   ├── manifest.json         # Plugin manifest
│   └── routes/               # Optional Fastify routes
├── __tests__/
│   └── my-plugin.test.ts     # Unit and integration tests
├── tsconfig.json             # Must include experimentalDecorators
└── package.json
```

---

## Plugin Manifest Reference

The manifest (`manifest.json`) declares your plugin's metadata and capabilities. It is validated by the core API at registration time.

```json
{
  "id": "plugin-crm",
  "name": "CRM Plugin",
  "version": "1.0.0",
  "description": "Customer relationship management for Plexica",
  "category": "productivity",
  "permissions": [
    { "resource": "contacts", "action": "read", "description": "Read contacts" },
    { "resource": "contacts", "action": "write", "description": "Create and update contacts" }
  ],
  "events": {
    "publishes": ["contact-created", "contact-updated", "contact-deleted"],
    "subscribes": ["core.tenant.created", "core.workspace.created"]
  },
  "runtime": {
    "image": "my-org/plugin-crm:1.0.0",
    "port": 4100,
    "env": {
      "DATABASE_URL": { "required": true }
    }
  },
  "frontend": {
    "remoteEntry": "http://localhost:4100/remoteEntry.js",
    "routePrefix": "/crm"
  }
}
```

| Field               | Required | Description                                        |
| ------------------- | -------- | -------------------------------------------------- |
| `id`                | ✅       | Unique plugin identifier (kebab-case)              |
| `name`              | ✅       | Human-readable name                                |
| `version`           | ✅       | Semantic version (e.g. `1.0.0`)                    |
| `description`       | ✅       | Short description                                  |
| `category`          | ✅       | Plugin category (e.g. `productivity`, `analytics`) |
| `permissions`       | ✅       | Array of `{ resource, action, description }`       |
| `events.publishes`  | ❌       | Event names this plugin emits                      |
| `events.subscribes` | ❌       | Event names this plugin listens to                 |
| `runtime`           | ❌       | Container runtime configuration                    |
| `frontend`          | ❌       | Module Federation configuration                    |

---

## PlexicaPlugin Base Class

Extend `PlexicaPlugin` to create a plugin. It wires up all SDK clients automatically.

```typescript
// File: src/my-plugin.ts
import { PlexicaPlugin } from '@plexica/sdk';
import type { PluginContext, ServiceDefinition } from '@plexica/sdk';

export class MyPlugin extends PlexicaPlugin {
  // REQUIRED: declare services this plugin exposes
  getServiceDefinitions(): ServiceDefinition[] {
    return [];
  }

  // OPTIONAL lifecycle hooks:

  async onInstall(context: PluginContext): Promise<void> {
    // Run once when installed for a tenant (e.g. create DB tables)
  }

  async onActivate(context: PluginContext): Promise<void> {
    // Called when plugin transitions to ACTIVE
    // Good place to set up event subscriptions
  }

  async onDeactivate(context: PluginContext): Promise<void> {
    // Called when plugin is disabled — pause background work
  }

  async onUninstall(context: PluginContext): Promise<void> {
    // Called when plugin is removed — clean up all tenant data
  }
}
```

### Available Clients

| Property          | Type                  | Description                                               |
| ----------------- | --------------------- | --------------------------------------------------------- |
| `this.api`        | `ApiClient`           | Typed HTTP client for Core API requests                   |
| `this.events`     | `EventClient \| null` | Publish/subscribe events (null if no EventBus configured) |
| `this.services`   | `ServiceClient`       | Register/discover plugin services                         |
| `this.sharedData` | `SharedDataClient`    | Cross-plugin shared key/value store                       |
| `this.config`     | `PluginConfig`        | Your plugin's configuration                               |

### WorkspaceAwarePlugin

For workspace-scoped plugins, extend `WorkspaceAwarePlugin` instead:

```typescript
import { WorkspaceAwarePlugin } from '@plexica/sdk';

export class MyWorkspacePlugin extends WorkspaceAwarePlugin {
  getServiceDefinitions() {
    return [];
  }

  async onActivate(context: PluginContext): Promise<void> {
    console.log('Active in workspace:', this.workspaceId);
  }
}

// Start with workspace context
await plugin.start('tenant-abc', 'user-123', 'workspace-xyz');
```

---

## Decorators

All decorators require `reflect-metadata` to be imported (once, at the entry point of your plugin):

```typescript
import 'reflect-metadata';
```

And your `tsconfig.json` must have:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### @EventHandler(topic)

**Method decorator.** Marks a method as a handler for the given event topic. The Plexica plugin loader reads this metadata at startup to register the subscription automatically.

Topic naming convention: `plugin.<pluginId>.<eventName>`

```typescript
import { EventHandler } from '@plexica/sdk';

class MyCrmPlugin extends PlexicaPlugin {
  @EventHandler('plugin.crm.contact-created')
  async onContactCreated() {
    // Called when a contact-created event arrives on the topic
  }

  @EventHandler('plugin.crm.contact-deleted')
  async onContactDeleted() {
    // Called when a contact-deleted event arrives
  }
}
```

**Metadata stored**: `Reflect.getMetadata('plexica:event-handler', prototype, methodName)` → topic string.

### @EventPublisher()

**Class decorator.** Marks a class as an event publisher. Signals to the plugin loader that the class will emit events and should have its `EventClient` pre-configured.

```typescript
import { EventPublisher } from '@plexica/sdk';

@EventPublisher()
class MyAnalyticsPlugin extends PlexicaPlugin {
  async recordMetric(name: string, value: number) {
    await this.events?.publish('plugin.analytics.metric-recorded', { name, value });
  }
}
```

**Metadata stored**: `Reflect.getMetadata('plexica:event-publisher', PluginClass)` → `true`.

### @Permission(key, name, description)

**Class decorator.** Declares a permission required by the plugin. Multiple decorators accumulate into an array (bottom-to-top order matches declaration order bottom-up, as TypeScript applies decorators that way).

```typescript
import { Permission } from '@plexica/sdk';

@Permission('contacts:read', 'Read Contacts', 'Allows reading the contacts list')
@Permission('contacts:write', 'Write Contacts', 'Allows creating and updating contacts')
@Permission('contacts:delete', 'Delete Contacts', 'Allows deleting contacts')
class MyCrmPlugin extends PlexicaPlugin {
  // ...
}
```

| Parameter     | Type     | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `key`         | `string` | Machine-readable permission key (e.g. `contacts:read`) |
| `name`        | `string` | Human-readable name shown in admin UI                  |
| `description` | `string` | What this permission allows                            |

**Metadata stored**: `Reflect.getMetadata('plexica:permissions', PluginClass)` → `PermissionMetadata[]`.

### @Hook(type)

**Method decorator.** Registers a method as a workspace lifecycle hook handler. Available hook types:

| Type            | When it fires                 | Notes                                     |
| --------------- | ----------------------------- | ----------------------------------------- |
| `before_create` | Before a workspace is created | Sequential; can throw to prevent creation |
| `created`       | After workspace is created    | Parallel fire-and-forget; timeout 5s      |
| `before_delete` | Before a workspace is deleted | Sequential; can throw to prevent deletion |
| `deleted`       | After workspace is deleted    | Parallel fire-and-forget; timeout 5s      |

```typescript
import { Hook } from '@plexica/sdk';
import type { WorkspaceHookType } from '@plexica/sdk';

class MyPlugin extends WorkspaceAwarePlugin {
  @Hook('before_create')
  async validateWorkspace(context: PluginContext) {
    // Validate workspace creation; throw Error to abort
    if (!context.tenantId) {
      throw new Error('Cannot create workspace without tenant context');
    }
  }

  @Hook('created')
  async onWorkspaceCreated(context: PluginContext) {
    // Initialize plugin data for the new workspace (fail-open: errors are logged, not propagated)
    await this.sharedData.set('initialized', true, { ttl: 0 });
  }

  @Hook('deleted')
  async cleanupWorkspace(context: PluginContext) {
    await this.sharedData.delete('initialized');
  }
}
```

**Metadata stored**: `Reflect.getMetadata('plexica:hook', prototype, methodName)` → `WorkspaceHookType`.

---

## Event System

The event system uses Redpanda (Kafka-compatible) topics, managed via `@plexica/event-bus`.

### Publishing events

```typescript
// Via EventClient (recommended)
await this.events?.publish('plugin.crm.contact-created', {
  contactId: 'c-123',
  tenantId: context.tenantId,
});

// With options
await this.events?.publish(
  'plugin.crm.contact-updated',
  { contactId: 'c-123', changes: { email: 'new@example.com' } },
  {
    workspaceId: 'ws-456',
    correlationId: 'req-789', // for distributed tracing
    causationId: 'evt-001', // the event that triggered this one
  }
);
```

### Subscribing to events

```typescript
async onActivate(context: PluginContext) {
  // Subscribe to own events
  await this.events?.subscribe('contact-created', async (event) => {
    console.log('Contact created:', event.data);
  });

  // Subscribe to core platform events
  await this.events?.subscribe('core.tenant.created', async (event) => {
    await this.setupTenantDefaults(event.data);
  }, { coreEvent: true });

  // Subscribe to another plugin's events
  await this.events?.subscribe('deal-closed', async (event) => {
    await this.syncContact(event.data);
  }, { pluginId: 'plugin-sales' });
}
```

### Topic naming convention

| Event type                | Topic pattern                   | Example                        |
| ------------------------- | ------------------------------- | ------------------------------ |
| Plugin publishes          | `plugin.<pluginId>.<eventName>` | `plugin.crm.contact-created`   |
| Core platform events      | `core.<domain>.<eventName>`     | `core.tenant.created`          |
| Cross-plugin subscription | Use `pluginId` option           | `{ pluginId: 'plugin-sales' }` |

---

## Permission System

Permissions are declared in two places:

1. **Manifest** (`manifest.json`) — at registration time, defines the `{ resource, action, description }` tuples sent to the core API.
2. **Decorator** (`@Permission`) — at class level, metadata for the plugin loader to validate at startup.

```typescript
// Manifest permissions use { resource, action }
// Decorator permissions use { key, name, description }
// Both are validated — they should align in intent.

@Permission('contacts:read', 'Read Contacts', 'Read-only access to the contacts database')
class MyCrmPlugin extends PlexicaPlugin {}
```

To read the permissions metadata at runtime:

```typescript
import { METADATA_KEY_PERMISSIONS } from '@plexica/sdk';
import type { PermissionMetadata } from '@plexica/sdk';

const perms: PermissionMetadata[] = Reflect.getMetadata(METADATA_KEY_PERMISSIONS, MyCrmPlugin);
// [{ key: 'contacts:read', name: 'Read Contacts', description: '...' }]
```

---

## Hook System

Workspace lifecycle hooks allow plugins to react to (or prevent) workspace creation and deletion.

### Hook execution model

```
Workspace create request
        │
        ▼
  before_create hooks (sequential, can abort)
        │
        ▼ (if no hook threw)
  Workspace created in DB
        │
        ▼
  created hooks (parallel, fire-and-forget, 5s timeout)
```

### Reading hook metadata at runtime

```typescript
import { METADATA_KEY_HOOK } from '@plexica/sdk';
import type { WorkspaceHookType } from '@plexica/sdk';

// Discover all hooked methods on a plugin class
const proto = MyPlugin.prototype;
const methods = Object.getOwnPropertyNames(proto);
const hooks = methods.filter((m) => {
  const type: WorkspaceHookType | undefined = Reflect.getMetadata(METADATA_KEY_HOOK, proto, m);
  return type !== undefined;
});
```

---

## API Client

The `ApiClient` makes authenticated HTTP calls to the Core API and other plugin backends.

```typescript
// GET request
const response = await this.api.get<{ contacts: Contact[] }>('/api/v1/contacts', {
  params: { tenantId: context.tenantId, limit: 50 },
});

if (response.success && response.data) {
  const { contacts } = response.data;
}

// POST request
const created = await this.api.post<Contact>('/api/v1/contacts', {
  body: { name: 'Alice', email: 'alice@example.com' },
});

// Plugin-to-plugin call
const result = await this.api.callPlugin({
  targetPluginId: 'plugin-analytics',
  serviceName: 'analytics.reports',
  method: 'GET',
  path: '/reports/summary',
  params: { period: 'monthly' },
});
```

---

## Service Registration

Plugins can expose HTTP services that other plugins can discover via the service registry.

```typescript
getServiceDefinitions(): ServiceDefinition[] {
  return [
    {
      name: 'crm.contacts',
      version: '1.0.0',
      baseUrl: `http://localhost:${this.config.port ?? 4100}`,
      description: 'Contact management service',
      endpoints: [
        { method: 'GET',    path: '/contacts',     description: 'List contacts' },
        { method: 'POST',   path: '/contacts',     description: 'Create contact' },
        { method: 'GET',    path: '/contacts/:id', description: 'Get contact by ID' },
        { method: 'PUT',    path: '/contacts/:id', description: 'Update contact' },
        { method: 'DELETE', path: '/contacts/:id', description: 'Delete contact' },
      ],
    },
  ];
}
```

Services are registered automatically on `plugin.start()` and deregistered on `plugin.stop()`.

---

## Shared Data

The `SharedDataClient` provides a cross-plugin key/value store scoped to a tenant.

```typescript
// Set shared data
await this.sharedData.set('onboarding-complete', true, {
  ttl: 86400, // expires in 24 hours (seconds)
  isPublic: true, // other plugins can read this
});

// Get shared data
const entry = await this.sharedData.get<boolean>('onboarding-complete');
if (entry?.value === true) {
  // onboarding done
}

// Get data from another plugin
const partnerData = await this.sharedData.getFromPlugin<string>('plugin-analytics', 'report-url');

// Delete data
await this.sharedData.delete('onboarding-complete');
```

---

## Testing Guide

### Unit testing decorators

```typescript
// File: __tests__/my-plugin.test.ts
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import {
  METADATA_KEY_EVENT_HANDLER,
  METADATA_KEY_EVENT_PUBLISHER,
  METADATA_KEY_PERMISSIONS,
  METADATA_KEY_HOOK,
} from '@plexica/sdk';
import { MyCrmPlugin } from '../src/my-plugin';

describe('MyCrmPlugin decorators', () => {
  it('should be marked as an event publisher', () => {
    expect(Reflect.getMetadata(METADATA_KEY_EVENT_PUBLISHER, MyCrmPlugin)).toBe(true);
  });

  it('should declare read permission', () => {
    const perms = Reflect.getMetadata(METADATA_KEY_PERMISSIONS, MyCrmPlugin);
    expect(perms.some((p: any) => p.key === 'contacts:read')).toBe(true);
  });

  it('should handle contact-created events', () => {
    const topic = Reflect.getMetadata(
      METADATA_KEY_EVENT_HANDLER,
      MyCrmPlugin.prototype,
      'onContactCreated'
    );
    expect(topic).toBe('plugin.crm.contact-created');
  });
});
```

### Unit testing lifecycle hooks

```typescript
import { vi } from 'vitest';

describe('MyCrmPlugin lifecycle', () => {
  it('should subscribe to events on activate', async () => {
    const mockSubscribe = vi.fn().mockResolvedValue('sub-1');
    const mockEvents = { subscribe: mockSubscribe, unsubscribeAll: vi.fn() };

    const plugin = new MyCrmPlugin({
      pluginId: 'plugin-crm',
      name: 'CRM',
      version: '1.0.0',
      apiBaseUrl: 'http://localhost:4000',
    });
    (plugin as any).events = mockEvents;
    (plugin as any).services = {
      registerServices: vi.fn().mockResolvedValue({ success: true }),
      deregisterAllServices: vi.fn(),
    };

    await plugin.start('tenant-abc');

    expect(mockSubscribe).toHaveBeenCalledWith('core.tenant.created', expect.any(Function), {
      coreEvent: true,
    });
  });
});
```

### Testing with vitest

```bash
# Run all SDK tests
pnpm test

# Watch mode during TDD
pnpm test:watch

# Coverage report
pnpm test:coverage
```

---

## Troubleshooting

### Issue 1: `Reflect.getMetadata is not a function`

**Symptoms**:

```
TypeError: Reflect.getMetadata is not a function
```

**Root Cause**: `reflect-metadata` polyfill is not imported.

**Solution**:

```typescript
// Add this import ONCE at the top of your plugin entry point
import 'reflect-metadata';
```

**Prevention**: Always import `reflect-metadata` before any decorator-using code.

### Issue 2: Decorators are silently not working

**Symptoms**: Metadata reads return `undefined` even when decorators are applied.

**Root Cause**: `experimentalDecorators` or `emitDecoratorMetadata` not set in `tsconfig.json`.

**Solution**:

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

**Verification**:

```typescript
const topic = Reflect.getMetadata('plexica:event-handler', MyPlugin.prototype, 'myMethod');
console.log(topic); // Should print the topic string, not undefined
```

### Issue 3: `this.events` is `null`

**Symptoms**: `this.events?.publish(...)` does nothing.

**Root Cause**: No `EventBusService` was passed to the `PlexicaPlugin` constructor.

**Solution**:

```typescript
import { KafkaEventBusService } from '@plexica/event-bus';

const eventBus = new KafkaEventBusService({ brokers: ['localhost:9092'] });
const plugin = new MyPlugin(config, eventBus);
```

### Issue 4: Event handler decorator not being invoked at runtime

**Symptoms**: `@EventHandler` is declared but the handler method never fires.

**Root Cause**: The decorator only stores metadata. It does **not** automatically subscribe — that wiring is done by the Plexica plugin loader. In your own tests, you must wire it manually or use the `onActivate` hook instead.

**Solution for testing**:

```typescript
// Either use onActivate for explicit subscriptions:
async onActivate(context: PluginContext) {
  await this.events?.subscribe('plugin.crm.contact-created', this.onContactCreated.bind(this));
}

// Or use the plugin loader in integration tests (which reads the decorator metadata).
```

### Still Having Issues?

1. Check the [Common Mistakes](#common-mistakes-summary) section below
2. Search [GitHub Issues](https://github.com/plexica/plexica/issues)
3. Ask in [Discussions](https://github.com/plexica/plexica/discussions)

---

## Common Mistakes Summary

❌ **Forgetting `import 'reflect-metadata'`**

- Why it fails: Metadata API is not available without the polyfill
- ✅ Correct: Add `import 'reflect-metadata'` at the top of your entry point

❌ **Not adding `experimentalDecorators: true` to tsconfig**

- Why it fails: TypeScript rejects decorator syntax at compile time
- ✅ Correct: Add both `experimentalDecorators` and `emitDecoratorMetadata` to `compilerOptions`

❌ **Expecting `@EventHandler` to auto-subscribe without a plugin loader**

- Why it fails: Decorators are metadata only — the loader does the wiring
- ✅ Correct: Use `onActivate` for explicit subscriptions in standalone plugins; use the loader for decorator-driven wiring

❌ **Stacking `@Permission` decorators in the wrong order**

- Note: TypeScript applies class decorators bottom-to-top. If order matters, be aware that the last declared decorator runs first.

---

## See Also

- [Security Guidelines](./SECURITY.md) — Authentication, authorization, SQL injection prevention
- [Plugin System Architecture](../specs/TECHNICAL_SPECIFICATIONS.md) — Core API plugin endpoints
- [Event Bus Documentation](../packages/event-bus/README.md) — Kafka/Redpanda event system
- [ADR-018: Plugin Lifecycle Status](../.forge/knowledge/adr/adr-018-plugin-lifecycle-status.md) — Lifecycle state machine
- [ADR-019: Pluggable Container Adapter](../.forge/knowledge/adr/adr-019-pluggable-container-adapter.md) — Container runtime

## Support

- 📖 [Full Documentation](https://docs.plexica.io)
- 🐛 [Report Issues](https://github.com/plexica/plexica/issues)
- 💬 [Discussions](https://github.com/plexica/plexica/discussions)
- 🔒 [Security Report](./SECURITY.md#reporting)
