# Plugin Development Guide

**Last Updated**: March 8, 2026
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

## Frontend Layout Engine

Plexica's **Frontend Layout Engine** (Spec 014) lets tenant admins configure how forms and tables appear for each role — without any code changes. Plugins declare their forms via `formSchemas` in the plugin manifest; admins customize visibility, ordering, and read-only rules per role; end users see their personalized layout automatically.

### Declaring Form Schemas in the Manifest

Add an optional `formSchemas` array to your plugin's TypeScript manifest:

```typescript
// apps/plugin-crm/src/manifest.ts
import type { PluginManifest } from '@plexica/types';

export const manifest: PluginManifest = {
  id: 'plugin-crm',
  name: 'CRM',
  version: '1.0.0',
  // ... routes, menus, etc.

  formSchemas: [
    {
      formId: 'crm.contact-edit',
      label: 'Contact Edit Form',
      sections: [
        { sectionId: 'basic', label: 'Basic Info', order: 0 },
        { sectionId: 'address', label: 'Address', order: 1 },
      ],
      fields: [
        {
          fieldId: 'first-name',
          label: 'First Name',
          type: 'text',
          required: true,
          defaultValue: '',
          sectionId: 'basic',
          order: 0,
        },
        {
          fieldId: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          defaultValue: '',
          sectionId: 'basic',
          order: 1,
        },
        {
          fieldId: 'phone',
          label: 'Phone',
          type: 'text',
          required: false,
          defaultValue: null,
          sectionId: 'basic',
          order: 2,
        },
      ],
      columns: [
        { columnId: 'name', label: 'Name', order: 0 },
        { columnId: 'email', label: 'Email', order: 1 },
        { columnId: 'status', label: 'Status', order: 2 },
      ],
    },
  ],
};
```

**Field types**: `text`, `email`, `tel`, `date`, `datetime`, `number`, `select`, `multiselect`, `checkbox`, `textarea`, `url`

**`formId` convention**: Use `<plugin-id>.<form-slug>` (e.g., `crm.contact-edit`, `crm.contacts-table`). Must be unique across all plugins.

### Layout-Aware UI Components

Use the shell-level components from `@plexica/ui` (via Module Federation) to automatically apply the resolved layout. No direct API calls needed.

#### `<LayoutAwareForm>`

Wraps a form and applies field ordering, visibility, and read-only rules for the current user:

```tsx
// apps/plugin-crm/src/pages/ContactEdit.tsx
import { LayoutAwareForm } from '@plexica/ui';

export function ContactEditPage({ contactId }: { contactId: string }) {
  return (
    <LayoutAwareForm formId="crm.contact-edit">
      {({ isFieldVisible, isFieldReadonly, fieldOrder }) => (
        <form>
          {fieldOrder.map((fieldId) => {
            if (!isFieldVisible(fieldId)) return null;
            return <input key={fieldId} name={fieldId} readOnly={isFieldReadonly(fieldId)} />;
          })}
        </form>
      )}
    </LayoutAwareForm>
  );
}
```

Or use element-matching mode (matches `data-field-id` props automatically):

```tsx
<LayoutAwareForm formId="crm.contact-edit">
  <input data-field-id="first-name" name="first-name" />
  <input data-field-id="email" name="email" />
  <input data-field-id="phone" name="phone" />
  {/* Fields hidden by layout config are automatically omitted */}
</LayoutAwareForm>
```

#### `<LayoutAwareTable>`

Wraps a `<DataTable>` and filters/reorders columns according to the resolved layout:

```tsx
// apps/plugin-crm/src/pages/ContactList.tsx
import { LayoutAwareTable } from '@plexica/ui';
import type { ColumnDef } from '@tanstack/react-table';

const columns: ColumnDef<Contact>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status' },
];

export function ContactListPage({ contacts }: { contacts: Contact[] }) {
  return (
    <LayoutAwareTable
      formId="crm.contacts-table"
      columns={columns}
      data={contacts}
      aria-label="Contacts list"
    />
  );
}
```

Hidden columns are filtered out and column order follows the admin configuration. If no layout config is saved, all columns are shown in manifest-default order (fail-open).

#### `useResolvedLayout` hook

For full control, use the hook directly:

```tsx
import { useResolvedLayout } from '@/hooks/useResolvedLayout';
import type { ResolvedLayout } from '@plexica/types';

function MyComponent() {
  const { data: layout, isLoading } = useResolvedLayout('crm.contact-edit');

  if (isLoading) return <Skeleton />;
  if (!layout) return <MyFormWithDefaults />; // fail-open

  return (
    <MyForm
      visibleFields={layout.fields.filter((f) => f.visibility !== 'hidden')}
      readonlyFields={layout.fields.filter((f) => f.visibility === 'readonly')}
    />
  );
}
```

**Cache behavior**: resolved layouts are cached by React Query with `staleTime: 60_000` (1 minute). The backend caches in Redis with a 300s TTL. Cache is invalidated automatically when the tenant admin saves a new config.

### Server-Side Read-Only Enforcement

