# Plugin Development Guide

**Last Updated**: February 10, 2026
**Status**: Active
**Owner**: Engineering Team
**Document Type**: Index / Landing Page

---

## Getting Started

New to Plexica plugin development? Start here:

| Guide                                                   | Description                                                          | Time      |
| ------------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| **[Quick Start](./guides/PLUGIN_QUICK_START.md)**       | Copy template, configure, build, run                                 | ~15 min   |
| **[Frontend Guide](./guides/PLUGIN_FRONTEND_GUIDE.md)** | UI components, routes, menus, theming with `@plexica/ui`             | Reference |
| **[Backend Guide](./guides/PLUGIN_BACKEND_GUIDE.md)**   | Fastify server, REST endpoints, tenant context, service registration | Reference |

---

## Architecture

Plexica plugins have two halves:

- **Frontend** — A standalone React app loaded at runtime via Module Federation (`remoteEntry.js`). The host app (`apps/web`) dynamically loads plugin UI and registers routes/menus.
- **Backend** — A standalone Fastify server that exposes REST endpoints, registers with the plugin gateway, and communicates via HTTP and events.

```
Host App (apps/web)              Core API (:4000)
 ┌──────────────┐                 ┌──────────────────┐
 │ Plugin Loader │──federation──▶ │ Plugin Gateway    │──proxy──▶ Plugin Backends
 │ Routes/Menus  │                │ Service Registry  │           (:3100, :3200, ...)
 └──────────────┘                 └──────────────────┘
       │                                   │
       ▼                                   ▼
  CDN / MinIO                        Event Bus (Kafka)
  remoteEntry.js                     Pub/Sub events
```

---

## Using Core Services

**⚠️ Status**: Core Services are **not yet implemented** (0% complete). This section describes the planned API usage patterns for when these services become available.

Plexica provides four shared services that plugins can use instead of implementing their own infrastructure:

