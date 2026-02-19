# Spec: 004 - Plugin System

> Feature specification for the Plexica plugin architecture, lifecycle, communication, and SDK.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 004        |

---

## 1. Overview

Plexica's plugin system enables autonomous, container-isolated extensions that add functionality to the platform. Each plugin runs in a **separate container** with process isolation, exposes **standardized REST APIs**, contributes **frontend components** via Module Federation, extends the **permission and translation systems**, and manages its own **data schema** within the tenant database. Plugins communicate via an event-driven bus (Redpanda), direct REST calls (service discovery), or a shared data service.

## 2. Problem Statement

A modular SaaS platform must support extensibility without compromising stability, security, or tenant isolation. Plugins developed by internal or third-party teams must be installable, updatable, and removable without platform downtime. The plugin system must enforce resource limits, isolate failures, provide standardized APIs for discovery, and ensure that plugin-contributed permissions and data respect the multi-tenant security model.

## 3. User Stories

### US-001: Install Plugin

**As a** Super Admin,
**I want** to install a plugin from the registry,
**so that** tenants can enable it for their organization.

**Acceptance Criteria:**

- Given a registered plugin with a valid manifest, when I install it, then the plugin container image is pulled.
- Given installation in progress, when migrations run, then the plugin's data schema is created in all active tenant schemas.
- Given installation completes, when the plugin is healthy, then routes are registered in the API gateway.
- Given the plugin has a frontend, when installation completes, then the remote entry URL is registered for Module Federation.
- Given installation fails (image pull failure), then the plugin status remains `REGISTERED` and an error is logged.

### US-002: Plugin Lifecycle Management

**As a** Super Admin,
**I want** to enable, disable, update, and uninstall plugins,
**so that** I can manage the platform's extension ecosystem.

**Acceptance Criteria:**

- Given an INSTALLED plugin, when I enable it, then the container starts and the plugin registers in service discovery.
- Given an ACTIVE plugin, when I disable it, then the container stops but all data is preserved.
- Given an INSTALLED plugin, when I update to a new version, then the new image is pulled, migrations run, and the plugin is hot-swapped if possible.
- Given a DISABLED plugin, when I uninstall it, then the container is removed, routes are deregistered, and data cleanup is optional (configurable).

### US-003: Plugin Communication via Events

**As a** plugin developer,
**I want** my plugin to publish and subscribe to events,
**so that** plugins can communicate asynchronously without tight coupling.

**Acceptance Criteria:**

- Given a CRM plugin publishing `crm.deal.won`, when the event is emitted, then Redpanda delivers it to all subscribers (e.g., Billing plugin).
- Given an event subscriber, when the event is consumed, then the subscriber processes it with tenant context preserved.
- Given event delivery fails, when Redpanda retries, then the event is redelivered with at-least-once semantics.

### US-004: Plugin REST Communication

**As a** plugin developer,
**I want** to call other plugins via REST APIs,
**so that** I can make synchronous requests when event-driven communication is insufficient.

**Acceptance Criteria:**

- Given a CRM plugin calling the Billing plugin, when using `core.getService('billing')`, then the service URL is resolved via service discovery.
- Given a plugin REST call, when the target is unreachable, then a timeout error is returned within 5 seconds.
- Given a plugin REST call, when made, then `X-Tenant-ID`, `X-User-ID`, `X-Trace-ID`, and `Authorization` headers are propagated.

### US-005: Plugin Manifest Declaration

**As a** plugin developer,
**I want** to declare my plugin's capabilities in a manifest,
**so that** the platform knows my plugin's API, frontend, permissions, events, and configuration.

**Acceptance Criteria:**

- Given a valid plugin manifest, when submitted, then the manifest is validated against the manifest schema.
- Given a manifest with `dependencies`, when the plugin is installed, then dependencies are checked and the install is rejected if unmet.
- Given a manifest with `permissions`, when the plugin is installed, then permissions are registered in the authorization system.
- Given a manifest with `events.publishes` and `events.subscribes`, when the plugin is enabled, then event routes are configured in Redpanda.

### US-006: Tenant Plugin Configuration

**As a** tenant admin,
**I want** to enable/disable plugins and configure them for my tenant,
**so that** my organization uses only the plugins it needs with appropriate settings.

**Acceptance Criteria:**

- Given a globally installed plugin, when I enable it for my tenant, then the plugin is activated in my tenant's context.
- Given an enabled plugin, when I configure it (e.g., CRM deal stages), then the configuration is stored per-tenant in `tenant_plugins.configuration`.
- Given a disabled plugin, when I disable it for my tenant, then the plugin is no longer accessible but tenant data is preserved.

## 4. Functional Requirements

