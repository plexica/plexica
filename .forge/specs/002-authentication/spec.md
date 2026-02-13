# Spec: 002 - Authentication System

> Feature specification for the Plexica authentication system based on Keycloak.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 002        |

---

## 1. Overview

Plexica delegates all authentication to **Keycloak**, using a realm-per-tenant model. Each tenant gets its own Keycloak realm (`tenant-{slug}`) with dedicated users, clients, and roles. A master realm manages Super Admin access. Authentication produces JWT tokens containing tenant context, roles, and team memberships. Keycloak handles credential storage, password policies, and SSO; Plexica maintains a synchronized internal user profile database for application-specific data.

## 2. Problem Statement

A multi-tenant SaaS platform requires tenant-isolated authentication that prevents cross-tenant credential leakage, supports enterprise SSO per tenant, and synchronizes identity data between the identity provider and the application database. The system must handle realm provisioning as part of tenant lifecycle, token validation on every request, and near-realtime user sync without coupling the application to the identity provider's internal data model.

## 3. User Stories

### US-001: User Login

**As a** tenant user,
**I want** to log in with my email and password,
**so that** I can access my tenant's application.

**Acceptance Criteria:**

- Given valid credentials for tenant `acme-corp`, when I submit login, then I receive a JWT token with `realm: "tenant-acme-corp"` and `tenant_id: "acme-corp"`.
- Given valid credentials, when login succeeds, then the JWT contains `sub` (user UUID), `roles`, `teams`, and `exp` claims.
- Given invalid credentials, when I submit login, then a 401 Unauthorized error is returned with an actionable message (no credential details leaked).
- Given a suspended tenant, when I attempt login, then access is denied with a clear error indicating the tenant is suspended.

### US-002: Token Validation

**As the** core API,
**I want** to validate JWT tokens on every request,
**so that** only authenticated users access protected resources.

**Acceptance Criteria:**

- Given a valid JWT with a matching tenant realm, when a request is made, then the request is authenticated and tenant context is set.
- Given an expired JWT, when a request is made, then a 401 Unauthorized error is returned.
- Given a JWT from realm `tenant-acme-corp`, when the request targets tenant `globex`, then the request is denied with 403 Forbidden.
- Given a request without an Authorization header to a non-public endpoint, then a 401 Unauthorized error is returned.

### US-003: Keycloak-to-Plexica User Sync

**As the** platform,
**I want** to synchronize user data from Keycloak to the internal database,
**so that** application features can reference user profiles without querying Keycloak.

**Acceptance Criteria:**

- Given a new user created in Keycloak, when the event is consumed, then a corresponding user record is created in the tenant's `users` table with `keycloak_id` as foreign key.
- Given a user updated in Keycloak (email change), when the event is consumed, then the internal user record is updated within 5 seconds (P95).
- Given a user deleted in Keycloak, when the event is consumed, then the internal user record status is set to `deactivated` (soft delete).

### US-004: Realm Provisioning

**As a** Super Admin,
**I want** tenant creation to automatically provision a Keycloak realm,
**so that** the tenant's users can authenticate immediately after setup.

**Acceptance Criteria:**

- Given a new tenant with slug `acme-corp`, when provisioning runs, then a Keycloak realm `tenant-acme-corp` is created.
- Given realm provisioning, when complete, then clients `plexica-web` and `plexica-api` are registered in the realm.
- Given realm provisioning, when complete, then base roles (`tenant_admin`, `user`) are created in the realm.
- Given a provisioning failure, when Keycloak is unreachable, then the tenant status remains `PROVISIONING` and an error is logged with retry scheduled.

### US-005: Super Admin Authentication

**As a** Super Admin,
**I want** to authenticate via the master realm,
**so that** I can access the Super Admin panel independently of any tenant.

**Acceptance Criteria:**

- Given valid Super Admin credentials, when I login, then a JWT with `realm: "master"` and role `super_admin` is issued.
- Given a Super Admin JWT, when accessing tenant management endpoints, then access is granted regardless of tenant context.