| Service                  | Purpose                                  | Status             | API Docs                                                           |
| ------------------------ | ---------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| **Storage Service**      | File upload/download/signed URLs (MinIO) | ❌ Not Implemented | [`docs/CORE_SERVICES.md`](./CORE_SERVICES.md#storage-service)      |
| **Notification Service** | Email, push, in-app notifications        | ❌ Not Implemented | [`docs/CORE_SERVICES.md`](./CORE_SERVICES.md#notification-service) |
| **Job Queue Service**    | Async jobs, cron scheduling, retry logic | ❌ Not Implemented | [`docs/CORE_SERVICES.md`](./CORE_SERVICES.md#job-queue-service)    |
| **Search Service**       | Full-text search, facets, autocomplete   | ❌ Not Implemented | [`docs/CORE_SERVICES.md`](./CORE_SERVICES.md#search-service)       |

### Example: Storage Service (Planned)

When the Storage Service is implemented, plugins will be able to use it like this:

```typescript
// In your plugin backend
import { StorageServiceClient } from '@plexica/sdk';

const storageService = new StorageServiceClient({
  tenantId: req.tenantId,
  apiUrl: process.env.CORE_API_URL,
});

// Upload a file
const fileInfo = await storageService.upload({
  file: buffer,
  path: 'contacts/avatars/john-doe.jpg',
  contentType: 'image/jpeg',
  metadata: {
    uploadedBy: req.userId,
    contactId: 'contact-123',
  },
});

// Generate signed URL for temporary access
const signedUrl = await storageService.getSignedUrl({
  path: 'contacts/avatars/john-doe.jpg',
  expiresIn: 3600, // 1 hour
});

// List files in a directory
const files = await storageService.list({
  prefix: 'contacts/avatars/',
  limit: 100,
});
```

### Example: Notification Service (Planned)

```typescript
import { NotificationServiceClient } from '@plexica/sdk';

const notificationService = new NotificationServiceClient({
  tenantId: req.tenantId,
  apiUrl: process.env.CORE_API_URL,
});

// Send email notification
await notificationService.sendEmail({
  to: 'user@example.com',
  templateId: 'crm-contact-created',
  data: {
    contactName: 'John Doe',
    createdBy: req.user.name,
  },
});

// Send in-app notification
await notificationService.sendInApp({
  userId: 'user-456',
  title: 'New contact added',
  message: 'John Doe was added to your CRM',
  category: 'crm',
  actionUrl: '/crm/contacts/123',
});
```

### Example: Job Queue Service (Planned)

```typescript
import { JobQueueServiceClient } from '@plexica/sdk';

const jobQueueService = new JobQueueServiceClient({
  tenantId: req.tenantId,
  apiUrl: process.env.CORE_API_URL,
});

// Enqueue an async job
const jobId = await jobQueueService.enqueue({
  type: 'crm.export-contacts',
  payload: {
    format: 'csv',
    filters: { status: 'active' },
  },
  options: {
    priority: 'high',
    retries: 3,
    timeout: 300000, // 5 minutes
  },
});

// Schedule a cron job
await jobQueueService.schedule({
  type: 'crm.cleanup-old-contacts',
  cronExpression: '0 2 * * *', // Daily at 2 AM
  payload: { olderThan: 365 },
});
```

### Example: Search Service (Planned)

```typescript
import { SearchServiceClient } from '@plexica/sdk';

const searchService = new SearchServiceClient({
  tenantId: req.tenantId,
  apiUrl: process.env.CORE_API_URL,
});

// Index a document
await searchService.index({
  index: 'crm-contacts',
  documentId: 'contact-123',
  document: {
    name: 'John Doe',
    email: 'john@example.com',
    company: 'Acme Corp',
    tags: ['customer', 'vip'],
  },
});

// Search with filters
const results = await searchService.search({
  index: 'crm-contacts',
  query: 'john',
  filters: {
    tags: ['customer'],
  },
  facets: ['company', 'tags'],
  page: 1,
  pageSize: 20,
});

// Autocomplete
const suggestions = await searchService.autocomplete({
  index: 'crm-contacts',
  field: 'name',
  query: 'joh',
  limit: 10,
});
```

**For complete API specifications**, see [`docs/CORE_SERVICES.md`](./CORE_SERVICES.md).

**Implementation Timeline**:

- Q2 2026: Storage Service and Notification Service
- Q3 2026: Job Queue Service and Search Service

---

## Advanced Topics

| Guide                                                                | Description                                                                      |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **[Plugin-to-Plugin Communication](./guides/plugin-development.md)** | Service discovery, calling other plugin APIs, shared data, dependency management |
| **[Plugin Migration Guide](./guides/plugin-migration.md)**           | Migrating from legacy hooks to M2.1+ decorator-based events                      |

---

## Reference Plugins

| Plugin               | Location                         | What it demonstrates                                                         |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| **Plugin Template**  | `apps/plugin-template-frontend/` | Starting point — `@plexica/ui` components, routes, manifest                  |
| **CRM Plugin**       | `apps/plugin-crm/`               | Full-stack: frontend dashboard + backend CRUD (contacts, deals)              |
| **Analytics Plugin** | `apps/plugin-analytics/`         | Plugin-to-plugin communication — calls CRM APIs to generate reports          |
| **Sample Analytics** | `plugins/sample-analytics/`      | Complete `plugin.json` manifest example with all config/hook/endpoint fields |

---

## Key Concepts

### Plugin Manifest

Every plugin declares its capabilities in a **manifest**:

- **Frontend manifest** (`src/manifest.ts`) — routes, menu items, icon, version. Type: `PluginManifest` from `@plexica/types`.
- **Backend manifest** (`plugin.json`) — config fields, permissions, hooks, endpoints, API services. Type: `PluginManifest` from `apps/core-api/src/types/plugin.types.ts`.

### Shared Dependencies (Module Federation)

Plugins share `react`, `react-dom`, `react-router-dom`, `@plexica/ui`, and `@plexica/types` with the host. These are **not** bundled into the plugin — the host provides them at runtime, ensuring consistent versions and smaller plugin bundles.

### Tenant Isolation

All plugin data access must be scoped by tenant. The backend receives `X-Tenant-ID` via headers; the frontend receives `tenantId` via component props.

---

## Specifications & Architecture

For system design and specifications:

- [Technical Specifications — Plugin System](../specs/TECHNICAL_SPECIFICATIONS.md#6-plugin-system)
- [Functional Specifications — Plugin System](../specs/FUNCTIONAL_SPECIFICATIONS.md#7-plugin-system)
- [Plugin Ecosystem Architecture](../specs/PLUGIN_ECOSYSTEM_ARCHITECTURE.md)
- [Plugin Communication API](../specs/PLUGIN_COMMUNICATION_API.md)
- [Plugin Strategy](../specs/PLUGIN_STRATEGY.md)
- [CRM + Analytics Integration Example](../specs/EXAMPLES_CRM_ANALYTICS_INTEGRATION.md)

---

## CLI Commands

```bash
plexica build     # Build plugin for production (remoteEntry.js + assets)
plexica publish   # Upload to MinIO CDN
plexica init      # Scaffold new plugin (not yet implemented — use cp -r)
```

---

_Last updated: February 2026_