| ID     | Requirement                                                                                                                                   | Priority | Story Ref |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Each plugin runs in a separate container with process isolation                                                                               | Must     | US-001    |
| FR-002 | Plugin manifest schema: id, name, version, runtime, dependencies, api, frontend, permissions, events, translations, configuration, migrations | Must     | US-005    |
| FR-003 | Plugin lifecycle states: REGISTERED → INSTALLING → INSTALLED → ACTIVE → DISABLED → UNINSTALLING → UNINSTALLED                                 | Must     | US-002    |
| FR-004 | Plugin dependencies checked at install time; install blocked if unmet                                                                         | Must     | US-005    |
| FR-005 | Plugin data migrations run in all active tenant schemas on install/update                                                                     | Must     | US-001    |
| FR-006 | Event-driven communication via Redpanda with at-least-once delivery                                                                           | Must     | US-003    |
| FR-007 | REST plugin-to-plugin communication via service discovery                                                                                     | Must     | US-004    |
| FR-008 | Shared data service for cross-plugin critical data                                                                                            | Should   | US-004    |
| FR-009 | Standard plugin API: `/health`, `/ready`, `/openapi.json`, `/metrics`                                                                         | Must     | US-005    |
| FR-010 | Required headers on all plugin requests: `X-Tenant-ID`, `X-User-ID`, `X-Trace-ID`, `Authorization`                                            | Must     | US-004    |
| FR-011 | Plugin frontend: Module Federation remote entry URL registered on install                                                                     | Must     | US-001    |
| FR-012 | Plugin route prefix: `/api/plugins/{pluginId}/` for backend, `/{pluginId}/` for frontend                                                      | Must     | US-005    |
| FR-013 | Per-tenant plugin configuration stored in `tenant_plugins` table                                                                              | Must     | US-006    |
| FR-014 | Plugin contributes permissions registered in authorization system on install                                                                  | Must     | US-005    |
| FR-015 | Plugin contributes translation namespaces loaded on enable                                                                                    | Should   | US-005    |
| FR-016 | Plugin SDK (`@plexica/sdk`) provides base class, decorators, and context utilities                                                            | Must     | US-003    |
| FR-017 | Plugin resource limits (CPU, memory) enforced per container                                                                                   | Should   | US-001    |

## 5. Non-Functional Requirements

| ID      | Category     | Requirement                                            | Target                                     |
| ------- | ------------ | ------------------------------------------------------ | ------------------------------------------ |
| NFR-001 | Performance  | Plugin health check response                           | < 100ms P95                                |
| NFR-002 | Performance  | Plugin-to-plugin REST call latency                     | < 200ms P95 (excluding target processing)  |
| NFR-003 | Performance  | Event delivery latency (publish to consumer)           | < 500ms P95                                |
| NFR-004 | Reliability  | Plugin failure must not crash core platform            | Process isolation via containers           |
| NFR-005 | Security     | Plugins cannot bypass core security controls           | Network policies + API gateway enforcement |
| NFR-006 | Security     | Plugin secret injection only via environment variables | No secrets in manifest or code             |
| NFR-007 | Scalability  | Support ≥20 plugins per deployment                     | Independent container scaling              |
| NFR-008 | Availability | Plugin install/update with zero downtime               | Rolling updates; hot-swap when possible    |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                               | Expected Behavior                                                        |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1   | Plugin image pull fails during install                 | Status stays REGISTERED; error logged; retry available                   |
| 2   | Plugin migration fails on one tenant schema            | Migration rolled back for that tenant; other tenants unaffected          |
| 3   | Plugin health check fails after enable                 | Plugin marked unhealthy; traffic not routed; alert triggered             |
| 4   | Event consumer is down when event is published         | Event persisted in Redpanda; delivered when consumer recovers            |
| 5   | Plugin dependency is uninstalled                       | Dependent plugin is disabled; warning issued to Super Admin              |
| 6   | Two plugins register conflicting permissions           | Second plugin install fails with conflict error                          |
| 7   | Plugin exceeds resource limits                         | Container OOM-killed or CPU-throttled; plugin marked unhealthy           |
| 8   | Plugin manifest validation fails                       | Registration rejected with validation errors; manifest schema documented |
| 9   | Hot-swap fails during update                           | Rollback to previous version; error logged; manual intervention required |
| 10  | Tenant disables plugin while active users are using it | Active requests complete; new requests get 404; graceful shutdown        |

## 7. Data Requirements

### Core Schema

**plugins** table:

| Column     | Type      | Description                   |
| ---------- | --------- | ----------------------------- |
| id         | VARCHAR   | Plugin ID (PK, from manifest) |
| name       | VARCHAR   | Display name                  |
| version    | VARCHAR   | Current installed version     |
| manifest   | JSONB     | Full plugin manifest          |
| status     | VARCHAR   | Lifecycle state               |
| created_at | TIMESTAMP | Registration timestamp        |
| updated_at | TIMESTAMP | Last status change            |

**tenant_plugins** table:

| Column        | Type    | Description                          |
| ------------- | ------- | ------------------------------------ |
| tenant_id     | UUID    | FK to tenants                        |
| plugin_id     | VARCHAR | FK to plugins                        |
| enabled       | BOOLEAN | Whether enabled for this tenant      |
| configuration | JSONB   | Tenant-specific plugin configuration |
| PK            | —       | Composite (tenant_id, plugin_id)     |

### Plugin Manifest Schema