## 4. Functional Requirements

| ID     | Requirement                                                                                             | Priority | Story Ref |
| ------ | ------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Keycloak realm-per-tenant model: each tenant maps to `tenant-{slug}` realm                              | Must     | US-004    |
| FR-002 | Master realm for Super Admin authentication                                                             | Must     | US-005    |
| FR-003 | JWT tokens contain `sub`, `iss`, `realm`, `tenant_id`, `roles`, `teams`, `exp` claims                   | Must     | US-001    |
| FR-004 | Token validation middleware validates JWT signature, expiry, and tenant context on every request        | Must     | US-002    |
| FR-005 | Keycloak clients `plexica-web` and `plexica-api` provisioned per realm                                  | Must     | US-004    |
| FR-006 | Base roles (`tenant_admin`, `user`) provisioned per realm                                               | Must     | US-004    |
| FR-007 | User sync via Keycloak events (webhook or Redpanda): create, update, delete propagated to internal DB   | Must     | US-003    |
| FR-008 | Keycloak stores: UUID, email, password. Plexica DB stores: display_name, avatar, preferences, tenant_id | Must     | US-003    |
| FR-009 | All endpoints require authentication by default; public endpoints explicitly marked                     | Must     | US-002    |
| FR-010 | Session tokens expire after 24 hours of inactivity (per Constitution Art. 5.1)                          | Must     | US-001    |
| FR-011 | Cross-tenant JWT usage is rejected (realm mismatch detection)                                           | Must     | US-002    |
| FR-012 | Suspended tenant realms block all authentication attempts                                               | Should   | US-001    |

## 5. Non-Functional Requirements

| ID      | Category    | Requirement                                                  | Target                                |
| ------- | ----------- | ------------------------------------------------------------ | ------------------------------------- |
| NFR-001 | Performance | Token validation latency                                     | < 5ms per request (cached JWKS)       |
| NFR-002 | Performance | User sync event processing                                   | < 5s P95 from Keycloak event to DB    |
| NFR-003 | Security    | No PII in error messages or logs (per Constitution Art. 5.2) | Zero PII leakage                      |
| NFR-004 | Security    | All auth traffic over TLS 1.2+ (per Constitution Art. 5.2)   | 100% TLS coverage                     |
| NFR-005 | Reliability | Keycloak unavailability must not crash core-api              | Graceful degradation with retry       |
| NFR-006 | Security    | Failed login attempts do not reveal whether email exists     | Generic "invalid credentials" message |
| NFR-007 | Scalability | JWKS keys cached and rotated without downtime                | Key rotation < 1min propagation       |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                | Expected Behavior                                                  |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | Keycloak is unavailable during tenant provisioning      | Tenant stays in PROVISIONING state; retry with exponential backoff |
| 2   | User event arrives before tenant provisioning completes | Event queued and replayed once tenant schema exists                |
| 3   | JWT signed with rotated key (old key)                   | Accepted if within JWKS cache TTL; rejected otherwise              |
| 4   | Concurrent login from multiple devices                  | All sessions valid; each gets independent token                    |
| 5   | User deleted from Keycloak but has active JWT           | JWT valid until expiry; subsequent requests after expiry fail      |
| 6   | Realm name collision (two tenants with similar slugs)   | Slug uniqueness enforced at tenant creation prevents collision     |
| 7   | Keycloak event delivery fails (Redpanda consumer lag)   | Events replayed from Redpanda offset; no data loss                 |
| 8   | Super Admin attempts to access tenant-scoped endpoint   | Allowed — Super Admin bypasses tenant context validation           |

## 7. Data Requirements

### Keycloak Data (Source of Truth for Auth)

| Field    | Storage  | Description                       |
| -------- | -------- | --------------------------------- |
| UUID     | Keycloak | User identity                     |
| Email    | Keycloak | Login credential                  |
| Password | Keycloak | Hashed credential (never exposed) |
| Realm    | Keycloak | Tenant membership                 |
| Roles    | Keycloak | Base roles (tenant_admin, user)   |

