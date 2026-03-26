# Spec 004: Plugin System

**Phase**: 3 — Plugin System
**Duration**: 5-6 weeks
**Status**: Draft
**Date**: March 2026

## Overview

The most complex phase of Plexica v2. Delivers a complete plugin architecture:
registry and lifecycle management, Module Federation UI integration, Kafka-based
event system, backend API proxy, a real CRM example plugin, and a marketplace
with CLI scaffolding. After this phase, third-party developers can build, install,
and run full-featured plugins inside the platform.

## Dependencies

- **Spec 002 — Foundations**: Authentication (Keycloak), multi-tenancy (schema-per-tenant),
  RBAC, and database infrastructure must be operational.
- **Spec 003 — Core Features**: Workspaces, members, and roles must exist so plugins
  can scope data and UI to workspaces.

## Features

### 4.1 Plugin Core Infrastructure (1.5 weeks)

| ID     | Feature                                              | E2E Test                                                         |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------- |
| 004-01 | Plugin registry (core schema, CRUD API)              | Super admin sees list of available plugins                       |
| 004-02 | Manifest validation (Zod schema)                     | Plugin with invalid manifest fails to install                    |
| 004-03 | Plugin installation for tenant (migrations in tenant schema) | Tenant admin installs plugin, plugin tables created in schema |
| 004-04 | Plugin activation/deactivation                       | Deactivated plugin does not appear in interface                  |
| 004-05 | Plugin uninstallation (table cleanup)                | Plugin removed, plugin tables dropped from schema                |
| 004-06 | Plugin workspace visibility                          | Admin enables/disables plugin for specific workspaces            |

### 4.2 Plugin UI — Module Federation (1.5 weeks)

| ID     | Feature                                                        | E2E Test                                                       |
| ------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
| 004-07 | Vite Plugin Preset (`@plexica/vite-plugin`)                    | Plugin with preset generates MF remote automatically           |
| 004-08 | Shell MF host loads plugin remotes                             | Active plugin shows its UI in the shell                        |
| 004-09 | Shared dependencies (React, Query, UI lib, i18n)               | Plugin uses deps from shell, not duplicated                    |
| 004-10 | React Context propagation (tenant, user, workspace, theme)     | Plugin accesses context from shell                             |
| 004-11 | Extension points (sidebar, workspace-panel, dashboard-widget)  | Plugin declares slot in manifest, appears in correct location  |
| 004-12 | Error boundary per plugin slot                                 | Plugin crashes, shell shows fallback, rest of app works        |
| 004-13 | Hot reload in development                                      | Plugin dev server registers with local shell, changes visible live |

### 4.3 Plugin Events — Kafka (1 week)

| ID     | Feature                                                | E2E Test                                                             |
| ------ | ------------------------------------------------------ | -------------------------------------------------------------------- |
| 004-14 | Automatic core event emission (CRUD on main entities)  | Create workspace emits `plexica.workspace.created` on Kafka          |
| 004-15 | SDK event subscription (`sdk.onEvent()`)               | Plugin subscribes to event, handler called when event arrives        |
| 004-16 | Plugin custom events                                   | CRM plugin emits `plugin.crm.contact.created`, Analytics receives it |
| 004-17 | Consumer group auto-management                         | Consumer group `plugin-{id}-{tenant}` created automatically          |
| 004-18 | Dead letter queue                                      | Event that fails 3 times goes to DLQ, does not block consumer        |
| 004-19 | Consumer lag monitoring                                | Prometheus metrics for consumer lag per plugin                        |

### 4.4 Plugin Backend — Proxy (0.5 weeks)

| ID     | Feature                                                | E2E Test                                          |
| ------ | ------------------------------------------------------ | ------------------------------------------------- |
| 004-20 | API proxy: `/api/v1/plugins/:pluginId/*` to plugin backend | Call to plugin API reaches plugin backend      |
| 004-21 | Auth + tenant context propagated                       | Plugin backend receives tenant ID and user info in headers |
| 004-22 | Plugin backend health check                            | Core verifies plugin backend is reachable         |

### 4.5 CRM Example Plugin — Real (1 week)

| ID     | Feature                                                  | E2E Test                                                    |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------- |
| 004-23 | CRM plugin with MF UI (contact list, form)               | User installs CRM, opens contacts view in shell             |
| 004-24 | CRM plugin backend (CRUD contacts via proxy)             | User creates contact, contact persisted in DB               |
| 004-25 | CRM plugin data (`crm_contacts`, `crm_deals` in tenant schema) | Data persistent, survives restart                     |
| 004-26 | CRM plugin events (creates pipeline on workspace.created)| New workspace triggers CRM pipeline creation automatically  |
| 004-27 | CRM plugin cross-workspace isolation                     | Contacts in workspace A not visible from workspace B        |

### 4.6 Marketplace & CLI (0.5 weeks)

| ID     | Feature                                             | E2E Test                                                         |
| ------ | --------------------------------------------------- | ---------------------------------------------------------------- |
| 004-28 | Marketplace UI (search, categories, rating)         | Tenant admin searches plugin, sees details, installs             |
| 004-29 | CLI `create-plexica-plugin`                         | Command generates complete project with MF preset, manifest, backend template |
| 004-30 | Consolidated Plugin SDK (1 class)                   | SDK with `onEvent`, `callApi`, `getContext`, `getDb`             |

## Acceptance Criteria

1. A real CRM plugin works end-to-end: Module Federation UI renders inside the
   shell, backend API is reachable through the proxy, Kafka event subscription
   triggers pipeline creation, and data persists in tenant schema tables.
2. Plugin lifecycle is complete: install, activate, deactivate, uninstall — each
   step verified by E2E tests with correct schema-level side effects.
3. Module Federation shares React, TanStack Query, UI lib, and i18n from the
   shell; plugin bundles contain no duplicated shared dependencies.
4. Error boundaries isolate plugin crashes: a failing plugin slot shows a fallback
   component without affecting the rest of the application.
5. The `create-plexica-plugin` CLI generates a working plugin project that builds,
   installs, and renders in the shell without manual configuration.
6. All 30 features have passing E2E tests.

## Non-Functional Requirements

| Metric                        | Target           |
| ----------------------------- | ---------------- |
| Plugin UI load (MF remote)    | < 2s             |
| MF shared deps                | Loaded once only |
| Kafka event delivery latency  | < 1s P95         |
| Plugin API proxy overhead     | < 100ms          |
| Plugin install time           | < 10s            |
| Plugin uninstall (table drop) | < 5s             |
| Manifest validation           | < 50ms           |

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Module Federation production cache busting for `remoteEntry.js` | Plugin UI serves stale code after deploy | Content-hash filenames, cache headers with `no-cache` for entry point |
| Kafka consumer rebalancing during plugin install/uninstall | Temporary event delivery gaps | Graceful shutdown with commit-before-close, configurable rebalance timeout |
| Plugin migration failures blocking tenant schema | Tenant partially migrated, stuck state | Wrap migrations in transaction, rollback on failure, store migration status |
| MF version compatibility between shell and plugins | Runtime errors from mismatched shared deps | Strict version ranges in MF config, version negotiation at load time |
| Plugin backend unavailability | Proxy returns 502, user sees broken UI | Health check with circuit breaker, graceful degradation in UI |
| Kafka partition exhaustion with many plugins | Consumer lag, delayed event delivery | Auto-scaling consumer groups, partition count per topic based on plugin count |
