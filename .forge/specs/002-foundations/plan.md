# Plan: 002 - Foundations

> Technical implementation plan for Phase 1 — Foundations.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value                                  |
| ------ | -------------------------------------- |
| Status | Draft                                  |
| Author | forge-architect                        |
| Date   | 2026-04-01                             |
| Track  | Epic                                   |
| Spec   | `.forge/specs/002-foundations/spec.md` |

---

## 1. Overview

This plan implements the three foundational pillars of Plexica v2:
multi-realm authentication via Keycloak, schema-per-tenant data isolation
with full tenant provisioning, and the authenticated frontend shell with
design system integration.

**Technical approach**: Build in three parallel-capable tracks — backend
auth middleware + tenant context (1.5 weeks), tenant provisioning with
rollback (1.5 weeks), and frontend shell + auth integration (1 week). The
backend tracks share a common Fastify plugin registration pattern; the
frontend consumes the backend via TanStack Query exclusively.

After this phase, a user can:

1. Navigate to `acme.plexica.io` and be redirected to the correct Keycloak realm
2. Authenticate and land on a personalized dashboard
3. Be provably isolated from other tenants at the database level

**New ADRs required**: None. All foundational decisions (ADR-001 through
ADR-009) cover every technology and pattern used. No new core dependencies
are introduced.

**Upstream dependencies**: Spec 001 (Infrastructure Setup) must be complete —
monorepo, Docker Compose stack, Keycloak realm, PostgreSQL core schema,
design system base tokens, and CI pipeline are all prerequisites.

---

## 2. Data Model

### 2.1 New Tables

No new tables in the `core` schema. The `core.tenants` and
`core.tenant_configs` tables from Spec 001 are sufficient.

#### Tenant Schema Tables (created per-tenant in `tenant_<slug>`)

No tenant-specific tables are introduced in Phase 1. The tenant schema
exists as an empty schema with the `search_path` set correctly. Tenant
tables (workspaces, etc.) are introduced in Spec 003.

### 2.2 Modified Tables

#### core.tenants

| Column         | Change | Before | After                                        |
| -------------- | ------ | ------ | -------------------------------------------- |
| `minio_bucket` | ADD    | —      | `VARCHAR(255)`, nullable, stores bucket name |

This column tracks the MinIO bucket created during provisioning, enabling
rollback if a later step fails.

#### core.tenant_configs

No changes.

### 2.3 Indexes

| Table     | Index Name                 | Columns        | Type   |
| --------- | -------------------------- | -------------- | ------ |
| `tenants` | `tenants_minio_bucket_key` | `minio_bucket` | UNIQUE |

### 2.4 Migrations

1. **`002_add_tenant_minio_bucket`**: Add `minio_bucket` column to `core.tenants` and unique index. Nullable to allow existing rows.

---

## 3. API Endpoints

All endpoints require authentication via Keycloak JWT unless marked as
public. Tenant context is extracted from the subdomain (via `X-Tenant-Slug`
header in dev, subdomain in production).

### 3.1 GET /health

- **Description**: Health check (already exists from Spec 001)
- **Auth**: Public (explicit opt-in per Constitution Security §2)
- **Changes**: None

### 3.2 GET /api/me

