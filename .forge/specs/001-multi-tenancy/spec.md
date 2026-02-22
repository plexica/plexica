# Spec: 001 - Multi-Tenancy

> Feature specification for the Plexica multi-tenancy system.

| Field     | Value      |
| --------- | ---------- |
| Status    | Approved   |
| Author    | forge-pm   |
| Date      | 2026-02-13 |
| Clarified | 2026-02-22 |
| Track     | Feature    |
| Spec ID   | 001        |

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
- Given a tenant name, when the slug is auto-generated, then it conforms to the pattern `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` (3–64 chars, lowercase alphanumeric and hyphens, no leading/trailing hyphens). The Super Admin may modify the generated slug before confirming.
- Given a valid tenant creation request with a selected plugin list, when provisioning completes, then the selected plugins are enabled for the new tenant.
- Given a valid tenant creation request with an admin email, when provisioning completes, then a Keycloak user with `tenant-admin` realm role is created and a one-time invitation email is sent to the provided email address for the admin to set their password.

### US-002: Tenant Lifecycle Management

**As a** Super Admin,  
**I want** to suspend, reactivate, and delete tenants,  
**so that** I can manage the platform's customer base.

**Acceptance Criteria:**

- Given an ACTIVE tenant, when I suspend it, then all tenant-user API requests return 403 Forbidden. Super Admins retain full read/write access to the tenant for auditing and management. Tenant data is preserved.
- Given a SUSPENDED tenant, when I reactivate it, then tenant users can access the tenant again.
- Given a SUSPENDED tenant, when I initiate deletion, then status becomes PENDING_DELETION with a 30-day grace period.
- Given a PENDING_DELETION tenant past the 30-day grace period, when the scheduled deletion job executes, then all tenant data (schema, realm, bucket, Redis keys) is permanently removed and status transitions to DELETED.
- Given a PENDING_DELETION tenant within the 30-day grace period, when a Super Admin reactivates it, then status transitions back to SUSPENDED (not ACTIVE) and the deletion is cancelled.

### US-003: Per-Tenant Configuration

**As a** Tenant Admin,  
**I want** to customize my tenant's theme and plugin settings,  
**so that** my organization has a branded, tailored experience.

**Acceptance Criteria:**

- Given a tenant with theme settings, when a user loads the frontend, then the custom logo and colors are applied.
- Given a tenant with specific plugins enabled, when a user navigates the app, then only enabled plugins are visible.

## 4. Functional Requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                 | Priority | Story Ref |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Create PostgreSQL schema per tenant on provisioning                                                                                                                                                                                                                                                                                                         | Must     | US-001    |
| FR-002 | Create Keycloak realm per tenant on provisioning                                                                                                                                                                                                                                                                                                            | Must     | US-001    |
| FR-003 | Create MinIO storage bucket per tenant on provisioning                                                                                                                                                                                                                                                                                                      | Must     | US-001    |
| FR-004 | Enforce unique tenant slugs. Slugs auto-generated from name via slugify, editable by Super Admin. Pattern: `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` (3–64 chars, lowercase alphanumeric + hyphens). Validated with Zod.                                                                                                                                           | Must     | US-001    |
| FR-005 | Support tenant states: PROVISIONING, ACTIVE, SUSPENDED, PENDING_DELETION, DELETED                                                                                                                                                                                                                                                                           | Must     | US-002    |
| FR-006 | Block all tenant-user access for SUSPENDED tenants (403 Forbidden). Super Admins retain full access for auditing and management.                                                                                                                                                                                                                            | Must     | US-002    |
| FR-007 | Permanently remove all tenant data (schema, realm, bucket, Redis keys) after the 30-day PENDING_DELETION grace period. Deletion executed by a scheduled background job. The deletion scheduler runs every 6 hours; tenants may persist up to 6 hours past their scheduled deletion timestamp. This latency is acceptable per product decision (2026-02-22). | Must     | US-002    |
| FR-008 | Support per-tenant theme customization: logo URL, favicon URL, primary/secondary/accent colors (hex), font family (string), custom CSS (string, max 10KB). Theme stored as validated JSONB.                                                                                                                                                                 | Should   | US-003    |
| FR-009 | Support per-tenant plugin enable/disable                                                                                                                                                                                                                                                                                                                    | Must     | US-003    |
| FR-010 | Support per-tenant plugin configuration overrides (Deferred — see Spec 007)                                                                                                                                                                                                                                                                                 | Should   | US-003    |
| FR-011 | Execute base migrations on new tenant schemas                                                                                                                                                                                                                                                                                                               | Must     | US-001    |
| FR-012 | Create tenant admin user during provisioning. Admin email provided at creation time; Keycloak user created with `tenant-admin` realm role; one-time invitation email sent for password setup.                                                                                                                                                               | Must     | US-001    |
| FR-013 | Allow Super Admin to select plugins to enable during tenant creation. The tenant creation form presents available plugins with checkboxes.                                                                                                                                                                                                                  | Should   | US-001    |
| FR-014 | Tenant context middleware extracts tenant from JWT on every request                                                                                                                                                                                                                                                                                         | Must     | US-001    |
| FR-015 | Redis keys prefixed with tenant identifier                                                                                                                                                                                                                                                                                                                  | Must     | US-001    |