### Plexica Internal DB (Application Data)

| Field        | Storage       | Description               |
| ------------ | ------------- | ------------------------- |
| keycloak_id  | `users` table | FK to Keycloak UUID       |
| email        | `users` table | Synced from Keycloak      |
| display_name | `users` table | User-editable             |
| avatar_url   | `users` table | Profile avatar            |
| preferences  | `users` table | JSON application settings |
| status       | `users` table | active, deactivated       |
| tenant_id    | Context       | Derived from realm        |

### JWT Token Structure

```json
{
  "sub": "user-uuid",
  "iss": "https://auth.plexica.io/realms/tenant-acme-corp",
  "realm": "tenant-acme-corp",
  "tenant_id": "acme-corp",
  "roles": ["tenant_admin"],
  "teams": ["team-sales", "team-marketing"],
  "exp": 1699999999
}
```

## 8. API Requirements

| Method | Path                  | Description                     | Auth   |
| ------ | --------------------- | ------------------------------- | ------ |
| POST   | /api/v1/auth/login    | Redirect to Keycloak login flow | Public |
| POST   | /api/v1/auth/callback | Handle Keycloak OAuth callback  | Public |
| POST   | /api/v1/auth/refresh  | Refresh access token            | Bearer |
| POST   | /api/v1/auth/logout   | Invalidate session              | Bearer |
| GET    | /api/v1/auth/me       | Get current user profile        | Bearer |
| GET    | /api/v1/auth/jwks     | Public JWKS endpoint (proxy)    | Public |

## 9. UX/UI Notes

- Login page must display tenant branding (logo, colors) based on the tenant slug in the URL.
- Login errors must be actionable but must not reveal whether an email is registered (per NFR-006).
- Token refresh must be transparent to the user (silent refresh before expiry).
- Session expiry must redirect to login with a clear "session expired" message.

## 10. Out of Scope

- Per-tenant SSO configuration (Phase 4 — Enterprise)
- Multi-factor authentication configuration UI (defer to Keycloak admin console)
- Social login providers (Google, GitHub) — future consideration
- Password policy customization per tenant (use Keycloak realm defaults for MVP)
- Self-service user registration (invitations only for MVP)

## 11. Open Questions

- No open questions. All requirements derived from existing functional specifications and constitution.

## 12. Constitution Compliance

| Article | Status | Notes                                                                               |
| ------- | ------ | ----------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Security-first: auth is foundational; no feature ships without auth                 |
| Art. 2  | ✅     | Uses approved stack: Keycloak 26+, Fastify, Redis for session cache                 |
| Art. 3  | ✅     | Layered architecture: middleware → service → repository for token validation        |
| Art. 4  | ✅     | 85% test coverage target for auth module; unit + integration + E2E required         |
| Art. 5  | ✅     | Keycloak Auth (5.1), TLS required (5.2), Zod validation on auth payloads (5.3)      |
| Art. 6  | ✅     | Standard error format; no stack traces in production; actionable messages           |
| Art. 7  | ✅     | Naming follows conventions: `auth.service.ts`, `AuthService`, `CreateUserDto`       |
| Art. 8  | ✅     | Unit tests for token validation, integration tests for Keycloak flow, E2E for login |
| Art. 9  | ✅     | Health check includes Keycloak connectivity; structured JSON logging                |

---

## Cross-References

| Document                 | Path                                                |
| ------------------------ | --------------------------------------------------- |
| Constitution             | `.forge/constitution.md`                            |
| Multi-Tenancy Spec       | `.forge/specs/001-multi-tenancy/spec.md`            |
| Authorization Spec       | `.forge/specs/003-authorization/spec.md`            |
| ADR-006: Fastify         | `.forge/knowledge/adr/adr-006-fastify-framework.md` |
| Source: Functional Specs | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 4)    |
| Source: Auth Module      | `apps/core-api/src/modules/auth/`                   |
| Security Guidelines      | `docs/SECURITY.md`                                  |