- **Description**: Return the authenticated user's profile from the JWT claims
- **Auth**: Required (any role)
- **Tenant context**: Required
- **Request**: No body. JWT Bearer token in `Authorization` header.
- **Response (200)**:
  ```json
  {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Maria",
    "lastName": "Admin",
    "realm": "plexica-acme",
    "roles": ["tenant_admin"]
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------- | --------------------------------- |
  | 401 | `UNAUTHORIZED` | No token or invalid token |
  | 400 | `INVALID_TENANT_CONTEXT` | No tenant slug or unknown slug — same code for both to prevent tenant enumeration (EC-01, EC-02) |
- **FR Ref**: 002-02, 002-06, 002-15

### 3.3 POST /api/admin/tenants (Super Admin Only)

- **Description**: Provision a new tenant (schema + realm + bucket)
- **Auth**: Required, role `super_admin` in master realm
- **Rate Limit**: 5 req/min (prevent accidental mass provisioning)
- **Request**:
  ```json
  {
    "slug": "globex",
    "name": "Globex Corporation",
    "adminEmail": "admin@globex.test"
  }
  ```
- **Response (201)**:
  ```json
  {
    "id": "uuid",
    "slug": "globex",
    "name": "Globex Corporation",
    "status": "active",
    "schemaName": "tenant_globex",
    "keycloakRealm": "plexica-globex",
    "minioBucket": "tenant-globex"
  }
  ```
- **Error Responses**:
  | Status | Code | When |
  | ------ | --------------------- | --------------------------------------- |
  | 400 | `INVALID_SLUG` | Slug fails validation |
  | 400 | `VALIDATION_ERROR` | Missing required fields |
  | 409 | `ALREADY_EXISTS` | Tenant slug already taken |
  | 500 | `PROVISIONING_FAILED` | Step failed, rollback completed |
  | 401 | `UNAUTHORIZED` | No token or not super_admin |
- **FR Ref**: 002-10, EC-03, EC-04

### 3.4 GET /api/tenants/resolve

- **Description**: Resolve a tenant slug to verify it exists (used by frontend before auth redirect)
- **Auth**: Public (explicit opt-in — needed before authentication)
- **Request**: Query param `slug`
- **Response (200)**:
  ```json
  {
    "exists": true
  }
  ```
- **Response (200, not found)**:
  ```json
  {
    "exists": false
  }
  ```
  Note: Always returns 200 to prevent tenant enumeration via status codes.
  The `realm` field is intentionally **not returned** — an unauthenticated caller
  could use it to enumerate valid tenant slugs. The frontend derives the realm name
  via the `toRealmName()` convention (`plexica-<slug>`) without a round-trip.
  See Decision ID-002 in the decision log.
- **Error Responses**:
  | Status | Code | When |
  | ------ | ----------------- | --------------- |
  | 400 | `TENANT_REQUIRED` | No slug param |
- **FR Ref**: 002-06, EC-01, EC-02

### 3.5 POST /api/admin/tenants/migrate-all (Super Admin Only)

- **Description**: Run a migration across all tenant schemas sequentially
- **Auth**: Required, role `super_admin`
- **Request**: No body
- **Response (200)**:
  ```json
  {
    "total": 10,
    "migrated": 10,
    "failed": 0,
    "results": [
      { "slug": "acme", "status": "ok" },
      { "slug": "globex", "status": "ok" }
    ]
  }
  ```
- **Response (207, partial failure)**:
  ```json
  {
    "total": 10,
    "migrated": 2,
    "failed": 1,
    "stoppedAt": "tenant-charlie",
    "results": [
      { "slug": "acme", "status": "ok" },
      { "slug": "beta", "status": "ok" },
      { "slug": "charlie", "status": "failed", "error": "column X already exists" }
    ]
  }
  ```
- **FR Ref**: 002-12, EC-08

---

## 4. Component Design

### 4.1 Auth Middleware (`auth-middleware.ts`)

- **Purpose**: Validate JWT RS256 tokens against the correct Keycloak realm JWKS
- **Location**: `services/core-api/src/middleware/auth-middleware.ts`
- **Responsibilities**:
  - Extract Bearer token from `Authorization` header
  - Decode JWT header to identify the realm (from `iss` claim)
  - Fetch JWKS from the realm's OIDC discovery endpoint
  - Validate signature (RS256) against the realm's public key
  - Validate claims: `exp`, `iss`, `aud`
  - Attach decoded user to Fastify request (`request.user`)
- **Dependencies**: `jose` (JWKS/JWT library), JWKS cache
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ---------------------- | ------------------------- | ----------------------- | ------------------------------------------------ |
  | `authMiddleware` | `FastifyRequest, Reply` | `void` (decorates req) | Fastify preHandler hook |
  | `extractBearerToken` | `string \| undefined` | `string` | Parse Authorization header |
  | `resolveRealmFromToken`| `string` (JWT) | `string` (realm name) | Decode JWT `iss` claim without full verification |
- **FR Ref**: 002-02

### 4.2 JWKS Cache (`jwks-cache.ts`)

- **Purpose**: Cache JWKS key sets per realm to avoid Keycloak calls on every request
- **Location**: `services/core-api/src/middleware/jwks-cache.ts`
- **Responsibilities**:
  - In-memory cache keyed by realm name
  - TTL-based expiry (default: 1 hour, configurable)
  - Force-refresh on signature verification failure (EC-06)
  - Max one concurrent fetch per realm (dedup in-flight requests)
- **Dependencies**: `jose` (createRemoteJWKSet), Redis (optional, for shared cache in multi-instance)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | -------------- | -------------------- | ------------------------ | --------------------------------------- |
  | `getJWKS` | `realmName: string` | `JWKSKeySet` | Return cached or fetch fresh JWKS |
  | `invalidate` | `realmName: string` | `void` | Force removal from cache (for EC-06) |
  | `getCacheStats`| none | `{ hits, misses, size }` | Metrics for monitoring (NFR-03) |
- **FR Ref**: 002-03, EC-06, NFR-02, NFR-03

### 4.3 Tenant Context Middleware (`tenant-context.ts`)

- **Purpose**: Resolve tenant from subdomain, set `search_path`, attach to AsyncLocalStorage
- **Location**: `services/core-api/src/middleware/tenant-context.ts`
- **Responsibilities**:
  - Extract tenant slug from `Host` header subdomain (or `X-Tenant-Slug` header in dev)
  - Validate slug format against `/^[a-z][a-z0-9-]{1,62}$/` before any DB lookup (prevents injection)
  - Look up tenant in `core.tenants` (with in-memory cache, 60s TTL)
  - Validate tenant status is `active`
  - Set PostgreSQL `search_path` to `tenant_<slug>,core,public` via `$queryRawUnsafe`
    (controlled exception to the no-string-interpolation rule: `SET search_path` cannot use
    parameterized queries in PostgreSQL; slug is regex-validated before reaching this point)
  - Store tenant context in AsyncLocalStorage for downstream access
  - Return 400 with `INVALID_TENANT_CONTEXT` for both missing slug (EC-01) and unknown slug (EC-02)
    — identical error code and message to prevent tenant enumeration
- **Super-admin bypass**: Routes registered under `/api/admin/*` apply the auth middleware
  but **skip** this middleware entirely. They operate on the `core` schema directly and
  must **not** have a tenant context. Achieved by registering admin routes in a separate
  Fastify plugin scope that excludes `tenantContextMiddleware` from its hook chain.
- **Dependencies**: AsyncLocalStorage (Node.js built-in), Prisma raw SQL
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------------ | ----------------------- | ---------------- | ----------------------------------------- |
  | `tenantContextMiddleware`| `FastifyRequest, Reply` | `void` | Fastify preHandler hook |
  | `extractTenantSlug` | `FastifyRequest` | `string \| null` | Parse subdomain from Host |
  | `setSearchPath` | `PrismaClient, string` | `void` | Execute `SET search_path` via raw SQL |
- **FR Ref**: 002-07, 002-08, EC-01, EC-02, EC-07

### 4.4 Tenant Context Store (`tenant-context-store.ts`)

- **Purpose**: AsyncLocalStorage wrapper for per-request tenant context
- **Location**: `services/core-api/src/lib/tenant-context-store.ts`
- **Responsibilities**:
  - Expose `getTenantContext()` to retrieve current tenant from any point in the call stack
  - Type-safe context object: `{ tenantId, slug, schemaName, realmName }`
  - Throw clear error if accessed outside a tenant-scoped request
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------- | -------------- | --------------- | ------------------------------------ |
  | `getTenantContext` | none | `TenantContext` | Get current request's tenant context |
  | `runWithTenant` | `context, fn` | `T` | Execute function within tenant scope |
- **FR Ref**: 002-08, EC-07

### 4.5 Tenant Provisioning Service (`tenant-provisioning.ts`)

- **Purpose**: Orchestrate full tenant provisioning with rollback on failure
- **Location**: `services/core-api/src/modules/tenant/tenant-provisioning.ts`
- **Responsibilities**:
  - Step 1: Create PostgreSQL schema (via existing `tenant-schema.ts`)
  - Step 2: Create Keycloak realm with default roles and admin user
  - Step 3: Create MinIO bucket
  - Rollback: if any step fails, undo all completed steps in reverse order
  - Track completed steps for rollback determination
- **Dependencies**: `tenant-schema.ts`, `keycloak-admin.ts`, `minio-client.ts`
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------- | ----------------------------------- | ------------------------ | ------------------------------ |
  | `provisionTenant` | `{ slug, name, adminEmail }` | `ProvisioningResult` | Full provisioning with rollback|
  | `rollbackSteps` | `CompletedStep[]` | `RollbackResult` | Reverse completed steps |
- **FR Ref**: 002-10, EC-03, EC-04, NFR-05

### 4.6 Keycloak Admin Client (`keycloak-admin.ts`)

- **Purpose**: Interact with Keycloak Admin REST API for realm provisioning
- **Location**: `services/core-api/src/lib/keycloak-admin.ts`
- **Responsibilities**:
  - Obtain admin token from master realm
  - Create tenant realm with default config
  - Create default roles (`tenant_admin`, `member`)
  - Create `plexica-web` client in new realm
  - Create initial admin user
  - Delete realm (for rollback)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | --------------- | ------------------------------- | ------------------- | ---------------------------- |
  | `createRealm` | `{ realmName, adminEmail }` | `void` | Create realm with defaults |
  | `deleteRealm` | `realmName: string` | `void` | Delete realm (rollback) |
  | `getAdminToken` | none | `string` | Auth against master realm |
- **FR Ref**: 002-10, EC-03, R-01

### 4.7 MinIO Client (`minio-client.ts`)

- **Purpose**: Create and manage per-tenant MinIO buckets
- **Location**: `services/core-api/src/lib/minio-client.ts`
- **Responsibilities**:
  - Create bucket named `tenant-<slug>`
  - Set bucket policy (private by default)
  - Delete bucket and contents (for rollback)
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | -------------- | ----------------- | -------- | ------------------------ |
  | `createBucket` | `bucketName` | `void` | Create S3-compatible bucket |
  | `deleteBucket` | `bucketName` | `void` | Remove bucket (rollback) |
- **FR Ref**: 002-10, EC-04

### 4.8 Multi-Schema Migration Runner (`multi-schema-migrate.ts`)

- **Purpose**: Apply Prisma migrations across all tenant schemas sequentially
- **Location**: `services/core-api/src/lib/multi-schema-migrate.ts`
- **Responsibilities**:
  - Query `core.tenants` for all active tenants
  - For each tenant, set `search_path` and run `prisma migrate deploy`
  - Stop on first failure (EC-08)
  - Return a detailed report of which tenants succeeded/failed
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | -------------- | ---------- | ------------------- | ------------------------------------ |
  | `migrateAll` | none | `MigrationReport` | Sequential migration with fail-fast |
- **FR Ref**: 002-12, EC-08, NFR-06

### 4.9 Error Handler Plugin (`error-handler.ts`)

- **Purpose**: Centralized Fastify error handler with structured responses
- **Location**: `services/core-api/src/middleware/error-handler.ts`
- **Responsibilities**:
  - Map application errors to HTTP status codes
  - Structured JSON error responses: `{ error: { code, message } }`
  - Never expose PII or stack traces in responses (Constitution Security §6)
  - Log full error details server-side via Pino
- **FR Ref**: EC-01, EC-02, EC-03, EC-04

### 4.10 Frontend: Auth Store (`auth-store.ts`)

- **Purpose**: Single Zustand store for authentication state (Constitution Rule 3)
- **Location**: `apps/web/src/stores/auth-store.ts`
- **Responsibilities**:
  - Store access token, refresh token, user profile
  - Expose `login()` — redirect to Keycloak
  - Expose `logout()` — clear tokens, redirect to Keycloak logout
  - Expose `refreshToken()` — exchange refresh token for new access token
  - Expose `isAuthenticated` computed state
  - Handle token expiry detection and auto-refresh
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | -------------- | ---------- | --------- | ---------------------------------- |
  | `login` | none | `void` | Redirect to Keycloak login |
  | `logout` | none | `void` | Clear state, Keycloak logout |
  | `refreshToken` | none | `boolean` | Attempt silent refresh |
  | `handleCallback` | `code` | `void` | Exchange auth code for tokens |
- **FR Ref**: 002-01, 002-04, 002-05, 002-18, EC-05

### 4.11 Frontend: Keycloak Auth Service (`keycloak-auth.ts`)

- **Purpose**: Encapsulate Keycloak OIDC protocol interactions
- **Location**: `apps/web/src/services/keycloak-auth.ts`
- **Responsibilities**:
  - Build Keycloak authorization URL with correct realm
  - Exchange authorization code for tokens (token endpoint)
  - Exchange refresh token for new access token
  - Build Keycloak logout URL
  - OIDC discovery for realm endpoints
- **Key Methods**:
  | Method | Parameters | Returns | Description |
  | ------------------ | ----------------- | ---------------- | -------------------------------- |
  | `getLoginUrl` | `realm, state` | `string` | Build OIDC auth URL |
  | `exchangeCode` | `code, realm` | `TokenResponse` | POST to token endpoint |
  | `refreshTokens` | `refreshToken` | `TokenResponse` | Exchange refresh token |
  | `getLogoutUrl` | `realm, idToken` | `string` | Build Keycloak logout URL |
- **FR Ref**: 002-01, 002-04, 002-05

### 4.12 Frontend: Tenant Resolver (`tenant-resolver.ts`)

- **Purpose**: Extract tenant slug from current subdomain and resolve realm
- **Location**: `apps/web/src/services/tenant-resolver.ts`
- **Responsibilities**:
  - Parse `window.location.hostname` to extract subdomain
  - Call `GET /api/tenants/resolve` to validate tenant and get realm
  - Handle missing/invalid subdomain → show Organization Error Page
- **FR Ref**: 002-06, EC-01, EC-02

### 4.13 Frontend: API Client (`api-client.ts`)

- **Purpose**: Configured fetch wrapper that attaches auth token and tenant context
- **Location**: `apps/web/src/services/api-client.ts`
- **Responsibilities**:
  - Attach `Authorization: Bearer <token>` from auth store
  - Attach `X-Tenant-Slug` header (dev mode)
  - Intercept 401 responses → attempt refresh → redirect to login on failure
  - Base URL configuration
- **FR Ref**: 002-02, 002-05, EC-05

### 4.14 Frontend: AppShell Component (`app-shell.tsx`)

- **Purpose**: Main authenticated layout — sidebar, header, content area
- **Location**: `apps/web/src/components/layout/app-shell.tsx`
- **Responsibilities**:
  - Render `<Header>` + `<Sidebar>` + `<main>` layout
  - Responsive: sidebar collapses at 768px, becomes drawer at 375px
  - Provide `children` slot for route content
  - Skip-to-content link as first focusable element
- **FR Ref**: 002-13, 002-14, 002-20

### 4.15 Frontend: Sidebar Component (`sidebar.tsx`)

- **Purpose**: Navigation sidebar with expanded/collapsed/drawer variants
- **Location**: `apps/web/src/components/layout/sidebar.tsx`
- **Responsibilities**:
  - Render nav items with Lucide icons
  - Expanded (240px), collapsed (64px icon-only), drawer (mobile overlay)
  - Active item highlighting via TanStack Router match
  - Focus trap when in drawer mode
  - `aria-current="page"` on active item
- **FR Ref**: 002-13, 002-20

### 4.16 Frontend: Header Component (`header.tsx`)

- **Purpose**: Top navigation bar with user menu, breadcrumb, and placeholders
- **Location**: `apps/web/src/components/layout/header.tsx`
- **Responsibilities**:
  - Hamburger toggle for sidebar
  - Breadcrumb display
  - Search placeholder (deferred)
  - User avatar + dropdown menu with logout
- **FR Ref**: 002-13, 002-04

### 4.17 Frontend: Dashboard Page (`dashboard-page.tsx`)

- **Purpose**: Default authenticated landing page with welcome message
- **Location**: `apps/web/src/pages/dashboard-page.tsx`
- **Responsibilities**:
  - Personalized welcome: "Welcome back, {firstName}"
  - Quick stat cards (placeholder data in Phase 1)
  - Recent activity section (empty state for new tenants)
  - All data fetched via TanStack Query
  - Skeleton loaders during data fetch
- **FR Ref**: 002-15, 002-19

### 4.18 Frontend: Organization Error Page (`org-error-page.tsx`)

- **Purpose**: Error page for missing/unknown tenant subdomain
- **Location**: `apps/web/src/pages/org-error-page.tsx`
- **Responsibilities**:
  - "Organization not found" for unknown tenants
  - "Which organization?" for missing subdomain
  - No information leakage about valid tenants
  - Contact administrator link
- **FR Ref**: 002-06, EC-01, EC-02

### 4.19 Frontend: Auth Callback Page (`auth-callback-page.tsx`)

- **Purpose**: Handle Keycloak redirect back with auth code
- **Location**: `apps/web/src/pages/auth-callback-page.tsx`
- **Responsibilities**:
  - Show "Signing you in..." with spinner
  - Exchange auth code for tokens
  - On success: store tokens, redirect to dashboard
  - On failure: show error with "Back to Login" link
- **FR Ref**: 002-01, 002-02

### 4.20 Frontend: Error Boundary (`route-error-boundary.tsx`)

- **Purpose**: Catch route-level React errors without crashing the shell
- **Location**: `apps/web/src/components/error/route-error-boundary.tsx`
- **Responsibilities**:
  - React error boundary at route level
  - Show fallback UI with "Go to Dashboard" and "Refresh" actions
  - Shell (sidebar + header) remains functional
  - `role="alert"` on error content
- **FR Ref**: 002-16

### 4.21 Frontend: Session Expired Toast (`session-expired-handler.tsx`)

- **Purpose**: Show warning toast when refresh token fails, then redirect
- **Location**: `apps/web/src/components/auth/session-expired-handler.tsx`
- **Responsibilities**:
  - Listen to auth store for `sessionExpired` event
  - Show warning toast: "Your session has expired. Redirecting to sign-in..."
  - Auto-redirect to Keycloak login after 5 seconds (gives user time to read the toast)
- **FR Ref**: 002-04, 002-05, EC-05

---

## 5. File Map

> All paths relative to project root.

### Files to Create

| Path                                                                            | Purpose                                             | Size |
| ------------------------------------------------------------------------------- | --------------------------------------------------- | ---- |
| **Backend — Middleware**                                                        |                                                     |      |
| `services/core-api/src/middleware/auth-middleware.ts`                           | JWT RS256 validation via Keycloak JWKS              | M    |
| `services/core-api/src/middleware/jwks-cache.ts`                                | Per-realm JWKS caching with TTL + forced refresh    | M    |
| `services/core-api/src/middleware/tenant-context.ts`                            | Subdomain → tenant resolution + `SET search_path`   | M    |
| `services/core-api/src/middleware/error-handler.ts`                             | Centralized Fastify error handler                   | S    |
| **Backend — Libs**                                                              |                                                     |      |
| `services/core-api/src/lib/tenant-context-store.ts`                             | AsyncLocalStorage wrapper for tenant context        | S    |
| `services/core-api/src/lib/keycloak-admin.ts`                                   | Keycloak Admin REST API client                      | M    |
| `services/core-api/src/lib/minio-client.ts`                                     | MinIO bucket creation/deletion                      | S    |
| `services/core-api/src/lib/multi-schema-migrate.ts`                             | Sequential migration runner across tenant schemas   | M    |
| `services/core-api/src/lib/app-error.ts`                                        | Typed application error classes                     | S    |
| **Backend — Modules**                                                           |                                                     |      |
| `services/core-api/src/modules/tenant/tenant-provisioning.ts`                   | Full provisioning orchestrator with rollback        | M    |
| `services/core-api/src/modules/tenant/tenant-routes.ts`                         | Tenant API routes (resolve, provision, migrate-all) | M    |
| `services/core-api/src/modules/user/user-routes.ts`                             | User API routes (GET /api/me)                       | S    |
| **Backend — Migration**                                                         |                                                     |      |
| `services/core-api/prisma/migrations/002_add_tenant_minio_bucket/migration.sql` | Add `minio_bucket` column to tenants                | S    |
| **Frontend — Services**                                                         |                                                     |      |
| `apps/web/src/services/keycloak-auth.ts`                                        | Keycloak OIDC protocol interactions                 | M    |
| `apps/web/src/services/tenant-resolver.ts`                                      | Subdomain parsing + tenant validation               | S    |
| `apps/web/src/services/api-client.ts`                                           | Fetch wrapper with auth + tenant headers            | M    |
| **Frontend — Stores**                                                           |                                                     |      |
| `apps/web/src/stores/auth-store.ts`                                             | Zustand auth state (tokens, user, login/logout)     | M    |
| **Frontend — Layout Components**                                                |                                                     |      |
| `apps/web/src/components/layout/app-shell.tsx`                                  | Shell layout: sidebar + header + content            | M    |
| `apps/web/src/components/layout/sidebar.tsx`                                    | Nav sidebar (expanded/collapsed/drawer)             | M    |
| `apps/web/src/components/layout/sidebar-nav-item.tsx`                           | Individual sidebar nav item                         | S    |
| `apps/web/src/components/layout/header.tsx`                                     | Top header bar with user menu                       | M    |
| `apps/web/src/components/layout/user-menu.tsx`                                  | Avatar dropdown with logout (Radix DropdownMenu)    | S    |
| `apps/web/src/components/layout/avatar.tsx`                                     | User avatar with initials fallback                  | S    |
| `apps/web/src/components/layout/skip-link.tsx`                                  | Skip-to-content accessibility link                  | S    |
| `apps/web/src/components/layout/breadcrumb.tsx`                                 | Breadcrumb navigation                               | S    |
| **Frontend — Feedback Components**                                              |                                                     |      |
| `apps/web/src/components/feedback/skeleton-loader.tsx`                          | Skeleton loading states                             | S    |
| `apps/web/src/components/feedback/empty-state.tsx`                              | Empty state with icon, heading, description         | S    |
| `apps/web/src/components/error/route-error-boundary.tsx`                        | Route-level error boundary                          | M    |
| `apps/web/src/components/error/error-fallback.tsx`                              | Error boundary fallback UI                          | S    |
| `apps/web/src/components/auth/session-expired-handler.tsx`                      | Session expired toast + redirect                    | S    |
| `apps/web/src/components/auth/auth-guard.tsx`                                   | Route guard that redirects unauthenticated users    | S    |
| **Frontend — Pages**                                                            |                                                     |      |
| `apps/web/src/pages/dashboard-page.tsx`                                         | Dashboard with welcome message + stat cards         | M    |
| `apps/web/src/pages/org-error-page.tsx`                                         | Organization not found / missing subdomain          | S    |
| `apps/web/src/pages/auth-callback-page.tsx`                                     | Keycloak callback handler (code exchange)           | S    |
| **Frontend — Router**                                                           |                                                     |      |
| `apps/web/src/router.tsx`                                                       | TanStack Router configuration with routes           | M    |
| **Frontend — Hooks**                                                            |                                                     |      |
| `apps/web/src/hooks/use-current-user.ts`                                        | TanStack Query hook for GET /api/me                 | S    |
| **Frontend — Types**                                                            |                                                     |      |
| `apps/web/src/types/auth.ts`                                                    | Auth-related TypeScript types                       | S    |
| `apps/web/src/types/tenant.ts`                                                  | Tenant-related TypeScript types                     | S    |
| **Tests — Backend Integration**                                                 |                                                     |      |
| `services/core-api/src/__tests__/auth-middleware.test.ts`                       | JWT validation with real Keycloak tokens            | M    |
| `services/core-api/src/__tests__/tenant-context.test.ts`                        | Tenant resolution + search_path isolation           | M    |
| `services/core-api/src/__tests__/tenant-provisioning.test.ts`                   | Full provisioning + rollback scenarios              | L    |
| `services/core-api/src/__tests__/cross-tenant-isolation.test.ts`                | Cross-tenant data isolation proof (critical)        | M    |
| `services/core-api/src/__tests__/multi-schema-migrate.test.ts`                  | Multi-schema migration with fail-fast               | M    |
| `services/core-api/src/__tests__/user-routes.test.ts`                           | GET /api/me with valid/invalid tokens               | S    |
| **Tests — E2E**                                                                 |                                                     |      |
| `apps/web/e2e/login-flow.spec.ts`                                               | Full login flow: subdomain → Keycloak → dashboard   | L    |
| `apps/web/e2e/logout.spec.ts`                                                   | Logout invalidates session                          | M    |
| `apps/web/e2e/org-error.spec.ts`                                                | Organization error page for bad subdomains          | S    |
| `apps/web/e2e/cross-tenant.spec.ts`                                             | Cross-tenant isolation E2E proof                    | M    |
| `apps/web/e2e/shell-a11y.spec.ts`                                               | WCAG 2.1 AA audit of shell layout                   | M    |
| `apps/web/e2e/error-boundary.spec.ts`                                           | Error boundary recovery test                        | S    |

### Files to Modify

| Path                                         | Change Description                                                                              | Effort |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------ |
| `services/core-api/src/index.ts`             | Register auth, tenant-context, error-handler middleware; register tenant and user route modules | M      |
| `services/core-api/src/lib/config.ts`        | Add JWKS cache TTL config, Keycloak realm prefix config                                         | S      |
| `services/core-api/src/lib/tenant-schema.ts` | Add MinIO bucket field to tenant creation; integrate with provisioning service                  | S      |
| `services/core-api/prisma/schema.prisma`     | Add `minio_bucket` column to `Tenant` model                                                     | S      |
| `apps/web/src/main.tsx`                      | Add TanStack Router, TanStack Query provider, Toast provider, auth initialization               | M      |
| `apps/web/src/app.tsx`                       | Replace login placeholder with router outlet + app shell                                        | M      |
| `apps/web/src/i18n/messages.en.ts`           | Add all new i18n message keys for shell, dashboard, errors                                      | M      |
| `apps/web/vite.config.ts`                    | Add API proxy configuration for dev server                                                      | S      |
| `apps/web/package.json`                      | Add new dependencies (TanStack Query, Zustand, jose)                                            | S      |
| `services/core-api/package.json`             | Add `jose` dependency                                                                           | S      |
| `packages/ui/src/index.ts`                   | Export new DropdownMenu component (if adding for UserMenu)                                      | S      |

### Files to Delete

| Path                                | Reason                                             | Migration Notes                             |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| `apps/web/src/pages/login-page.tsx` | Replaced by Keycloak redirect + auth callback page | Login now handled by Keycloak external page |

### Files to Reference (Read-only)

| Path                                                   | Purpose                            |
| ------------------------------------------------------ | ---------------------------------- |
| `.forge/constitution.md`                               | Validate architectural decisions   |
| `.forge/knowledge/adr/adr-001-schema-per-tenant.md`    | Schema-per-tenant pattern          |
| `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md` | Keycloak realm-per-tenant          |
| `.forge/specs/002-foundations/design-spec.md`          | Wireframes and component inventory |
| `.forge/specs/002-foundations/user-journey.md`         | User flows and edge cases          |

---

## 6. Dependencies

### 6.1 New Dependencies

#### `services/core-api`

| Package | Version | Purpose                                                                |
| ------- | ------- | ---------------------------------------------------------------------- |
| `jose`  | ^6.0    | JWT RS256 validation + JWKS fetching (zero-dependency, Web Crypto API) |

Note: `jose` is the industry-standard JWT library for Node.js. It uses
Web Crypto API natively (no `jsonwebtoken` + `jwks-rsa` bloat). This is
not a new "core dependency" per Constitution — it's a required capability
for the auth middleware prescribed by ADR-002.

#### `apps/web`

| Package                           | Version | Purpose                                                   |
| --------------------------------- | ------- | --------------------------------------------------------- |
| `@tanstack/react-query`           | latest  | Data fetching (Constitution Rule 3 — already in stack)    |
| `zustand`                         | latest  | Auth state store (Constitution Rule 3 — already in stack) |
| `@radix-ui/react-dropdown-menu`   | latest  | UserMenu component (Radix UI — already in stack)          |
| `@radix-ui/react-avatar`          | latest  | Avatar component (Radix UI — already in stack)            |
| `@radix-ui/react-navigation-menu` | latest  | Sidebar navigation (Radix UI — already in stack)          |

All frontend additions are from the prescribed stack (TanStack Query,
Zustand, Radix UI). No ADR required.

### 6.2 Internal Dependencies

- `apps/web` → `packages/ui` (design system — existing)
- `services/core-api` → Keycloak Admin REST API (external service — existing)
- `services/core-api` → MinIO SDK (existing dependency)
- `services/core-api` → Prisma client (existing dependency)

---

## 7. Implementation Phases

### Phase 1: Backend Auth Middleware (3-4 days)

**Objective**: JWT RS256 validation against Keycloak realms with JWKS caching.

**Files to Create**:

- `services/core-api/src/middleware/auth-middleware.ts` — JWT validation hook
- `services/core-api/src/middleware/jwks-cache.ts` — Per-realm JWKS cache
- `services/core-api/src/lib/app-error.ts` — Typed error classes
- `services/core-api/src/middleware/error-handler.ts` — Centralized error handler
- `services/core-api/src/modules/user/user-routes.ts` — GET /api/me endpoint
- `services/core-api/src/__tests__/auth-middleware.test.ts` — Integration tests

**Files to Modify**:

- `services/core-api/src/index.ts` — Register middleware and routes
- `services/core-api/src/lib/config.ts` — Add JWKS TTL config
- `services/core-api/package.json` — Add `jose`

**Tasks**:

1. [ ] Install `jose` package
2. [ ] Implement `app-error.ts` with typed error codes (UNAUTHORIZED, TENANT_REQUIRED, etc.)
3. [ ] Implement `error-handler.ts` Fastify plugin — map AppError → HTTP response
4. [ ] Implement `jwks-cache.ts` — in-memory cache with TTL, forced refresh on verification failure
5. [ ] Implement `auth-middleware.ts` — extract token, resolve realm, validate RS256 signature
6. [ ] Implement `user-routes.ts` — GET /api/me returning JWT claims
7. [ ] Register all middleware in `index.ts` (error handler → auth → routes)
8. [ ] Write integration tests using real Keycloak tokens (not mocks)
9. [ ] Verify: valid token → 200; no token → 401; wrong realm → 401 (002-02)
10. [ ] Verify: JWKS cache hit rate measurable (NFR-03)

**Verification**: `pnpm --filter core-api test` — auth tests pass against real Keycloak.

**Estimated effort**: 3-4 days

### Phase 2: Tenant Context Middleware (2-3 days)

**Objective**: Per-request tenant isolation via AsyncLocalStorage + `SET search_path`.

**Depends on**: Phase 1 (auth middleware must run before tenant context)

**Files to Create**:

- `services/core-api/src/lib/tenant-context-store.ts` — AsyncLocalStorage wrapper
- `services/core-api/src/middleware/tenant-context.ts` — Tenant resolution + search_path
- `services/core-api/src/__tests__/tenant-context.test.ts` — Isolation tests
- `services/core-api/src/__tests__/cross-tenant-isolation.test.ts` — Critical cross-tenant proof

**Files to Modify**:

- `services/core-api/src/index.ts` — Register tenant context middleware after auth

**Tasks**:

1. [ ] Implement `tenant-context-store.ts` — AsyncLocalStorage with typed context
2. [ ] Implement `tenant-context.ts` — extract slug from Host, lookup tenant, SET search_path
3. [ ] Add tenant lookup caching (in-memory, 60s TTL) to avoid DB hit per request
4. [ ] Register tenant context middleware in `index.ts` (runs after auth)
5. [ ] Write cross-tenant isolation test: user A cannot see user B's data (002-11)
6. [ ] Write concurrent request test: verify AsyncLocalStorage isolation (EC-07)
7. [ ] Test edge cases: no subdomain → 400 (EC-01), unknown tenant → 400 (EC-02)

**Verification**: Cross-tenant isolation test passes — request for tenant A resource with tenant B context returns 404.

**Estimated effort**: 2-3 days

### Phase 3: Tenant Provisioning Service (3-4 days)

**Objective**: Full tenant provisioning (schema + realm + bucket) with rollback.

**Depends on**: Phase 2 (tenant context must work for testing)

**Files to Create**:

- `services/core-api/src/lib/keycloak-admin.ts` — Keycloak Admin API client
- `services/core-api/src/lib/minio-client.ts` — MinIO bucket management
- `services/core-api/src/lib/multi-schema-migrate.ts` — Multi-schema migration runner
- `services/core-api/src/modules/tenant/tenant-provisioning.ts` — Provisioning orchestrator
- `services/core-api/src/modules/tenant/tenant-routes.ts` — API routes
- `services/core-api/prisma/migrations/002_add_tenant_minio_bucket/migration.sql` — Schema change
- `services/core-api/src/__tests__/tenant-provisioning.test.ts` — Full provisioning tests
- `services/core-api/src/__tests__/multi-schema-migrate.test.ts` — Migration tests

**Files to Modify**:

- `services/core-api/prisma/schema.prisma` — Add `minioBucket` to Tenant model
- `services/core-api/src/lib/tenant-schema.ts` — Update to work with provisioning service
- `services/core-api/src/index.ts` — Register tenant routes

**Tasks**:

1. [ ] Add `minio_bucket` column migration and update Prisma schema
2. [ ] Run `prisma migrate dev` to generate migration
3. [ ] Implement `keycloak-admin.ts` — create/delete realm, create roles, create client, create user
4. [ ] Implement `minio-client.ts` — create/delete bucket with private policy
5. [ ] Implement `tenant-provisioning.ts` — orchestrate 3 steps with tracked rollback
6. [ ] Implement rollback logic: if step 2 fails → drop schema; if step 3 fails → delete realm + drop schema
7. [ ] Implement `tenant-routes.ts` — POST /api/admin/tenants, GET /api/tenants/resolve, POST /api/admin/tenants/migrate-all
8. [ ] Implement `multi-schema-migrate.ts` — sequential migration with fail-fast
9. [ ] Test happy path: provision tenant → schema + realm + bucket all exist
10. [ ] Test rollback: mock realm creation failure → verify schema dropped (EC-03)
11. [ ] Test rollback: mock bucket creation failure → verify realm deleted + schema dropped (EC-04)
12. [ ] Test multi-schema migration: 3 tenants, fail on 2nd → tenants 1 migrated, 3 not attempted (EC-08)
13. [ ] Test GET /api/tenants/resolve — exists → { exists: true, realm }, not exists → { exists: false }

**Verification**: All provisioning and rollback tests pass against real Keycloak, PostgreSQL, and MinIO.

**Estimated effort**: 3-4 days

### Phase 4: Frontend Auth Integration (3-4 days)

**Objective**: Keycloak OIDC login/logout/refresh flow in the React app.

**Depends on**: Phase 1 (backend auth middleware), Phase 2 (tenant context)

**Files to Create**:

- `apps/web/src/services/keycloak-auth.ts` — OIDC protocol client
- `apps/web/src/services/tenant-resolver.ts` — Subdomain parsing + validation
- `apps/web/src/services/api-client.ts` — Auth-aware fetch wrapper
- `apps/web/src/stores/auth-store.ts` — Zustand auth store
- `apps/web/src/pages/auth-callback-page.tsx` — Keycloak callback handler
- `apps/web/src/pages/org-error-page.tsx` — Organization error page
- `apps/web/src/components/auth/auth-guard.tsx` — Route guard
- `apps/web/src/components/auth/session-expired-handler.tsx` — Session expired toast
- `apps/web/src/hooks/use-current-user.ts` — TanStack Query hook for /api/me
- `apps/web/src/types/auth.ts` — Auth types
- `apps/web/src/types/tenant.ts` — Tenant types
- `apps/web/src/router.tsx` — TanStack Router configuration

**Files to Modify**:

- `apps/web/src/main.tsx` — Add QueryClientProvider, Router, ToastProvider
- `apps/web/src/app.tsx` — Replace login placeholder with router outlet
- `apps/web/src/i18n/messages.en.ts` — Add auth-related messages
- `apps/web/vite.config.ts` — Add API proxy for dev server
- `apps/web/package.json` — Add TanStack Query, Zustand, Radix DropdownMenu

**Files to Delete**:

- `apps/web/src/pages/login-page.tsx` — Replaced by Keycloak redirect

**Tasks**:

1. [ ] Install new dependencies (TanStack Query, Zustand, Radix DropdownMenu, Radix Avatar)
2. [ ] Implement `tenant-resolver.ts` — parse subdomain, call /api/tenants/resolve
3. [ ] Implement `keycloak-auth.ts` — build auth URL, exchange code, refresh, logout
4. [ ] Implement `auth-store.ts` — Zustand store with login/logout/refresh/handleCallback
5. [ ] Implement `api-client.ts` — fetch wrapper with token injection + 401 interception
6. [ ] Implement `auth-callback-page.tsx` — code exchange with loading/error states
7. [ ] Implement `org-error-page.tsx` — two variants: no subdomain, unknown tenant
8. [ ] Implement `auth-guard.tsx` — redirect unauthenticated users to Keycloak
9. [ ] Implement `session-expired-handler.tsx` — toast + 3s auto-redirect
10. [ ] Implement `router.tsx` — TanStack Router with public/auth routes
11. [ ] Update `main.tsx` — wrap with QueryClientProvider, RouterProvider, ToastProvider
12. [ ] Update `app.tsx` — route-based rendering
13. [ ] Add Vite dev proxy: `/api` → `http://localhost:3001`
14. [ ] Add all i18n messages for auth flow
15. [ ] Delete old `login-page.tsx`

**Verification**: Navigate to `localhost:3000` with tenant subdomain → redirects to Keycloak → login → see auth callback → redirect to app.

**Estimated effort**: 3-4 days

### Phase 5: Frontend Shell & Dashboard (3-4 days)

**Objective**: Authenticated shell layout with sidebar, header, dashboard, and design system integration.

**Depends on**: Phase 4 (auth must work for authenticated shell)

**Files to Create**:

- `apps/web/src/components/layout/app-shell.tsx` — Shell layout
- `apps/web/src/components/layout/sidebar.tsx` — Nav sidebar
- `apps/web/src/components/layout/sidebar-nav-item.tsx` — Nav item
- `apps/web/src/components/layout/header.tsx` — Top header
- `apps/web/src/components/layout/user-menu.tsx` — User dropdown
- `apps/web/src/components/layout/avatar.tsx` — Avatar with initials fallback
- `apps/web/src/components/layout/skip-link.tsx` — Skip-to-content
- `apps/web/src/components/layout/breadcrumb.tsx` — Breadcrumb
- `apps/web/src/components/feedback/skeleton-loader.tsx` — Skeleton loading
- `apps/web/src/components/feedback/empty-state.tsx` — Empty state
- `apps/web/src/components/error/route-error-boundary.tsx` — Error boundary
- `apps/web/src/components/error/error-fallback.tsx` — Error fallback UI
- `apps/web/src/pages/dashboard-page.tsx` — Dashboard page
- `apps/web/src/hooks/use-current-user.ts` — (if not already created in Phase 4)

**Files to Modify**:

- `apps/web/src/router.tsx` — Add dashboard route wrapped in AppShell
- `apps/web/src/i18n/messages.en.ts` — Add dashboard and shell messages
- `packages/ui/src/index.ts` — Export DropdownMenu if needed

**Tasks**:

1. [ ] Implement `skip-link.tsx` — "Skip to main content" link
2. [ ] Implement `avatar.tsx` — circular image with initials fallback (Radix Avatar)
3. [ ] Implement `user-menu.tsx` — Radix DropdownMenu with name, email, logout
4. [ ] Implement `breadcrumb.tsx` — simple breadcrumb from route data
5. [ ] Implement `header.tsx` — compose hamburger, breadcrumb, search placeholder, user menu
6. [ ] Implement `sidebar-nav-item.tsx` — individual nav link with icon, label, active state
7. [ ] Implement `sidebar.tsx` — expanded/collapsed/drawer with focus trap on mobile
8. [ ] Implement `app-shell.tsx` — compose header + sidebar + main content slot
9. [ ] Implement `skeleton-loader.tsx` — text, card, circle variants with `prefers-reduced-motion`
10. [ ] Implement `empty-state.tsx` — icon + heading + description + optional CTA
11. [ ] Implement `route-error-boundary.tsx` — React error boundary wrapping route content
12. [ ] Implement `error-fallback.tsx` — "Something went wrong" with Dashboard + Refresh CTAs
13. [ ] Implement `dashboard-page.tsx` — welcome message, stat card skeletons, empty activity
14. [ ] Wire dashboard into router with AppShell layout and error boundary
15. [ ] Verify all interactive elements have WCAG 2.1 AA compliance
16. [ ] Verify responsive breakpoints: 1440px, 1024px, 768px, 375px

**Verification**: Authenticated user sees full shell with sidebar, header, personalized dashboard. All elements keyboard-navigable with visible focus indicators.

**Estimated effort**: 3-4 days

### Phase 6: E2E Tests (2-3 days)

**Objective**: Full Playwright E2E test suite covering all user-facing features.

**Depends on**: All previous phases

**Files to Create**:

- `apps/web/e2e/login-flow.spec.ts` — Full login: subdomain → Keycloak → dashboard
- `apps/web/e2e/logout.spec.ts` — Logout + token invalidation
- `apps/web/e2e/org-error.spec.ts` — Organization error pages
- `apps/web/e2e/cross-tenant.spec.ts` — Cross-tenant isolation via browser
- `apps/web/e2e/shell-a11y.spec.ts` — WCAG 2.1 AA audit (axe-core)
- `apps/web/e2e/error-boundary.spec.ts` — Error boundary recovery

**Tasks**:

1. [ ] Configure Playwright for multi-subdomain testing (use `localhost` with headers or custom DNS)
2. [ ] Write login flow E2E: navigate to tenant subdomain → Keycloak login → dashboard with user name
3. [ ] Write logout E2E: logout → token rejected → redirected to login
4. [ ] Write org error E2E: invalid subdomain → error page; no subdomain → "which org" page
5. [ ] Write cross-tenant E2E: login as tenant A, attempt to access tenant B resource → 404
6. [ ] Write shell a11y E2E: run axe-core audit on dashboard, verify 0 violations
7. [ ] Write error boundary E2E: trigger error → fallback UI → "Go to Dashboard" recovers
8. [ ] Verify all tests pass in CI with Docker Compose stack

**Verification**: `pnpm --filter web test:e2e` — all E2E tests pass.

**Estimated effort**: 2-3 days

### Implementation Order Summary

```
Phase 1 (Auth Middleware)
    │
    ├── Phase 2 (Tenant Context) ─── Phase 3 (Tenant Provisioning)
    │                                          │
    └── Phase 4 (Frontend Auth) ──── Phase 5 (Shell + Dashboard)
                                               │
                                    Phase 6 (E2E Tests)
```

**Critical path**: Phase 1 → Phase 2 → Phase 3 → Phase 6

**Parallel tracks**:

- Track A: Phases 1 → 2 → 3 (backend)
- Track B: Phases 1 → 4 → 5 (frontend — can start once Phase 1 provides the auth endpoint)
- Merge: Phase 6 (depends on both tracks)

**Total estimated effort**: 3-4 weeks (as specified in the spec)

---

## 8. Testing Strategy

### 8.1 Unit Tests (Vitest)

| Component                       | Test Focus                                         |
| ------------------------------- | -------------------------------------------------- |
| `tenant-context-store.ts`       | Context get/set, error when outside scope          |
| `jwks-cache.ts`                 | TTL expiry, forced refresh, concurrent fetch dedup |
| `app-error.ts`                  | Error code mapping, serialization                  |
| `tenant-schema-helpers.ts`      | Slug validation edge cases (existing, extend)      |
| `keycloak-auth.ts` (frontend)   | URL construction, token parsing                    |
| `tenant-resolver.ts` (frontend) | Subdomain parsing for various hostname formats     |
| `auth-store.ts` (frontend)      | State transitions: login → authenticated → logout  |

### 8.2 Integration Tests (Vitest — Real Services)

| Scenario                                           | Dependencies                         | FR Ref         |
| -------------------------------------------------- | ------------------------------------ | -------------- |
| JWT RS256 validation with real Keycloak token      | Keycloak (real)                      | 002-02         |
| JWT with wrong realm → 401                         | Keycloak (real)                      | 002-02         |
| Tenant resolution + search_path SET                | PostgreSQL (real)                    | 002-07, 002-08 |
| Cross-tenant data isolation (CRITICAL)             | PostgreSQL (real)                    | 002-11, NFR-04 |
| Concurrent requests with AsyncLocalStorage         | PostgreSQL (real)                    | EC-07          |
| Full tenant provisioning (schema + realm + bucket) | PostgreSQL + Keycloak + MinIO (real) | 002-10         |
| Provisioning rollback: realm creation fails        | PostgreSQL + Keycloak (real)         | EC-03          |
| Provisioning rollback: bucket creation fails       | All services (real)                  | EC-04          |
| Multi-schema migration with fail-fast              | PostgreSQL (real)                    | 002-12, EC-08  |
| GET /api/me with valid token                       | All middleware (real)                | 002-02, 002-15 |
| GET /api/tenants/resolve                           | PostgreSQL (real)                    | 002-06         |

### 8.3 E2E Tests (Playwright — Full Stack)

| Test File                | What It Proves                        | FR Ref                         |
| ------------------------ | ------------------------------------- | ------------------------------ |
| `login-flow.spec.ts`     | Full login → dashboard with user name | 002-01, 002-02, 002-06, 002-15 |
| `logout.spec.ts`         | Logout invalidates session            | 002-04                         |
| `org-error.spec.ts`      | Bad subdomain → error page            | EC-01, EC-02                   |
| `cross-tenant.spec.ts`   | Tenant A cannot see tenant B data     | 002-11, NFR-04                 |
| `shell-a11y.spec.ts`     | WCAG 2.1 AA compliance                | 002-20, NFR-08                 |
| `error-boundary.spec.ts` | Error boundary recovery               | 002-16                         |

### 8.4 What Is NOT Mocked

Per Constitution ("tests that ran against mocks instead of real services"
was a v1 failure):

- **Keycloak**: Real tokens, real JWKS, real realm API
- **PostgreSQL**: Real schema creation, real `SET search_path`
- **MinIO**: Real bucket creation/deletion
- **No `isTestToken`**: Zero code paths differ between test and production

---

## 9. Architectural Decisions

| ADR     | Decision                           | Relevance to This Spec                               |
| ------- | ---------------------------------- | ---------------------------------------------------- |
| ADR-001 | Schema-per-tenant PostgreSQL       | Tenant context middleware, search_path, provisioning |
| ADR-002 | Keycloak multi-realm               | Auth middleware, JWKS cache, realm provisioning      |
| ADR-008 | TypeScript-first, polyglot plugins | All implementation files in TypeScript               |
| ADR-009 | Better Auth rejected → Keycloak    | Confirms Keycloak as the only identity provider      |

> **Note**: ADR-003 (Fastify modular architecture) and ADR-007 (Prisma as ORM with raw SQL escape hatch)
> are foundational decisions recorded in `.forge/knowledge/decision-log.md` and not yet
> in standalone ADR files. They are referenced as DL-003 and DL-007 respectively in the decision log.

**New ADRs needed**: None. The `jose` library is a capability requirement
(JWT validation) for an already-accepted architectural decision (ADR-002),
not a new core dependency.

---

## 10. Requirement Traceability

| Requirement | Plan Section        | Implementation Files                                               | Test Files                                               |
| ----------- | ------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| 002-01      | §4.10, §4.11        | `auth-store.ts`, `keycloak-auth.ts`, `auth-callback-page.tsx`      | `login-flow.spec.ts`                                     |
| 002-02      | §4.1, §4.2          | `auth-middleware.ts`, `jwks-cache.ts`                              | `auth-middleware.test.ts`, `login-flow.spec.ts`          |
| 002-03      | §4.2                | `jwks-cache.ts`                                                    | `auth-middleware.test.ts`                                |
| 002-04      | §4.10, §4.21        | `auth-store.ts`, `session-expired-handler.tsx`, `user-menu.tsx`    | `logout.spec.ts`                                         |
| 002-05      | §4.10, §4.11        | `auth-store.ts`, `keycloak-auth.ts`, `session-expired-handler.tsx` | `login-flow.spec.ts`                                     |
| 002-06      | §4.12, §3.4         | `tenant-resolver.ts`, `tenant-routes.ts`                           | `org-error.spec.ts`, `login-flow.spec.ts`                |
| 002-07      | §4.3                | `tenant-context.ts`                                                | `tenant-context.test.ts`                                 |
| 002-08      | §4.3, §4.4          | `tenant-context.ts`, `tenant-context-store.ts`                     | `tenant-context.test.ts`                                 |
| 002-09      | §4.5                | `tenant-schema.ts` (existing), `tenant-provisioning.ts`            | `tenant-provisioning.test.ts`                            |
| 002-10      | §4.5, §4.6, §4.7    | `tenant-provisioning.ts`, `keycloak-admin.ts`, `minio-client.ts`   | `tenant-provisioning.test.ts`                            |
| 002-11      | §4.3                | `tenant-context.ts`                                                | `cross-tenant-isolation.test.ts`, `cross-tenant.spec.ts` |
| 002-12      | §4.8, §3.5          | `multi-schema-migrate.ts`, `tenant-routes.ts`                      | `multi-schema-migrate.test.ts`                           |
| 002-13      | §4.14, §4.15, §4.16 | `app-shell.tsx`, `sidebar.tsx`, `header.tsx`                       | `shell-a11y.spec.ts`, `login-flow.spec.ts`               |
| 002-14      | §4.14               | `app-shell.tsx` + design tokens                                    | `shell-a11y.spec.ts`                                     |
| 002-15      | §4.17, §3.2         | `dashboard-page.tsx`, `user-routes.ts`                             | `login-flow.spec.ts`                                     |
| 002-16      | §4.20               | `route-error-boundary.tsx`, `error-fallback.tsx`                   | `error-boundary.spec.ts`                                 |
| 002-17      | §4.17               | `messages.en.ts` (extended), all components                        | `shell-a11y.spec.ts`                                     |
| 002-18      | §4.10               | `auth-store.ts` (Zustand)                                          | `login-flow.spec.ts`                                     |
| 002-19      | §4.17               | `dashboard-page.tsx` (TanStack Query)                              | `login-flow.spec.ts`                                     |
| 002-20      | §4.14, §4.15        | `app-shell.tsx`, `sidebar.tsx`, `skip-link.tsx`                    | `shell-a11y.spec.ts`                                     |
| NFR-01      | §4.11               | `keycloak-auth.ts`                                                 | `login-flow.spec.ts` (timing assertion)                  |
| NFR-02      | §4.2                | `jwks-cache.ts`                                                    | `auth-middleware.test.ts` (timing assertion)             |
| NFR-03      | §4.2                | `jwks-cache.ts` (getCacheStats)                                    | `auth-middleware.test.ts`                                |
| NFR-04      | §4.3                | `tenant-context.ts`                                                | `cross-tenant-isolation.test.ts`, `cross-tenant.spec.ts` |
| NFR-05      | §4.5                | `tenant-provisioning.ts`                                           | `tenant-provisioning.test.ts` (timing assertion)         |
| NFR-06      | §4.8                | `multi-schema-migrate.ts`                                          | `multi-schema-migrate.test.ts` (timing assertion)        |
| NFR-07      | §4.14               | `app-shell.tsx` + Vite build                                       | `login-flow.spec.ts` (FCP measurement)                   |
| NFR-08      | §4.14, §4.15        | All shell components                                               | `shell-a11y.spec.ts` (axe-core)                          |
| NFR-09      | —                   | Keycloak built-in (realm config)                                   | Not platform code — Keycloak-managed                     |
| EC-01       | §4.3, §4.18         | `tenant-context.ts`, `org-error-page.tsx`                          | `org-error.spec.ts`                                      |
| EC-02       | §4.3, §4.18         | `tenant-context.ts`, `org-error-page.tsx`                          | `org-error.spec.ts`                                      |
| EC-03       | §4.5                | `tenant-provisioning.ts` (rollback)                                | `tenant-provisioning.test.ts`                            |
| EC-04       | §4.5                | `tenant-provisioning.ts` (rollback)                                | `tenant-provisioning.test.ts`                            |
| EC-05       | §4.10, §4.21        | `auth-store.ts`, `session-expired-handler.tsx`                     | `login-flow.spec.ts` (session expiry scenario)           |
| EC-06       | §4.2                | `jwks-cache.ts` (forced refresh)                                   | `auth-middleware.test.ts`                                |
| EC-07       | §4.4                | `tenant-context-store.ts` (AsyncLocalStorage)                      | `tenant-context.test.ts`                                 |
| EC-08       | §4.8                | `multi-schema-migrate.ts` (stop on first failure)                  | `multi-schema-migrate.test.ts`                           |

---

## 11. Constitution Compliance

### Overall Status: COMPLIANT

| Article                        | Status    | Notes                                                                                                                                                                                                                                      |
| ------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rule 1: E2E tests              | COMPLIANT | 6 Playwright E2E tests cover every user-facing feature: login, logout, org error, cross-tenant isolation, shell a11y, error boundary                                                                                                       |
| Rule 2: Green CI               | COMPLIANT | All tests (unit, integration, E2E) run in CI. No skip flags.                                                                                                                                                                               |
| Rule 3: One pattern per type   | COMPLIANT | TanStack Query for all data fetching (§4.17). Zustand for auth state only (§4.10). react-intl for all strings (§4.17). Radix UI for all primitives.                                                                                        |
| Rule 4: 200-line limit         | COMPLIANT | All components designed as individual files. Largest expected file is ~150 lines (tenant-provisioning.ts with rollback logic).                                                                                                             |
| Rule 5: ADR for arch decisions | COMPLIANT | No new architectural decisions. All patterns follow ADR-001 through ADR-009.                                                                                                                                                               |
| Rule 6: English commits        | COMPLIANT | All commit messages will be in English.                                                                                                                                                                                                    |
| Technology Stack               | COMPLIANT | Backend: Fastify ^5, Prisma ^6, `jose` for JWT (standard library, not a competing framework). Frontend: React ^19, TanStack Router, TanStack Query, Zustand, Tailwind CSS, Radix UI.                                                       |
| Architecture                   | COMPLIANT | Schema-per-tenant (ADR-001), Keycloak multi-realm (ADR-002), Fastify monolith (ADR-003). Tenant context via AsyncLocalStorage + SET search_path as prescribed.                                                                             |
| Security                       | COMPLIANT | Keycloak on every endpoint (public endpoints explicitly marked). Parameterized queries only (search_path via raw SQL with regex-validated schema name). Zod validation on all inputs. No PII in logs (Pino redaction). No secrets in code. |
| Quality: Coverage              | COMPLIANT | >= 80% line coverage target. 100% API endpoint coverage via integration tests. 100% user flows via E2E.                                                                                                                                    |
| Quality: WCAG 2.1 AA           | COMPLIANT | All shell components have ARIA attributes, keyboard navigation, focus management, color contrast verification. axe-core E2E audit.                                                                                                         |
| Quality: File size             | COMPLIANT | No file exceeds 200 lines. Components decomposed per design-spec component inventory.                                                                                                                                                      |

### Findings

No non-compliant findings.

### Tensions

None identified. The plan follows all prescribed patterns and technologies.

### Amendments Applied

- Rule 6 (English commits): Applied — all commit messages in English.

---

## Risk Register

| ID   | Risk                                                        | Impact | Likelihood | Mitigation                                                                                             |
| ---- | ----------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| R-01 | Keycloak realm provisioning API complexity / version drift  | HIGH   | MEDIUM     | Pin Keycloak 26+, wrap in idempotent functions, comprehensive error handling                           |
| R-02 | JWKS cache invalidation on key rotation                     | MEDIUM | LOW        | TTL-based + forced refresh on verification failure (EC-06). Max 1 retry.                               |
| R-03 | `SET search_path` race conditions under concurrent requests | HIGH   | LOW        | AsyncLocalStorage guarantees per-request isolation. Integration test proves this.                      |
| R-04 | Prisma limitations with dynamic schema switching            | MEDIUM | MEDIUM     | Use `$queryRawUnsafe` for `SET search_path`. Benchmark at 100 concurrent requests.                     |
| R-05 | Provisioning rollback complexity across 3 systems           | MEDIUM | MEDIUM     | Sequential execution, tracked completed steps, each step independently reversible                      |
| R-06 | Frontend auth state complexity (OIDC + refresh flow)        | MEDIUM | MEDIUM     | Single Zustand store, clear state machine (unauthenticated → authenticating → authenticated → expired) |

---

## Cross-References

| Document      | Path                                                   |
| ------------- | ------------------------------------------------------ |
| Spec          | `.forge/specs/002-foundations/spec.md`                 |
| Design Spec   | `.forge/specs/002-foundations/design-spec.md`          |
| User Journeys | `.forge/specs/002-foundations/user-journey.md`         |
| Constitution  | `.forge/constitution.md`                               |
| ADR-001       | `.forge/knowledge/adr/adr-001-schema-per-tenant.md`    |
| ADR-002       | `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md` |
| Spec 001 Plan | `.forge/specs/001-infrastructure-setup/plan.md`        |
| Decision Log  | `.forge/knowledge/decision-log.md`                     |
| Tasks         | _Created by `/forge-tasks`_                            |
