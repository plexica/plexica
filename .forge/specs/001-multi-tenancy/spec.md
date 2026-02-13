# Spec: 001 - Multi-Tenancy

> Feature specification for the Plexica multi-tenancy system.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 001        |

---

## 1. Overview

Plexica implements a **schema-per-tenant** isolation model on PostgreSQL, providing complete logical data isolation for each tenant organization. Each tenant gets its own database schema, Keycloak realm, storage bucket, and Redis key prefix. The multi-tenancy system is the foundational layer upon which all other platform features are built.

## 2. Problem Statement

Multi-tenant SaaS platforms must guarantee complete data isolation between customer organizations. Failure to isolate tenant data is a critical security violation. The challenge is providing strong isolation while maintaining operational efficiency (migrations, monitoring, provisioning) across potentially thousands of tenants.

## 3. User Stories

### US-001: Create Tenant

**As a** Super Admin,  
**I want** to create a new tenant organization,  
**so that** a new customer can use the platform with isolated data.

**Acceptance Criteria:**

- Given a valid tenant name and slug, when I create a tenant, then a new PostgreSQL schema `tenant_{slug}` is created.
- Given a valid tenant creation request, when provisioning completes, then a Keycloak realm `tenant-{slug}` exists.
- Given a valid tenant creation request, when provisioning completes, then a MinIO storage bucket `tenant-{slug}` exists.
- Given a valid tenant creation request, when provisioning completes, then the tenant status transitions from PROVISIONING to ACTIVE.
- Given a duplicate slug, when I attempt to create a tenant, then a 409 Conflict error is returned.

### US-002: Tenant Lifecycle Management

**As a** Super Admin,  
**I want** to suspend, reactivate, and delete tenants,  
**so that** I can manage the platform's customer base.

**Acceptance Criteria:**

- Given an ACTIVE tenant, when I suspend it, then all user access is blocked and data is preserved.
- Given a SUSPENDED tenant, when I reactivate it, then users can access the tenant again.
- Given a SUSPENDED tenant, when I initiate deletion, then status becomes PENDING_DELETION with a grace period.
- Given a PENDING_DELETION tenant past the grace period, when deletion executes, then all tenant data (schema, realm, bucket) is permanently removed.

### US-003: Per-Tenant Configuration

**As a** Tenant Admin,  
**I want** to customize my tenant's theme and plugin settings,  
**so that** my organization has a branded, tailored experience.

**Acceptance Criteria:**

- Given a tenant with theme settings, when a user loads the frontend, then the custom logo and colors are applied.
- Given a tenant with specific plugins enabled, when a user navigates the app, then only enabled plugins are visible.

## 4. Functional Requirements

| ID     | Requirement                                                                       | Priority | Story Ref |
| ------ | --------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Create PostgreSQL schema per tenant on provisioning                               | Must     | US-001    |
| FR-002 | Create Keycloak realm per tenant on provisioning                                  | Must     | US-001    |
| FR-003 | Create MinIO storage bucket per tenant on provisioning                            | Must     | US-001    |
| FR-004 | Enforce unique tenant slugs                                                       | Must     | US-001    |
| FR-005 | Support tenant states: PROVISIONING, ACTIVE, SUSPENDED, PENDING_DELETION, DELETED | Must     | US-002    |
| FR-006 | Block all access for SUSPENDED tenants                                            | Must     | US-002    |
| FR-007 | Permanently remove all tenant data on deletion                                    | Must     | US-002    |
| FR-008 | Support per-tenant theme customization (logo, colors, fonts)                      | Should   | US-003    |
| FR-009 | Support per-tenant plugin enable/disable                                          | Must     | US-003    |
| FR-010 | Support per-tenant plugin configuration overrides                                 | Should   | US-003    |
| FR-011 | Execute base migrations on new tenant schemas                                     | Must     | US-001    |
| FR-012 | Create tenant admin user during provisioning                                      | Must     | US-001    |
| FR-013 | Enable default plugins for new tenants                                            | Should   | US-001    |
| FR-014 | Tenant context middleware extracts tenant from JWT on every request               | Must     | US-001    |
| FR-015 | Redis keys prefixed with tenant identifier                                        | Must     | US-001    |

## 5. Non-Functional Requirements

