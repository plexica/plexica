# Spec 005: Super Admin

**Phase**: 4 — Super Admin Panel
**Duration**: 2-3 weeks
**Status**: Draft
**Date**: March 2026

## Overview

Delivers a dedicated super admin application for platform-wide management.
Super admins can provision, suspend, and delete tenants; manage the plugin
catalog; and monitor system health across all infrastructure services. This
is the operational control plane for the Plexica platform.

## Dependencies

- **Spec 002 — Foundations**: Authentication (Keycloak super-admin realm/role),
  multi-tenancy infrastructure, and database schema-per-tenant model.
- **Spec 003 — Core Features**: Tenant and workspace entities must exist so
  the super admin can manage them.
- **Spec 004 — Plugin System**: Plugin registry, Kafka event system, and
  plugin lifecycle must be operational for catalog management and monitoring.

## Features

### 5.1 Super Admin Panel (2-3 weeks)

| ID     | Feature                              | E2E Test                                                       |
| ------ | ------------------------------------ | -------------------------------------------------------------- |
| 005-01 | Dashboard with platform metrics      | Super admin sees tenant count, user count, active plugins      |
| 005-02 | Tenant list with search and filters  | Super admin searches tenant, filters by status                 |
| 005-03 | Tenant detail (info, users, plugins, audit) | Super admin sees all details of a tenant                |
| 005-04 | Tenant provisioning wizard           | Super admin completes wizard, tenant operational               |
| 005-05 | Tenant suspension                    | Super admin suspends tenant, users cannot access               |
| 005-06 | Tenant reactivation                  | Super admin reactivates tenant, users access again             |
| 005-07 | Tenant deletion (GDPR)               | Super admin deletes tenant: schema dropped, realm deleted, bucket deleted |
| 005-08 | Plugin catalog management            | Super admin publishes/unpublishes plugins, review queue        |
| 005-09 | System health check                  | Super admin sees status of all services (DB, Keycloak, Redis, Kafka) |
| 005-10 | Filterable system logs               | Super admin sees logs with filters for tenant, level, timestamp |
| 005-11 | Kafka status                         | Super admin sees consumer lag per plugin, DLQ size             |

## Acceptance Criteria

1. A super admin can manage the entire platform from the UI: create, suspend,
   reactivate, and delete tenants with full lifecycle verification.
2. Tenant deletion is complete and GDPR-compliant: PostgreSQL schema dropped,
   Keycloak realm deleted, MinIO bucket deleted — verified by E2E test that
   confirms all three resources are gone.
3. Tenant suspension is atomic: all services (API, Keycloak, plugin proxy)
   reject requests for a suspended tenant immediately after the action.
4. Plugin catalog management allows publishing, unpublishing, and review of
   plugins before they appear in tenant marketplaces.
5. System health check displays real-time status of all infrastructure
   services without exposing sensitive connection strings or credentials.
6. Kafka monitoring shows consumer lag per plugin and DLQ size, enabling
   operational visibility into the event system.
7. All 11 features have passing E2E tests.

## Non-Functional Requirements

| Metric                                    | Target           |
| ----------------------------------------- | ---------------- |
| Dashboard load time                       | < 2s             |
| Tenant list with 100+ tenants             | < 1s             |
| Tenant provisioning (schema + realm + bucket) | < 30s         |
| Tenant deletion (schema + realm + bucket) | < 30s            |
| Tenant suspension propagation             | < 5s             |
| Health check response                     | < 500ms          |
| System logs query (filtered)              | < 2s             |

## Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Tenant deletion cascading failures (schema drop, realm delete, bucket delete — any can fail independently) | Tenant partially deleted, orphaned resources | Saga pattern with compensating actions; track deletion steps in status table; retry failed steps; manual cleanup UI for stuck deletions |
| Tenant suspension must be atomic across services | Suspended tenant briefly accessible via some services | Suspension flag checked at API gateway level (Fastify middleware); Keycloak realm disabled; Redis cache invalidated; plugin proxy rejects |
| Health check exposes sensitive infrastructure info | Security leak of connection strings, versions | Return only status enum (healthy/degraded/down) per service; no connection details; no version numbers |
| Dashboard metrics query performance at scale | Slow dashboard with many tenants/plugins | Pre-aggregated metrics in Redis (updated on schedule); materialized views for tenant/user counts |
| GDPR deletion must be verifiable | Audit failure if data remnants exist | Deletion audit log entry with checksums; post-deletion verification query; retention policy for audit logs themselves |
| Super admin credential compromise | Full platform access | MFA required for super admin role; session timeout 1h; IP allowlist for super admin endpoints; audit log for all super admin actions |