## 5. Non-Functional Requirements

| ID      | Category     | Requirement                                     | Target                                                                                                                                     |
| ------- | ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| NFR-001 | Performance  | Tenant provisioning time                        | < 30 seconds                                                                                                                               |
| NFR-002 | Performance  | Tenant context extraction per request           | < 5ms overhead                                                                                                                             |
| NFR-003 | Scalability  | Maximum supported tenants                       | ~10,000                                                                                                                                    |
| NFR-004 | Security     | Zero cross-tenant data leakage                  | 100% isolation                                                                                                                             |
| NFR-005 | Security     | Every query scoped to tenant schema             | 100% of data-access queries must include tenant schema scope. Verified by integration tests and middleware audit.                          |
| NFR-006 | Availability | Tenant provisioning rollback on partial failure | Retry failed step 3× with exponential backoff, then rollback all created resources. Max provisioning time including retries: < 90 seconds. |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                                         | Expected Behavior                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Provisioning fails mid-way (e.g., Keycloak down)                                 | Retry failed step up to 3× with exponential backoff (1s, 2s, 4s). If all retries fail, rollback all previously created resources (schema, realm, bucket) in reverse order. Set tenant status to PROVISIONING with error details in `settings.provisioningError`. |
| 2   | Duplicate tenant slug                                                            | Return 409 Conflict with actionable error message                                                                                                                                                                                                                |
| 3   | Request with invalid/expired tenant JWT                                          | Return 401 Unauthorized                                                                                                                                                                                                                                          |
| 4   | Request for SUSPENDED tenant                                                     | Return 403 Forbidden with "Tenant suspended" message (tenant-user requests only; Super Admin requests pass through)                                                                                                                                              |
| 5   | Request for DELETED tenant                                                       | Return 404 Not Found                                                                                                                                                                                                                                             |
| 6   | PostgreSQL approaches ~10,000 schema limit                                       | Alert Super Admin at 9,000 schemas (warning only; no hard block). Super Admin decides whether to proceed or provision additional database infrastructure.                                                                                                        |
| 7   | Concurrent provisioning of same slug                                             | First wins, second gets 409 Conflict (enforced via database UNIQUE constraint and advisory lock)                                                                                                                                                                 |
| 8   | PENDING_DELETION tenant reactivated within grace period                          | Status transitions to SUSPENDED (not ACTIVE). Scheduled deletion job cancelled.                                                                                                                                                                                  |
| 9   | Provisioning rollback itself fails (e.g., cannot delete partially-created realm) | Log error with full context. Set tenant status to PROVISIONING with `settings.provisioningError` containing details of both the original failure and rollback failure. Alert Super Admin for manual cleanup.                                                     |
| 10  | Tenant admin invitation email fails to send                                      | Provisioning still succeeds (email is non-blocking). Log warning. Super Admin can re-trigger invitation from tenant management UI.                                                                                                                               |

