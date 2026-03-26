# Spec 002: Foundations

**Phase**: 1 — Foundations
**Duration**: 3-4 weeks
**Status**: Draft
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

| ID     | Feature                                                    | E2E Test                                                                         |
| ------ | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 002-01 | Login page with Keycloak redirect (tenant's realm)         | Browser opens login, redirects to correct realm, enters credentials, sees dashboard |
| 002-02 | JWT RS256 validation middleware (JWKS per realm)            | Valid token → 200; no token → 401; wrong realm token → 401                       |
| 002-03 | JWKS caching per realm                                     | Performance: doesn't call Keycloak on every request                              |
| 002-04 | Logout with session invalidation                           | User logs out, previous token no longer works                                    |
| 002-05 | Automatic refresh token                                    | Expired token renewed transparently on frontend                                  |
| 002-06 | Realm discovery from tenant slug                           | URL `acme.plexica.io` → realm `tenant-acme`                                     |

### 2.2 Multi-Tenancy Schema-per-Tenant (1.5 weeks)

| ID     | Feature                                                    | E2E Test                                                                       |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 002-07 | Tenant context middleware (`SET search_path`)               | Request with tenant A sees tenant A data, not tenant B data                    |
| 002-08 | AsyncLocalStorage for tenant context                       | Tenant context available throughout stack without explicit params              |
| 002-09 | Schema creation utility                                    | Utility creates schema + applies core migrations                               |
| 002-10 | Full tenant provisioning                                   | Super admin creates tenant → schema + realm + bucket created → tenant admin logs in |
| 002-11 | Cross-tenant isolation test (critical)                     | User tenant A calls API with resource ID from tenant B → 403/404              |
| 002-12 | Multi-schema migration                                     | Utility applies a migration to all existing tenant schemas                     |

### 2.3 Frontend Shell & Design System (1 week)

| ID     | Feature                                                    | E2E Test                                                              |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| 002-13 | Shell layout with sidebar, header, content area            | Browser opens app, sees professional layout with navigation           |
| 002-14 | Design system applied (Inter font, brand colors, spacing)  | Visual: no monospace, defined colors, consistent border-radius        |
| 002-15 | Dashboard with welcome message                             | User logs in, sees dashboard with their name                          |
| 002-16 | Error boundary at route level                              | Component that throws error doesn't crash entire app                  |
| 002-17 | i18n connected (react-intl, at least English)              | All visible strings come from react-intl message catalog              |
| 002-18 | Single auth store (Zustand)                                | Login/logout/refresh managed by single store                          |
| 002-19 | Single data fetching pattern (TanStack Query)              | All API calls go through useQuery/useMutation                         |

## Acceptance Criteria

1. A user can log in via Keycloak using their tenant's realm, land on their
   tenant dashboard, and see a personalised welcome message.
2. A user in tenant A **cannot** access any data belonging to tenant B —
   verified by a dedicated cross-tenant isolation Playwright test.
3. Logout invalidates the session; the previous JWT is rejected by the API.
4. Token refresh happens transparently — no user-visible re-login during a
   session.
5. Full tenant provisioning (schema + realm + storage bucket) completes via a
   single super-admin action.
6. Multi-schema migration utility applies a migration to every existing tenant
   schema without data loss.
7. Frontend shell renders with design system tokens (Inter font, brand colours,
   spacing, border-radius) and all strings sourced from react-intl.
8. All of the above verified by Playwright E2E tests in CI.

## Non-Functional Requirements

| NFR    | Metric                                          | Target          |
| ------ | ----------------------------------------------- | --------------- |
| NFR-01 | Login flow (redirect → dashboard)               | < 3s            |
| NFR-02 | JWT RS256 validation latency                    | < 10ms          |
| NFR-03 | JWKS cache hit rate after warm-up               | > 99%           |
| NFR-04 | Cross-tenant data leaks                         | Zero (absolute) |
| NFR-05 | Tenant provisioning (schema + realm + bucket)   | < 30s           |
| NFR-06 | Multi-schema migration (10 tenants)             | < 60s           |
| NFR-07 | Shell first contentful paint                    | < 1.5s          |

## Risks

| ID   | Risk                                                            | Impact | Mitigation                                                        |
| ---- | --------------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| R-01 | Keycloak realm provisioning API complexity / version drift      | HIGH   | Pin Keycloak version, wrap provisioning in idempotent script      |
| R-02 | JWKS cache invalidation on key rotation                         | MEDIUM | TTL-based cache + forced refresh on signature verification failure |
| R-03 | `SET search_path` race conditions under concurrent requests     | HIGH   | AsyncLocalStorage per-request + connection pool isolation          |
| R-04 | Prisma limitations with dynamic schema switching                | MEDIUM | Evaluate `$queryRawUnsafe` for `SET search_path`, benchmark       |
| R-05 | react-intl bundle size with many locales                        | LOW    | Lazy-load locale data, start with English only                    |