> **Security note**: Client-side read-only rendering is cosmetic only. The server enforces
> read-only rules on form submissions via the `layout-readonly-guard.ts` middleware.
> See [SECURITY.md — Layout Engine Read-Only Enforcement](./SECURITY.md#layout-engine-read-only-enforcement).

When a user submits a form where a field is marked `readonly` in their resolved layout, the `layoutReadonlyGuard` middleware strips that field's value from the request body **before** the route handler runs. The existing database value is preserved.

Register the guard on your plugin route:

```typescript
// In your plugin backend route registration
import { layoutReadonlyGuard } from '@plexica/sdk';

fastify.put(
  '/api/v1/crm/contacts/:id',
  { preHandler: [authMiddleware, layoutReadonlyGuard({ formId: 'crm.contact-edit' })] },
  async (request, reply) => {
    // request.body will NOT contain values for readonly fields
    await contactService.update(request.params.id, request.body);
    return reply.send({ ok: true });
  }
);
```

The guard **fails closed by default** on Redis/DB errors — it returns `503 LAYOUT_RESOLUTION_UNAVAILABLE` to prevent write operations from silently bypassing read-only enforcement. To opt out for advisory-only fields, pass `{ failOpen: true }` when registering the guard:

```typescript
fastify.put(
  '/api/v1/crm/contacts/:id/advisory-note',
  {
    preHandler: [
      authMiddleware,
      layoutReadonlyGuard({ formId: 'crm.contact-edit', failOpen: true }),
    ],
  },
  async (request, reply) => {
    // If Redis/DB are unavailable, request proceeds (advisory mode)
    await contactService.updateAdvisory(request.params.id, request.body);
    return reply.send({ ok: true });
  }
);
```

If validation fails because a `PUT` body references field or column IDs not present in the plugin manifest, the API returns `400 INVALID_FIELD_REFERENCE` with details of the invalid references.

### Feature Flag

The layout engine is gated by the `layout_engine_enabled` per-tenant feature flag. When disabled:

- The admin configuration panel is hidden
- The resolved endpoint returns manifest defaults
- `<LayoutAwareForm>` and `<LayoutAwareTable>` use manifest defaults

No error is shown to end users when the flag is off.

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

## Exposing Widgets

Widgets are self-contained React components that plugins expose via Module Federation so the host shell can embed them anywhere on the page — outside the plugin's own route tree.

### What is a Widget?

A widget is a small, focused UI component with:

- **Serializable props only** — no function props, no React nodes; only primitives, objects, and arrays that can be safely serialized across Module Federation boundaries
- **Self-contained data fetching** — the widget fetches its own data (e.g. via `useQuery`)
- **Semantic Tailwind tokens** — uses `bg-card`, `text-muted-foreground`, etc., so it automatically inherits the tenant theme

### Step 1: Create the widget component

```tsx
// apps/plugin-crm/src/widgets/ContactCard.tsx
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export interface ContactCardProps {
  contactId: string;
}

export function ContactCard({ contactId }: ContactCardProps) {
  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: () => axios.get(`/api/v1/crm/contacts/${contactId}`).then((r) => r.data),
  });

  if (isLoading) return <div className="animate-pulse bg-muted rounded h-16" />;

  return (
    <div className="bg-card border rounded-lg p-4">
      <h3 className="text-card-foreground font-semibold">{contact.name}</h3>
      <p className="text-muted-foreground text-sm">{contact.email}</p>
    </div>
  );
}

export default ContactCard;
```

### Step 2: Expose the widget in `vite.config.ts`

Add the widget to the `exposes` map in your plugin's `vite.config.ts`:

```ts
// apps/plugin-crm/vite.config.ts
federation({
  name: 'plugin_crm',
  filename: 'remoteEntry.js',
  exposes: {
    './Plugin': './src/Plugin.tsx',
    './routes': './src/routes/index.ts',
    './manifest': './src/manifest.ts',
    // Widgets:
    './ContactCard': './src/widgets/ContactCard.tsx',
  },
  // ...
});
```

The expose key must start with `./` and should match the widget component name.

### Step 3: Embed the widget in the host shell

Use the `<WidgetLoader>` component (or the lower-level `loadWidget()` utility) from `apps/web`:

```tsx
import { WidgetLoader } from '@/components/WidgetLoader';

// Renders ContactCard from the CRM plugin, forwarding contactId as a prop
<WidgetLoader
  pluginId="plugin_crm"
  widgetName="ContactCard"
  props={{ contactId: 'contact-123' }}
/>;
```

Or use the higher-level `<WidgetContainer>` for a titled, feature-flagged section:

```tsx
import { WidgetContainer } from '@/components/WidgetContainer';

<WidgetContainer
  pluginId="plugin_crm"
  widgetName="ContactCard"
  widgetProps={{ contactId: 'contact-123' }}
  title="Contact Details"
/>;
```

`WidgetContainer` is gated by the `ENABLE_PLUGIN_WIDGETS` feature flag — it renders nothing when the flag is off.

### Fallback behaviour

If the widget cannot be loaded (network error, plugin not registered, etc.) the system degrades gracefully:

- `<WidgetLoader>` renders a dashed-border "Widget Unavailable" placeholder
- `<WidgetContainer>` renders a destructive-styled error message with the widget title

No error is surfaced to the user beyond these placeholders; errors are logged via the Pino logger.

### Widget contract

| Rule               | Detail                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| Default export     | Widget file must have a `default` export of the component                |
| Serializable props | No function props, no React node props                                   |
| Tenant theme       | Use Tailwind semantic tokens (`bg-card`, `text-muted-foreground`, ...)   |
| Error handling     | Handle loading and error states internally; never throw to parent        |
| QueryClient        | The host provides `QueryClientProvider`; widgets use `useQuery` normally |

---

_Last updated: March 8, 2026_