## 7. Data Requirements

### Core Schema (global)

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{1,62}[a-z0-9]$'),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'provisioning',
    settings JSONB DEFAULT '{}',
    theme JSONB DEFAULT '{}',
    deletion_scheduled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Theme JSONB Schema

The `theme` column must conform to the following Zod-validated shape:

```typescript
const TenantThemeSchema = z.object({
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  fontFamily: z.string().max(100).optional(),
  customCss: z.string().max(10240).optional(), // max 10KB
});
```

### Tenant Schema Template

Each tenant schema (`tenant_{slug}`) contains: `users`, `teams`, `team_members`, `roles`, `permissions`, `role_permissions`, `user_roles`, `policies`, `audit_logs`.

## 8. API Requirements

| Method | Path                                        | Description                                                     |
| ------ | ------------------------------------------- | --------------------------------------------------------------- |
| POST   | /api/v1/admin/tenants                       | Create new tenant (with admin email and plugin selection)       |
| GET    | /api/v1/admin/tenants                       | List all tenants (paginated)                                    |
| GET    | /api/v1/admin/tenants/:id                   | Get tenant details                                              |
| PATCH  | /api/v1/admin/tenants/:id                   | Update tenant settings/theme                                    |
| GET    | /api/v1/admin/tenants/slug-availability     | Check slug availability (returns `{ available, suggestions? }`) |
| POST   | /api/v1/admin/tenants/:id/suspend           | Suspend tenant                                                  |
| POST   | /api/v1/admin/tenants/:id/activate          | Reactivate tenant                                               |
| DELETE | /api/v1/admin/tenants/:id                   | Initiate tenant deletion (30-day grace period)                  |
| POST   | /api/v1/admin/tenants/:id/admin-invitations | Re-send tenant admin invitation email                           |

### POST /api/v1/admin/tenants — Request Body

```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "adminEmail": "admin@acme.com",
  "pluginIds": ["plugin-uuid-1", "plugin-uuid-2"],
  "theme": {
    "primaryColor": "#1a73e8"
  }
}
```

- `name` (required): Tenant display name.
- `slug` (optional): Auto-generated from name if omitted. Must match slug format.
- `adminEmail` (required): Email for the tenant admin invitation.
- `pluginIds` (optional): Array of plugin UUIDs to enable. Empty array = no plugins.
- `theme` (optional): Initial theme settings.

## 9. UX/UI Notes

- Super Admin panel: Tenant list with search, filter by status, create/edit/suspend actions
- Tenant creation wizard: name → auto-generated slug (editable) → admin email → plugin selection (checkboxes) → optional theme → confirm
- Tenant creation shows provisioning progress indicator with per-step status (schema, realm, bucket, admin user)
- Tenant detail modal shows infrastructure info (schema, realm, bucket) and deletion countdown if PENDING_DELETION
- Suspended tenant row shown with visual indicator (e.g., warning icon, muted styling)
- Re-send invitation button visible on tenant detail for tenants with pending admin invites

## 10. Out of Scope

- Resource limits per tenant (Phase 3 — M3.5)
- Self-service tenant provisioning (Phase 4 — M4.2)
- Geo-replication of tenant data (Phase 4 — M4.5)
- Tenant-level billing and metering

## 11. Open Questions

No open questions — all ambiguities resolved during clarification session on 2026-02-22.

### Clarification Log

