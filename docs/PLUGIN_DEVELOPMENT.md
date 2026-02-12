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
