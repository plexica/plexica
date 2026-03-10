# @plexica/sdk

Plexica Plugin SDK — utilities, base classes, and types for building Plexica plugins.

**Last Updated**: March 8, 2026

---

## Installation

```bash
pnpm add @plexica/sdk
```

The SDK is available to plugin backend services. Plugin frontends use Module Federation to access host-provided components from `@plexica/ui` and `@plexica/types` directly.

---

## Quick Start

```typescript
import { PlexicaPlugin } from '@plexica/sdk';

const plugin = new PlexicaPlugin({
  pluginId: 'plugin-crm',
  name: 'CRM Plugin',
  version: '1.0.0',
  apiBaseUrl: process.env.CORE_API_URL!,
  eventBusBrokers: [process.env.KAFKA_BROKER!],
  port: 3100,
});

await plugin.start();
```

---

## Core Classes

### `PlexicaPlugin`

Base class for all Plexica plugins. Handles lifecycle, API client initialization, and event bus connection.

```typescript
import { PlexicaPlugin } from '@plexica/sdk';

class CrmPlugin extends PlexicaPlugin {
  async onStart() {
    // Register your Fastify routes here
    this.server.get('/api/v1/crm/contacts', async (req, reply) => {
      const { tenantId } = req.tenantContext;
      const contacts = await db.contact.findMany({ where: { tenantId } });
      return reply.send({ contacts });
    });
  }
}
```

### `WorkspaceAwarePlugin`

Extends `PlexicaPlugin` with workspace-scoped helpers.

### `ApiClient`

HTTP client pre-configured with tenant context for calling the Plexica Core API.

```typescript
import { ApiClient } from '@plexica/sdk';

const api = new ApiClient({
  baseUrl: process.env.CORE_API_URL!,
  tenantId: context.tenantId,
  accessToken: context.accessToken,
});

const tenant = await api.get('/api/v1/tenants/current');
```

### `EventClient`

Kafka-backed event bus client for publishing and subscribing to domain events.

```typescript
import { EventClient } from '@plexica/sdk';

const events = new EventClient({
  brokers: [process.env.KAFKA_BROKER!],
  clientId: 'plugin-crm',
});

// Publish
await events.publish({
  topic: 'crm.contact.created',
  key: contact.id,
  payload: { contactId: contact.id, tenantId },
});

// Subscribe
events.subscribe('crm.contact.created', async (event) => {
  console.log('Contact created:', event.payload.contactId);
});
```

### `SharedDataClient`

Cross-plugin key/value store for sharing data between plugins within a tenant.

```typescript
import { SharedDataClient } from '@plexica/sdk';

const sharedData = new SharedDataClient({ apiBaseUrl, tenantId });

await sharedData.set('crm.last-sync', { timestamp: Date.now() });
const value = await sharedData.get('crm.last-sync');
```

---

## Form Schemas — Frontend Layout Engine (Spec 014)

Plugins declare configurable forms via `formSchemas` in the plugin manifest. This enables tenant admins to customize field visibility, ordering, and read-only rules per role through the admin panel — without code changes.

### TypeScript Types

All form schema types are exported from `@plexica/types`:

```typescript
import type {
  FormSchema,
  ManifestField,
  ManifestSection,
  ManifestColumn,
  FieldOverride,
  ColumnOverride,
  SectionOverride,
  LayoutConfig,
  ResolvedLayout,
  ResolvedField,
  ResolvedColumn,
  ResolvedSection,
  RoleKey,
  FieldVisibility,
  ColumnVisibility,
  SaveLayoutConfigInput,
  ConfigurableFormSummary,
} from '@plexica/types';
```

### `FormSchema`

Declared in the plugin manifest under `formSchemas`. Describes one configurable form or table view.

```typescript
interface FormSchema {
  /** Unique form identifier across the platform. Convention: "<plugin-id>.<form-slug>" */
  formId: string;
  /** Human-readable label shown in the admin panel. */
  label: string;
  sections: ManifestSection[];
  fields: ManifestField[];
  columns: ManifestColumn[];
}
```

### `ManifestField`

A single configurable field in a form:

```typescript
interface ManifestField {
  fieldId: string; // Unique within the form. kebab-case or snake_case.
  label: string; // Human-readable label (shown in admin panel).
  type: string; // e.g. "text", "email", "date", "select"
  required: boolean; // Whether the field is required for form submission.
  defaultValue: unknown; // Value injected when the field is hidden (FR-010).
  sectionId: string; // References ManifestSection.sectionId.
  order: number; // Default render order (0-based).
}
```

**Supported field types**: `text`, `email`, `tel`, `date`, `datetime`, `number`, `select`, `multiselect`, `checkbox`, `textarea`, `url`

### `ManifestSection`

A section grouping fields within a form:

```typescript
interface ManifestSection {
  sectionId: string; // Unique within the form.
  label: string; // Human-readable label.
  order: number; // Default render order (0-based).
}
```

### `ManifestColumn`

A configurable table column:

```typescript
interface ManifestColumn {
  columnId: string; // Must match the column's accessorKey in the DataTable definition.
  label: string; // Human-readable header label.
  order: number; // Default render order (0-based).
}
```

### `RoleKey`

The 7 roles supported by the layout engine (ADR-024):

```typescript
type RoleKey =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'TENANT_MEMBER'
  | 'OWNER' // workspace owner
  | 'ADMIN' // workspace admin
  | 'MEMBER' // workspace member
  | 'VIEWER'; // workspace viewer
```

### `FieldVisibility` / `ColumnVisibility`

```typescript
type FieldVisibility = 'visible' | 'hidden' | 'readonly';
type ColumnVisibility = 'visible' | 'hidden';
```

### `ResolvedLayout`

The shape returned by `GET /api/v1/layout-configs/:formId/resolved`:

```typescript
interface ResolvedLayout {
  formId: string;
  source: 'workspace' | 'tenant' | 'manifest';
  sections: ResolvedSection[];
  fields: ResolvedField[];
  columns: ResolvedColumn[];
}

interface ResolvedField {
  fieldId: string;
  order: number;
  visibility: FieldVisibility;
  readonly: boolean; // convenience: true when visibility === 'readonly'
  defaultValue?: unknown;
  required?: boolean;
}

interface ResolvedColumn {
  columnId: string;
  visibility: ColumnVisibility;
}

interface ResolvedSection {
  sectionId: string;
  order: number;
}
```

### Complete Manifest Example

```typescript
// apps/plugin-crm/src/manifest.ts
import type { PluginManifest } from '@plexica/types';

export const manifest: PluginManifest = {
  id: 'plugin-crm',
  name: 'CRM',
  version: '1.2.0',
  routes: [{ path: '/crm', component: './src/pages/Dashboard.tsx', label: 'CRM' }],
  menuItems: [{ id: 'crm-contacts', label: 'Contacts', path: '/crm/contacts', icon: 'Users' }],

  formSchemas: [
    {
      formId: 'crm.contact-edit',
      label: 'Contact Edit Form',
      sections: [
        { sectionId: 'basic', label: 'Basic Info', order: 0 },
        { sectionId: 'address', label: 'Address', order: 1 },
        { sectionId: 'notes', label: 'Notes', order: 2 },
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
          fieldId: 'last-name',
          label: 'Last Name',
          type: 'text',
          required: true,
          defaultValue: '',
          sectionId: 'basic',
          order: 1,
        },
        {
          fieldId: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          defaultValue: '',
          sectionId: 'basic',
          order: 2,
        },
        {
          fieldId: 'phone',
          label: 'Phone',
          type: 'tel',
          required: false,
          defaultValue: null,
          sectionId: 'basic',
          order: 3,
        },
        {
          fieldId: 'company',
          label: 'Company',
          type: 'text',
          required: false,
          defaultValue: null,
          sectionId: 'basic',
          order: 4,
        },
        {
          fieldId: 'street',
          label: 'Street',
          type: 'text',
          required: false,
          defaultValue: null,
          sectionId: 'address',
          order: 0,
        },
        {
          fieldId: 'city',
          label: 'City',
          type: 'text',
          required: false,
          defaultValue: null,
          sectionId: 'address',
          order: 1,
        },
        {
          fieldId: 'notes',
          label: 'Notes',
          type: 'textarea',
          required: false,
          defaultValue: null,
          sectionId: 'notes',
          order: 0,
        },
      ],
      columns: [],
    },
    {
      formId: 'crm.contacts-table',
      label: 'Contacts Table',
      sections: [],
      fields: [],
      columns: [
        { columnId: 'name', label: 'Name', order: 0 },
        { columnId: 'email', label: 'Email', order: 1 },
        { columnId: 'company', label: 'Company', order: 2 },
        { columnId: 'status', label: 'Status', order: 3 },
        { columnId: 'created', label: 'Created', order: 4 },
      ],
    },
  ],
};
```

---

## Decorators

The SDK provides decorators for cleaner plugin route definitions. See [`src/decorators/`](./src/decorators/) for full documentation.

```typescript
import { OnEvent, RegisterService } from '@plexica/sdk';

class CrmPlugin extends PlexicaPlugin {
  @RegisterService({ name: 'crm-contacts', version: '1' })
  registerContactsService() {
    /* ... */
  }

  @OnEvent('workspace.created')
  async onWorkspaceCreated(event: DomainEvent) {
    /* ... */
  }
}
```

---

## Resources

- **Plugin Development Guide**: [`docs/PLUGIN_DEVELOPMENT.md`](../../docs/PLUGIN_DEVELOPMENT.md)
- **Security — Read-Only Enforcement**: [`docs/SECURITY.md#layout-engine-read-only-enforcement`](../../docs/SECURITY.md#layout-engine-read-only-enforcement)
- **Layout Engine Spec**: [`.forge/specs/014-frontend-layout-engine/spec.md`](../../.forge/specs/014-frontend-layout-engine/spec.md)
- **Types Reference**: [`packages/types/src/layout-config.ts`](../types/src/layout-config.ts)
