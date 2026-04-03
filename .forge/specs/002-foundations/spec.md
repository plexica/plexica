# Spec 002: Foundations

**Phase**: 1 — Foundations
**Duration**: 3-4 weeks
**Status**: Clarified
**Date**: March 2026

---

## Overview

Deliver the three foundational pillars of the platform: multi-realm
authentication via Keycloak, schema-per-tenant data isolation, and the frontend
shell with design system integration. After this phase a user can log in to
their tenant's realm, see a dashboard, and be provably isolated from other
tenants.

## Dependencies

- **Spec 001** (Infrastructure Setup) — monorepo, Docker Compose stack,
  Keycloak realm import, PostgreSQL schema utility, design system base tokens.

## Features

### 2.1 Multi-Realm Authentication (1.5 weeks)

| ID     | Feature                                            | E2E Test                                                                             |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 002-01 | Login page with Keycloak redirect (tenant's realm) | Browser opens login, redirects to correct realm, enters credentials, sees dashboard  |
| 002-02 | JWT RS256 validation middleware (JWKS per realm)   | Valid token → 200; no token → 401; wrong realm token → 401                           |
| 002-03 | JWKS caching per realm                             | Performance: doesn't call Keycloak on every request                                  |
| 002-04 | Logout with current-session invalidation           | User logs out, previous token no longer works; other device sessions unaffected      |
| 002-05 | Automatic refresh token (Keycloak defaults)        | Expired access token renewed transparently; max session exceeded → redirect to login |
| 002-06 | Realm discovery from subdomain                     | Subdomain `acme.plexica.io` → realm `tenant-acme`. Custom domains deferred.          |

### 2.2 Multi-Tenancy Schema-per-Tenant (1.5 weeks)

| ID     | Feature                                                | E2E Test                                                                                                                             |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 002-07 | Tenant context middleware (`SET search_path`)          | Request with tenant A sees tenant A data, not tenant B data                                                                          |
| 002-08 | AsyncLocalStorage for tenant context                   | Tenant context available throughout stack without explicit params                                                                    |
| 002-09 | Schema creation utility                                | Utility creates schema + applies core migrations                                                                                     |
| 002-10 | Full tenant provisioning (rollback on partial failure) | Super admin creates tenant → schema + realm + bucket created → tenant admin logs in. Partial failure → rollback all completed steps. |
| 002-11 | Cross-tenant isolation test (critical)                 | User tenant A calls API with resource ID from tenant B → **404 Not Found** (no information leakage)                                  |
| 002-12 | Multi-schema migration (stop on first failure)         | Utility applies a migration to all existing tenant schemas; stops on first failure, reports which tenant failed                      |

### 2.3 Frontend Shell & Design System (1 week)

| ID     | Feature                                                   | E2E Test                                                                                               |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 002-13 | Shell layout with sidebar, header, content area           | Browser opens app, sees professional layout with navigation                                            |
| 002-14 | Design system applied (Inter font, brand colors, spacing) | Visual: no monospace, defined colors, consistent border-radius                                         |
| 002-15 | Dashboard with welcome message                            | User logs in, sees dashboard with their name                                                           |
| 002-16 | Error boundary at route level                             | Component that throws error doesn't crash entire app                                                   |
| 002-17 | i18n connected (react-intl, at least English)             | All visible strings come from react-intl message catalog                                               |
| 002-18 | Single auth store (Zustand)                               | Login/logout/refresh managed by single store                                                           |
| 002-19 | Single data fetching pattern (TanStack Query)             | All API calls go through useQuery/useMutation                                                          |
| 002-20 | WCAG 2.1 AA compliance for shell                          | Keyboard navigation, focus management, color contrast ≥ 4.5:1, ARIA labels on all interactive elements |

## Acceptance Criteria

1. **Given** a user with valid credentials in tenant "acme", **when** they
   navigate to `acme.plexica.io`, **then** they are redirected to Keycloak's
   `tenant-acme` realm login and land on their dashboard with a personalised
   welcome message after authentication.
2. **Given** a user in tenant A, **when** they request a resource ID belonging
   to tenant B, **then** the API returns **404 Not Found** (no information
   leakage) — verified by a dedicated Playwright cross-tenant isolation test.
3. **Given** a logged-in user, **when** they click logout, **then** only their
   current session is invalidated; the JWT is rejected by the API on subsequent
   requests. Other device sessions are unaffected.
4. **Given** a user with an expired access token and a valid refresh token,
   **when** they make an API call, **then** the frontend transparently
   refreshes the token using Keycloak defaults (typically 30-min access token,
   8-hour SSO session). When the max session lifetime is exceeded, the user
   is redirected to the login page.
5. **Given** a super admin, **when** they provision a new tenant, **then**
   the system creates the PostgreSQL schema, Keycloak realm, and MinIO bucket
   sequentially. If any step fails, all previously completed steps are rolled
   back. The tenant remains in a clean "not provisioned" state.
6. **Given** 10 existing tenant schemas, **when** a migration is run via the
   multi-schema utility, **then** it applies to all schemas in sequence. If
   any schema migration fails, the process stops immediately, reports which
   tenant failed, and leaves remaining tenants un-migrated (no silent data loss).
7. **Given** the frontend shell, **when** rendered, **then** it uses design
   system tokens (Inter font, brand colours, spacing, border-radius), all
   visible strings come from react-intl, and all interactive elements meet
   WCAG 2.1 AA (keyboard navigation, focus management, ARIA labels, colour
   contrast ≥ 4.5:1).
8. All of the above verified by Playwright E2E tests in CI.

## Edge Cases & Error Handling

| ID    | Scenario                                                                | Expected Behaviour                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EC-01 | API request with no subdomain / unresolvable tenant                     | Return **400 Bad Request** with generic error: "Invalid tenant context". No tenant context is set.                                                                                                                                                                                                                                                                                          |
| EC-02 | API request with unknown tenant slug                                    | Return **400 Bad Request** with the **same** generic error as EC-01: "Invalid tenant context". Do not differentiate between missing and unknown slug — identical responses prevent tenant enumeration. Note: the public `GET /api/tenants/resolve` endpoint always returns **200** `{ exists: true/false }` — the 400 behavior applies only to the authenticated tenant-context middleware. |
| EC-03 | Tenant provisioning: realm creation fails after schema created          | Rollback: drop the created schema. Return error to super admin with specific step that failed.                                                                                                                                                                                                                                                                                              |
| EC-04 | Tenant provisioning: bucket creation fails after schema + realm created | Rollback: delete realm, drop schema. Return error with specific step that failed.                                                                                                                                                                                                                                                                                                           |
| EC-05 | Refresh token expired (max session exceeded)                            | Frontend detects 401 after failed refresh, clears auth store, redirects to login page.                                                                                                                                                                                                                                                                                                      |
| EC-06 | JWKS key rotation while cached key is still in memory                   | Signature verification fails → force-fetch JWKS from Keycloak → retry validation once → fail if still invalid.                                                                                                                                                                                                                                                                              |
| EC-07 | Concurrent requests during tenant context switch                        | AsyncLocalStorage guarantees per-request isolation; no cross-request `search_path` leakage.                                                                                                                                                                                                                                                                                                 |
| EC-08 | Multi-schema migration: tenant 3 of 10 fails                            | Tenants 1-2 are migrated (committed). Tenant 3 is rolled back. Tenants 4-10 are not attempted. Clear report output.                                                                                                                                                                                                                                                                         |

## Non-Functional Requirements

| NFR    | Metric                                        | Target                                                                 |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------- |
| NFR-01 | Login flow (redirect → dashboard)             | < 3s                                                                   |
| NFR-02 | JWT RS256 validation latency                  | < 10ms                                                                 |
| NFR-03 | JWKS cache hit rate after warm-up             | > 99%                                                                  |
| NFR-04 | Cross-tenant data leaks                       | Zero (absolute)                                                        |
| NFR-05 | Tenant provisioning (schema + realm + bucket) | < 30s                                                                  |
| NFR-06 | Multi-schema migration (10 tenants)           | < 60s                                                                  |
| NFR-07 | Shell first contentful paint                  | < 1.5s                                                                 |
| NFR-08 | WCAG 2.1 AA compliance (shell UI)             | All interactive elements pass axe-core audit                           |
| NFR-09 | Brute force protection                        | Keycloak built-in: configurable per realm (max failures, lockout time) |

## Risks

| ID   | Risk                                                        | Impact | Mitigation                                                                                 |
| ---- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| R-01 | Keycloak realm provisioning API complexity / version drift  | HIGH   | Pin Keycloak version, wrap provisioning in idempotent script                               |
| R-02 | JWKS cache invalidation on key rotation                     | MEDIUM | TTL-based cache + forced refresh on signature verification failure                         |
| R-03 | `SET search_path` race conditions under concurrent requests | HIGH   | AsyncLocalStorage per-request + connection pool isolation                                  |
| R-04 | Prisma limitations with dynamic schema switching            | MEDIUM | Evaluate `$queryRawUnsafe` for `SET search_path`, benchmark                                |
| R-05 | react-intl bundle size with many locales                    | LOW    | Lazy-load locale data, start with English only                                             |
| R-06 | Provisioning rollback complexity across 3 systems           | MEDIUM | Sequential execution with compensating actions; each step must be independently reversible |

## Out of Scope

- Custom domain mapping (e.g., `app.acme.com` → tenant). Deferred to a later phase.
- Path-based tenant routing (`plexica.io/acme`). Subdomain-only in Phase 1.
- "Log out of all devices" feature. Current-session logout only in Phase 1.
- Backend rate limiting on login endpoint. Keycloak's built-in brute force detection is sufficient.
- Locales beyond English. i18n infrastructure is in place but additional translations are deferred.