| #   | Ambiguity                                     | Resolution                                                                                                        | Date       |
| --- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Deletion grace period duration unspecified    | 30-day grace period with PENDING_DELETION status. Reactivation within grace period transitions to SUSPENDED.      | 2026-02-22 |
| 2   | Provisioning rollback behavior underspecified | Retry failed step 3× with exponential backoff (1s, 2s, 4s), then rollback all created resources in reverse order. | 2026-02-22 |
| 3   | Slug format and validation rules missing      | Auto-generated from name, editable by Super Admin. Pattern: `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` (3–64 chars).      | 2026-02-22 |
| 4   | Tenant admin bootstrap flow undefined         | Admin email provided at creation. Keycloak user created with `tenant-admin` role. One-time invitation email sent. | 2026-02-22 |
| 5   | Suspended tenant access scope unclear         | Full lockout for tenant users (403). Super Admins retain full read/write access for auditing.                     | 2026-02-22 |
| 6   | Default plugin selection undefined            | Super Admin selects plugins per-tenant at creation time (no global default list).                                 | 2026-02-22 |
| 7   | Theme JSONB shape undefined                   | logo URL, favicon URL, 3 colors (hex), font family, custom CSS (max 10KB). Zod-validated.                         | 2026-02-22 |
| 8   | Tenant limit enforcement thresholds           | Warning alert at 9,000 schemas. No hard block — Super Admin decides.                                              | 2026-02-22 |

## 12. Constitution Compliance

**Verified**: 2026-02-22 | **Constitution version**: 2026-02-13 (original, no amendments)

| Article | Status    | Notes                                                                                                                                                                                                                      |
| ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | Compliant | Multi-tenancy isolation is a core principle (Art. 1.2). WCAG 2.1 AA compliance required for admin panel (Art. 1.3).                                                                                                        |
| Art. 2  | Compliant | Uses approved stack: PostgreSQL 15+, Keycloak 26+, MinIO, Redis/ioredis, Prisma ^6.8.                                                                                                                                      |
| Art. 3  | Compliant | Schema-per-tenant pattern (ADR-002), Prisma ORM, tenant context middleware, layered architecture (controllers → services → repositories).                                                                                  |
| Art. 4  | Partial   | Test coverage needs improvement (76.5% vs 80% target per TD-001). Integration/E2E tests need expansion.                                                                                                                    |
| Art. 5  | Compliant | Complete tenant data isolation (Art. 5.2). Zod validation on all input including slug, theme, admin email (Art. 5.3). Parameterized queries only. RBAC enforced: Super Admin for admin endpoints, tenant-admin for config. |
| Art. 6  | Compliant | Standard error format with codes (TENANT_NOT_FOUND, TENANT_SUSPENDED, SLUG_CONFLICT). No stack traces in responses. Actionable messages for end users.                                                                     |
| Art. 7  | Compliant | snake_case tables (`tenants`, `deletion_scheduled_at`), kebab-case files, camelCase functions, PascalCase DTOs.                                                                                                            |
| Art. 8  | Partial   | Unit tests exist; integration/E2E tests need expansion. Spec now defines testable acceptance criteria for all user stories.                                                                                                |
| Art. 9  | Compliant | Health checks, feature flags for gradual rollout, backward-compatible migrations. Provisioning rollback within 90s budget.                                                                                                 |

### Findings

**[PARTIAL] Article 4 — Quality Standards (Coverage)**
Current overall coverage is 76.5% (target: 80%). Core modules need 85%. This is tracked as TD-001 and TD-002 in the decision log. The clarified spec now provides specific, testable acceptance criteria for all user stories, which should help close the coverage gap during implementation.

**[PARTIAL] Article 8 — Testing Standards**
The spec defines edge cases (10 scenarios) and acceptance criteria in Given/When/Then format. Implementation must include:

- Unit tests for provisioning service (retry/rollback logic), slug validation, theme validation.
- Integration tests for all 8 API endpoints including error cases.
- E2E tests for full provisioning flow, suspension flow, and deletion grace period flow.

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