```json
{
  "id": "string (required)",
  "name": "string (required)",
  "version": "semver (required)",
  "description": "string",
  "runtime": {
    "type": "typescript",
    "image": "registry URL",
    "resources": { "cpu": "string", "memory": "string" }
  },
  "dependencies": [{ "plugin": "string", "version": "semver range" }],
  "api": { "basePath": "string", "healthCheck": "string", "openapi": "string" },
  "frontend": { "remoteEntry": "URL", "routePrefix": "string", "exposes": {} },
  "permissions": [{ "key": "string", "name": "string", "description": "string" }],
  "translations": { "namespaces": ["string"], "supportedLocales": ["string"] },
  "events": { "publishes": ["string"], "subscribes": ["string"] },
  "configuration": { "schema": "JSON Schema" },
  "migrations": { "path": "string" }
}
```

## 8. API Requirements

| Method | Path                               | Description                         | Auth                  |
| ------ | ---------------------------------- | ----------------------------------- | --------------------- |
| GET    | /api/v1/plugins                    | List all registered plugins         | Bearer + super_admin  |
| POST   | /api/v1/plugins                    | Register a plugin (submit manifest) | Bearer + super_admin  |
| POST   | /api/v1/plugins/:id/install        | Install a registered plugin         | Bearer + super_admin  |
| POST   | /api/v1/plugins/:id/enable         | Enable an installed plugin          | Bearer + super_admin  |
| POST   | /api/v1/plugins/:id/disable        | Disable an active plugin            | Bearer + super_admin  |
| POST   | /api/v1/plugins/:id/update         | Update to a new version             | Bearer + super_admin  |
| DELETE | /api/v1/plugins/:id                | Uninstall a plugin                  | Bearer + super_admin  |
| GET    | /api/v1/tenant/plugins             | List plugins enabled for tenant     | Bearer + tenant_admin |
| POST   | /api/v1/tenant/plugins/:id/enable  | Enable plugin for tenant            | Bearer + tenant_admin |
| POST   | /api/v1/tenant/plugins/:id/disable | Disable plugin for tenant           | Bearer + tenant_admin |
| PUT    | /api/v1/tenant/plugins/:id/config  | Update tenant plugin configuration  | Bearer + tenant_admin |

## 9. UX/UI Notes

- Super Admin plugin management: grid view with status badges, version info, tenant adoption count.
- Tenant Admin plugin settings: list view of enabled plugins with configuration forms auto-generated from manifest configuration schema.
- Plugin install progress: show step-by-step progress (image pull, migrations, route registration, health check).
- Plugin health status visible in both Super Admin and Tenant Admin dashboards.

## 10. Out of Scope

- Plugin marketplace with billing (future Phase 2-3).
- WebAssembly plugin isolation (Phase 5 — Ecosystem Expansion).
- Plugin SDK for languages other than TypeScript (Phase 5).
- Plugin versioning with multiple simultaneous versions (one version per plugin globally).
- Plugin development local environment tooling (separate developer documentation).

## 11. Open Questions

- No open questions. All requirements derived from existing functional specifications and constitution.

## 12. Constitution Compliance

| Article | Status | Notes                                                                                         |
| ------- | ------ | --------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Plugin isolation per Art. 1.2 §4; plugins cannot bypass core security                         |
| Art. 2  | ✅     | TypeScript runtime only (ADR-003); Redpanda for events (ADR-005)                              |
| Art. 3  | ✅     | Separate containers; service registry; API contracts per Art. 3.1                             |
| Art. 4  | ✅     | 80% coverage for plugin module; contract tests for plugin-to-core API (Art. 8.1)              |
| Art. 5  | ✅     | Plugin sandboxing: separate containers, network policies, resource limits                     |
| Art. 6  | ✅     | Standard error format from plugins; health check errors classified correctly                  |
| Art. 7  | ✅     | Plugin API at `/api/plugins/{id}/`; kebab-case URLs; REST conventions                         |
| Art. 8  | ✅     | Contract tests for plugin APIs; E2E for install lifecycle; unit tests for manifest validation |
| Art. 9  | ✅     | Health checks at `/health`; metrics at `/metrics`; zero-downtime updates                      |

---

## Cross-References

| Document                   | Path                                                      |
| -------------------------- | --------------------------------------------------------- |
| Constitution               | `.forge/constitution.md`                                  |
| Multi-Tenancy Spec         | `.forge/specs/001-multi-tenancy/spec.md`                  |
| Authorization Spec         | `.forge/specs/003-authorization/spec.md`                  |
| Frontend Architecture      | `.forge/specs/005-frontend-architecture/spec.md`          |
| ADR-003: TypeScript Only   | `.forge/knowledge/adr/adr-003-plugin-language-support.md` |
| ADR-005: Redpanda Events   | `.forge/knowledge/adr/adr-005-event-system-redpanda.md`   |
| ADR-011: Module Federation | `.forge/knowledge/adr/adr-011-vite-module-federation.md`  |
| Source: Functional Specs   | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 7)          |
| Plugin SDK                 | `packages/plugin-sdk/` (future)                           |