| ID      | Category     | Requirement                                     | Target                  |
| ------- | ------------ | ----------------------------------------------- | ----------------------- |
| NFR-001 | Performance  | Tenant provisioning time                        | < 30 seconds            |
| NFR-002 | Performance  | Tenant context extraction per request           | < 5ms overhead          |
| NFR-003 | Scalability  | Maximum supported tenants                       | ~10,000                 |
| NFR-004 | Security     | Zero cross-tenant data leakage                  | 100% isolation          |
| NFR-005 | Security     | Every query scoped to tenant schema             | Enforced via middleware |
| NFR-006 | Availability | Tenant provisioning rollback on partial failure | Automatic               |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                         | Expected Behavior                                                     |
| --- | ------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | Provisioning fails mid-way (e.g., Keycloak down) | Rollback all created resources, set status to PROVISIONING with error |
| 2   | Duplicate tenant slug                            | Return 409 Conflict with actionable error message                     |
| 3   | Request with invalid/expired tenant JWT          | Return 401 Unauthorized                                               |
| 4   | Request for SUSPENDED tenant                     | Return 403 Forbidden with "Tenant suspended" message                  |
| 5   | Request for DELETED tenant                       | Return 404 Not Found                                                  |
| 6   | PostgreSQL approaches ~10,000 schema limit       | Alert Super Admin, block new tenant creation                          |
| 7   | Concurrent provisioning of same slug             | First wins, second gets 409 Conflict                                  |

## 7. Data Requirements

### Core Schema (global)

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'provisioning',
    settings JSONB DEFAULT '{}',
    theme JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Tenant Schema Template

Each tenant schema (`tenant_{slug}`) contains: `users`, `teams`, `team_members`, `roles`, `permissions`, `role_permissions`, `user_roles`, `policies`, `audit_logs`.

## 8. API Requirements

| Method | Path                               | Description                  |
| ------ | ---------------------------------- | ---------------------------- |
| POST   | /api/v1/admin/tenants              | Create new tenant            |
| GET    | /api/v1/admin/tenants              | List all tenants (paginated) |
| GET    | /api/v1/admin/tenants/:id          | Get tenant details           |
| PUT    | /api/v1/admin/tenants/:id          | Update tenant settings       |
| POST   | /api/v1/admin/tenants/:id/suspend  | Suspend tenant               |
| POST   | /api/v1/admin/tenants/:id/activate | Reactivate tenant            |
| DELETE | /api/v1/admin/tenants/:id          | Initiate tenant deletion     |

## 9. UX/UI Notes

- Super Admin panel: Tenant list with search, filter by status, create/edit/suspend actions
- Tenant creation shows provisioning progress indicator
- Tenant detail modal shows infrastructure info (schema, realm, bucket)

## 10. Out of Scope

- Resource limits per tenant (Phase 3 — M3.5)
- Self-service tenant provisioning (Phase 4 — M4.2)
- Geo-replication of tenant data (Phase 4 — M4.5)
- Tenant-level billing and metering

## 11. Open Questions

No open questions — multi-tenancy implementation is complete and operational.

## 12. Constitution Compliance

| Article | Status    | Notes                                                                 |
| ------- | --------- | --------------------------------------------------------------------- |
| Art. 1  | Compliant | Multi-tenancy isolation is a core principle (Art. 1.2)                |
| Art. 2  | Compliant | Uses approved stack: PostgreSQL, Keycloak, MinIO                      |
| Art. 3  | Compliant | Schema-per-tenant pattern, Prisma ORM, tenant context middleware      |
| Art. 4  | Partial   | Test coverage needs improvement (63% vs 80% target)                   |
| Art. 5  | Compliant | Complete tenant data isolation, Zod validation, parameterized queries |
| Art. 6  | Compliant | Standard error format, no stack traces in responses                   |
| Art. 7  | Compliant | snake_case tables, kebab-case files, camelCase functions              |
| Art. 8  | Partial   | Unit tests exist, integration/E2E tests need expansion                |
| Art. 9  | Compliant | Docker Compose deployment, health checks                              |

---

## Cross-References

| Document                  | Path                                                     |
| ------------------------- | -------------------------------------------------------- |
| Constitution              | `.forge/constitution.md`                                 |
| ADR-002                   | `.forge/knowledge/adr/adr-002-database-multi-tenancy.md` |
| ADR-007                   | `.forge/knowledge/adr/adr-007-prisma-orm.md`             |
| Product Brief             | `.forge/product/product-brief.md`                        |
| Functional Specs (source) | `specs/FUNCTIONAL_SPECIFICATIONS.md` Section 3           |
| Technical Specs (source)  | `specs/TECHNICAL_SPECIFICATIONS.md` Section 2            |
