# Tasks: 002 - Foundations

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.

| Field  | Value                                  |
| ------ | -------------------------------------- |
| Status | Pending                                |
| Author | forge-scrum                            |
| Date   | 2026-04-01                             |
| Spec   | `.forge/specs/002-foundations/spec.md` |
| Plan   | `.forge/specs/002-foundations/plan.md` |

---

## Legend

- `[002-NN]` — Functional requirement from spec (feature ID)
- `[NFR-NN]` — Non-functional requirement from spec
- `[EC-NN]` — Edge case / error handling requirement
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Size: `[S]` < 30 min · `[M]` 30 min–2 h · `[L]` 2–4 h · `[XL]` 4+ h
- Status: `[ ]` pending · `[x]` done · `[-]` skipped

---

## Phase 1: Foundation — Shared Types, Config & Migration

> Pre-requisites for all backend work. No inter-dependencies; all tasks
> in this phase can be executed in parallel.

- [ ] **1.1** `[S]` `[002-07]` `[P]` Add `minio_bucket` column migration
  - **File**: `services/core-api/prisma/migrations/002_add_tenant_minio_bucket/migration.sql`
  - **Type**: Create new file
  - **Description**: SQL migration that adds `minio_bucket VARCHAR(255) NULLABLE` column to `core.tenants` plus a `UNIQUE` index `tenants_minio_bucket_key`. Nullable so existing rows are not affected.
  - **Spec Reference**: Plan §2.4 (Migrations)
  - **Dependencies**: None
  - **Estimated**: 15 min

- [ ] **1.2** `[S]` `[002-07]` `[P]` Update Prisma schema for `minio_bucket`
  - **File**: `services/core-api/prisma/schema.prisma`
  - **Type**: Modify existing
  - **Location**: `Tenant` model definition
  - **Description**: Add `minioBucket String? @unique @map("minio_bucket")` field to the `Tenant` model to match the migration above.
  - **Spec Reference**: Plan §2.2 (Modified Tables)
  - **Dependencies**: Task 1.1
  - **Estimated**: 10 min

- [ ] **1.3** `[S]` `[002-02]` `[EC-01]` `[EC-02]` `[P]` Implement typed application error classes
  - **File**: `services/core-api/src/lib/app-error.ts`
  - **Type**: Create new file
  - **Description**: `AppError` base class and typed subclasses for all error codes: `UNAUTHORIZED`, `INVALID_TENANT_CONTEXT`, `INVALID_SLUG`, `VALIDATION_ERROR`, `ALREADY_EXISTS`, `PROVISIONING_FAILED`, `TENANT_REQUIRED`. Each carries HTTP status code + error code string + message.
  - **Spec Reference**: Plan §4.9; spec EC-01, EC-02
  - **Dependencies**: None
  - **Estimated**: 20 min

- [ ] **1.4** `[S]` `[002-03]` `[P]` Extend config with JWKS TTL + realm-prefix settings
  - **File**: `services/core-api/src/lib/config.ts`
  - **Type**: Modify existing
  - **Location**: Existing config export
  - **Description**: Add `JWKS_CACHE_TTL_MS` (default 3600000 / 1 hour) and `KEYCLOAK_REALM_PREFIX` (default `"plexica-"`) to the validated environment config (Zod schema).
  - **Spec Reference**: Plan §4.2 (JWKS Cache); plan §7 Phase 1 config step
  - **Dependencies**: None
  - **Estimated**: 15 min

- [ ] **1.5** `[S]` `[002-10]` `[P]` Add `jose` and frontend dependencies to package manifests
  - **File**: `services/core-api/package.json` · `apps/web/package.json`
  - **Type**: Modify existing
  - **Description**: Add `jose ^6.0` to `core-api`. Add `@tanstack/react-query latest`, `zustand latest`, `@radix-ui/react-dropdown-menu latest`, `@radix-ui/react-avatar latest`, `@radix-ui/react-navigation-menu latest` to `apps/web`. Run `pnpm install`.
  - **Spec Reference**: Plan §6.1 (New Dependencies)
  - **Dependencies**: None
  - **Estimated**: 15 min

- [ ] **1.6** `[S]` `[002-09]` `[P]` Define shared TypeScript types — auth & tenant
  - **File**: `apps/web/src/types/auth.ts` · `apps/web/src/types/tenant.ts`
  - **Type**: Create new files
  - **Description**: `auth.ts` — `TokenResponse`, `UserProfile`, `AuthState`. `tenant.ts` — `TenantContext`, `TenantResolveResponse`. These are pure type files; no runtime logic.
  - **Spec Reference**: Plan §4.10 (auth-store key methods), §4.12 (tenant-resolver)
  - **Dependencies**: None
  - **Estimated**: 20 min

---

## Phase 2: Backend Auth Middleware

> JWT validation + JWKS caching. Depends on Phase 1 typed errors and config.

- [ ] **2.1** `[M]` `[002-03]` `[NFR-02]` `[NFR-03]` `[EC-06]` Implement JWKS cache
  - **File**: `services/core-api/src/middleware/jwks-cache.ts`
  - **Type**: Create new file
  - **Description**: In-memory cache keyed by realm name. TTL expiry (reads `JWKS_CACHE_TTL_MS` from config). `getJWKS(realmName)` fetches from Keycloak OIDC discovery if cache misses. `invalidate(realmName)` forces removal for EC-06 key-rotation retry. `getCacheStats()` returns `{ hits, misses, size }` for NFR-03 monitoring. Uses `jose` `createRemoteJWKSet`. Deduplicates concurrent in-flight fetches for the same realm.
  - **Spec Reference**: Plan §4.2
  - **Dependencies**: Tasks 1.4, 1.5 (config + jose)
  - **Estimated**: 60 min

- [ ] **2.2** `[M]` `[002-02]` `[EC-06]` Implement auth middleware
  - **File**: `services/core-api/src/middleware/auth-middleware.ts`
  - **Type**: Create new file
  - **Description**: Fastify `preHandler` hook. Extracts Bearer token, decodes JWT header to identify realm via `iss` claim, calls `jwksCache.getJWKS(realm)`, validates RS256 signature + `exp` + `iss` + `aud` claims using `jose` `jwtVerify`. On signature failure: invalidate cache entry and retry once (EC-06). Attaches decoded user to `request.user`. Returns `UNAUTHORIZED` (401) on any failure.
  - **Spec Reference**: Plan §4.1
  - **Dependencies**: Tasks 2.1, 1.3 (JWKS cache + AppError)
  - **Estimated**: 90 min

- [ ] **2.3** `[S]` `[EC-01]` `[EC-02]` Implement centralized error handler plugin
  - **File**: `services/core-api/src/middleware/error-handler.ts`
  - **Type**: Create new file
  - **Description**: Fastify `setErrorHandler` plugin. Maps `AppError` subclasses to their HTTP status codes. All responses use `{ error: { code, message } }` shape. Never exposes stack traces or PII in response. Logs full error detail via Pino at appropriate level.
  - **Spec Reference**: Plan §4.9
  - **Dependencies**: Task 1.3 (AppError)
  - **Estimated**: 25 min

- [ ] **2.4** `[S]` `[002-02]` `[002-15]` Implement `GET /api/me` route
  - **File**: `services/core-api/src/modules/user/user-routes.ts`
  - **Type**: Create new file
  - **Description**: Fastify plugin registering `GET /api/me`. Reads `request.user` (set by auth middleware) and returns `{ id, email, firstName, lastName, realm, roles }`. Protected by auth middleware; responds 401 if no valid token, 400 with `INVALID_TENANT_CONTEXT` if tenant context is missing.
  - **Spec Reference**: Plan §3.2
  - **Dependencies**: Task 2.2 (auth middleware sets `request.user`)
  - **Estimated**: 20 min

- [ ] **2.5** `[S]` `[002-02]` Register auth middleware, error handler and user routes in app entry
  - **File**: `services/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Location**: Plugin registration section
  - **Description**: Register `errorHandlerPlugin` first (catches errors from all subsequent plugins), then `authMiddleware` as a preHandler on authenticated scopes, then `userRoutes`. Admin routes are in a separate scope that bypasses tenant context (see Task 4.5).
  - **Spec Reference**: Plan §7 Phase 1; plan §4.3 super-admin bypass
  - **Dependencies**: Tasks 2.2, 2.3, 2.4
  - **Estimated**: 20 min

- [ ] **2.6** `[S]` `[002-09]` Run Prisma migration for `minio_bucket` column
  - **File**: CLI step (no source file)
  - **Type**: Command
  - **Description**: Run `pnpm --filter core-api prisma migrate dev --name 002_add_tenant_minio_bucket` to apply the migration from Task 1.1 and regenerate the Prisma client.
  - **Spec Reference**: Plan §2.4
  - **Dependencies**: Tasks 1.1, 1.2
  - **Estimated**: 10 min

---

## Phase 3: Tenant Context Middleware

> Per-request isolation via AsyncLocalStorage + `SET search_path`.
> Depends on Phase 2 (auth middleware runs before tenant context).

- [ ] **3.1** `[S]` `[002-08]` `[EC-07]` Implement AsyncLocalStorage tenant context store
  - **File**: `services/core-api/src/lib/tenant-context-store.ts`
  - **Type**: Create new file
  - **Description**: Thin wrapper around Node.js `AsyncLocalStorage`. Exposes `getTenantContext(): TenantContext` (throws a clear `AppError` if called outside a tenant scope) and `runWithTenant(context, fn)` to execute a function within a tenant scope. Type: `TenantContext = { tenantId, slug, schemaName, realmName }`.
  - **Spec Reference**: Plan §4.4
  - **Dependencies**: Task 1.3 (AppError)
  - **Estimated**: 25 min

- [ ] **3.2** `[M]` `[002-07]` `[002-08]` `[EC-01]` `[EC-02]` `[EC-07]` Implement tenant context middleware
  - **File**: `services/core-api/src/middleware/tenant-context.ts`
  - **Type**: Create new file
  - **Description**: Fastify `preHandler` hook. Extracts tenant slug from `Host` header subdomain (or `X-Tenant-Slug` in dev). Validates format against `/^[a-z][a-z0-9-]{1,62}$/` before any DB lookup (injection prevention — ID-001 from decision log). Looks up tenant in `core.tenants` with an in-memory cache (60s TTL). Validates tenant status is `active`. Executes `SET search_path TO tenant_<slug>,core,public` via `$queryRawUnsafe` (controlled exception per ID-001). Stores result in `tenantContextStore`. Returns 400 `INVALID_TENANT_CONTEXT` for both missing subdomain (EC-01) and unknown slug (EC-02) — same generic code to prevent tenant enumeration (ID-002 from decision log).
  - **Spec Reference**: Plan §4.3; decision log ID-001, ID-002
  - **Dependencies**: Tasks 3.1, 2.2, 1.3 (store + auth + errors)
  - **Estimated**: 90 min

- [ ] **3.3** `[S]` `[002-07]` `[002-08]` Register tenant context middleware in app entry
  - **File**: `services/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Location**: Plugin registration after auth middleware
  - **Description**: Register `tenantContextMiddleware` as a preHandler on the tenant-scoped route scope. Admin routes (`/api/admin/*`) are in a separate Fastify plugin scope that does NOT include this middleware (ID-003 from decision log).
  - **Spec Reference**: Plan §4.3 (super-admin bypass); decision log ID-003
  - **Dependencies**: Tasks 3.2, 2.5
  - **Estimated**: 15 min

---

## Phase 4: Tenant Provisioning Service

> Full tenant lifecycle (schema + realm + bucket) with rollback.
> Can run in parallel with Phase 5 (frontend auth) once Phase 3 is done.

- [ ] **4.1** `[S]` `[002-10]` `[P]` Update `tenant-schema.ts` for provisioning integration
  - **File**: `services/core-api/src/lib/tenant-schema.ts`
  - **Type**: Modify existing
  - **Location**: Tenant creation logic
  - **Description**: Update schema creation to accept and persist the `minio_bucket` field on the `core.tenants` row. Ensure the function is idempotent and returns structured errors for rollback consumption.
  - **Spec Reference**: Plan §5 (Files to Modify — tenant-schema.ts)
  - **Dependencies**: Task 2.6 (Prisma client regenerated with new field)
  - **Estimated**: 20 min

- [ ] **4.2** `[M]` `[002-10]` `[EC-03]` `[P]` Implement Keycloak Admin REST client
  - **File**: `services/core-api/src/lib/keycloak-admin.ts`
  - **Type**: Create new file
  - **Description**: Client wrapping Keycloak Admin REST API. `getAdminToken()` — authenticates against master realm. `createRealm({ realmName, adminEmail })` — creates tenant realm with default roles (`tenant_admin`, `member`), creates `plexica-web` OIDC client, creates initial admin user. `deleteRealm(realmName)` — deletes realm for rollback (EC-03). Uses `fetch` with master-realm admin token; token cached for its `expires_in` window.
  - **Spec Reference**: Plan §4.6
  - **Dependencies**: Task 1.3 (AppError for structured error propagation)
  - **Estimated**: 90 min

- [ ] **4.3** `[S]` `[002-10]` `[EC-04]` `[P]` Implement MinIO bucket client
  - **File**: `services/core-api/src/lib/minio-client.ts`
  - **Type**: Create new file
  - **Description**: Thin wrapper around the existing MinIO SDK dependency. `createBucket(bucketName)` — creates `tenant-<slug>` bucket with private (no public access) policy. `deleteBucket(bucketName)` — removes bucket and all objects for rollback (EC-04).
  - **Spec Reference**: Plan §4.7
  - **Dependencies**: Task 1.3
  - **Estimated**: 30 min

- [ ] **4.4** `[M]` `[002-10]` `[EC-03]` `[EC-04]` `[NFR-05]` Implement tenant provisioning orchestrator
  - **File**: `services/core-api/src/modules/tenant/tenant-provisioning.ts`
  - **Type**: Create new file
  - **Description**: Orchestrates the 3-step provisioning flow with tracked rollback. Step 1: create PostgreSQL schema (via `tenant-schema.ts`). Step 2: create Keycloak realm (via `keycloak-admin.ts`). Step 3: create MinIO bucket (via `minio-client.ts`). Tracks each completed step. On any failure, executes compensating actions in reverse order: Step 3 fails → delete bucket; Step 2 fails → delete realm; Step 1 fails → drop schema. Returns `ProvisioningResult` on success or a structured `ProvisioningError` with the step that failed.
  - **Spec Reference**: Plan §4.5; spec EC-03, EC-04, NFR-05
  - **Dependencies**: Tasks 4.1, 4.2, 4.3
  - **Estimated**: 90 min

- [ ] **4.5** `[M]` `[002-06]` `[002-10]` `[002-12]` Implement tenant API routes
  - **File**: `services/core-api/src/modules/tenant/tenant-routes.ts`
  - **Type**: Create new file
  - **Description**: Fastify plugin registering three routes. (1) `GET /api/tenants/resolve?slug=…` — public endpoint; always returns HTTP 200 with `{ exists: true, realm }` or `{ exists: false }` to prevent enumeration. (2) `POST /api/admin/tenants` — super_admin only; validates slug + name + adminEmail with Zod; calls provisioning service; rate-limited to 5 req/min. (3) `POST /api/admin/tenants/migrate-all` — super_admin only; calls `multi-schema-migrate.ts`; returns 200 or 207. Admin routes registered in a scope without `tenantContextMiddleware` (per ID-003).
  - **Spec Reference**: Plan §3.3, §3.4, §3.5; decision log ID-003
  - **Dependencies**: Tasks 4.4, 4.6 (provisioning + migration runner)
  - **Estimated**: 90 min

- [ ] **4.6** `[M]` `[002-12]` `[EC-08]` `[NFR-06]` Implement multi-schema migration runner
  - **File**: `services/core-api/src/lib/multi-schema-migrate.ts`
  - **Type**: Create new file
  - **Description**: `migrateAll()` — queries `core.tenants` for all active tenants, iterates in order, sets `search_path` per tenant, runs `prisma migrate deploy` (or equivalent raw migration). Stops on first failure (EC-08). Returns `MigrationReport` with per-tenant status entries and `stoppedAt` field if partial. Tenants migrated before the failure remain committed; remaining tenants are not attempted.
  - **Spec Reference**: Plan §4.8; spec 002-12, EC-08, NFR-06
  - **Dependencies**: Task 3.2 (tenant context + search_path mechanism)
  - **Estimated**: 90 min

- [ ] **4.7** `[S]` `[002-10]` `[002-12]` Register tenant routes in app entry
  - **File**: `services/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Location**: Route registration section
  - **Description**: Register `tenantRoutes` plugin. The public `/api/tenants/resolve` sub-route must be registered before the auth preHandler. Admin routes (`/api/admin/tenants`) registered in a separate scope with only auth middleware (no tenant context middleware).
  - **Spec Reference**: Plan §7 Phase 3; plan §4.3 bypass note
  - **Dependencies**: Task 4.5
  - **Estimated**: 15 min

---

## Phase 5: Frontend Auth Integration

> Keycloak OIDC flow in React. Can run in parallel with Phase 4 once
> Phase 3 backend is stable (i.e., `/api/tenants/resolve` and `/api/me`
> are up).

- [ ] **5.1** `[S]` `[002-06]` `[P]` Implement tenant resolver service
  - **File**: `apps/web/src/services/tenant-resolver.ts`
  - **Type**: Create new file
  - **Description**: `resolveTenant()` — parses `window.location.hostname` to extract subdomain, calls `GET /api/tenants/resolve?slug=…`, returns `{ slug, realm }` on success. Throws a typed error for missing subdomain (no subdomain) or `{ exists: false }` (unknown tenant) — both used by the router to redirect to `OrgErrorPage`.
  - **Spec Reference**: Plan §4.12; spec EC-01, EC-02
  - **Dependencies**: Tasks 1.5, 1.6 (deps installed + types defined)
  - **Estimated**: 30 min

- [ ] **5.2** `[M]` `[002-01]` `[002-04]` `[002-05]` `[P]` Implement Keycloak OIDC auth service
  - **File**: `apps/web/src/services/keycloak-auth.ts`
  - **Type**: Create new file
  - **Description**: `getLoginUrl(realm, state)` — builds the Keycloak authorization URL (OIDC `code` flow) with correct `redirect_uri` and PKCE challenge. `exchangeCode(code, realm)` — POSTs to the token endpoint to exchange the authorization code. `refreshTokens(refreshToken)` — exchanges refresh token for new token set. `getLogoutUrl(realm, idToken)` — builds Keycloak logout URL that invalidates current session only (002-04). Uses OIDC discovery document (`.well-known/openid-configuration`) to resolve endpoints.
  - **Spec Reference**: Plan §4.11
  - **Dependencies**: Tasks 1.5, 1.6 (deps + types)
  - **Estimated**: 90 min

- [ ] **5.3** `[S]` `[002-02]` `[002-05]` `[EC-05]` `[P]` Implement API client
  - **File**: `apps/web/src/services/api-client.ts`
  - **Type**: Create new file
  - **Description**: Configured `fetch` wrapper. Attaches `Authorization: Bearer <token>` from auth store. Attaches `X-Tenant-Slug` header (dev mode only). Intercepts 401 responses: attempts token refresh via auth store; if refresh fails, triggers `sessionExpired` event and redirects to login (EC-05). Base URL from env (`VITE_API_URL`).
  - **Spec Reference**: Plan §4.13
  - **Dependencies**: Tasks 1.5, 1.6
  - **Estimated**: 45 min

- [ ] **5.4** `[M]` `[002-01]` `[002-04]` `[002-05]` `[002-18]` `[EC-05]` Implement Zustand auth store
  - **File**: `apps/web/src/stores/auth-store.ts`
  - **Type**: Create new file
  - **Description**: Single Zustand store managing the auth state machine: `unauthenticated → authenticating → authenticated → expired`. Stores `accessToken`, `refreshToken`, `userProfile`. Exposes `login()` (redirects to Keycloak via `keycloakAuth.getLoginUrl`), `logout()` (clears state + calls `keycloakAuth.getLogoutUrl` + redirects), `handleCallback(code)` (exchanges code for tokens, stores, marks `authenticated`), `refreshToken()` (silent refresh, sets `expired` on failure and emits `sessionExpired`), `isAuthenticated` computed getter.
  - **Spec Reference**: Plan §4.10
  - **Dependencies**: Tasks 5.2, 5.3
  - **Estimated**: 90 min

- [ ] **5.5** `[S]` `[002-01]` `[002-06]` Configure TanStack Router
  - **File**: `apps/web/src/router.tsx`
  - **Type**: Create new file
  - **Description**: TanStack Router config with route tree: root loader calls `tenantResolver.resolveTenant()` (redirects to `/org-error` on failure); public routes (`/callback`, `/org-error`); authenticated routes wrapped in `AuthGuard` and `AppShell` (added in Phase 6). Export `Router` type for type-safe link hooks.
  - **Spec Reference**: Plan §4.12; plan §7 Phase 4
  - **Dependencies**: Tasks 5.1, 5.4 (resolver + auth store)
  - **Estimated**: 60 min

- [ ] **5.6** `[S]` `[002-01]` `[002-02]` Implement auth callback page
  - **File**: `apps/web/src/pages/auth-callback-page.tsx`
  - **Type**: Create new file
  - **Description**: Rendered at `/callback`. Shows "Signing you in…" spinner while calling `authStore.handleCallback(code)`. On success: navigate to `/dashboard`. On error: show error message with "Back to Login" link. All strings via `react-intl`.
  - **Spec Reference**: Plan §4.19
  - **Dependencies**: Tasks 5.4, 5.5
  - **Estimated**: 30 min

- [ ] **5.7** `[S]` `[002-06]` `[EC-01]` `[EC-02]` Implement organization error page
  - **File**: `apps/web/src/pages/org-error-page.tsx`
  - **Type**: Create new file
  - **Description**: Two variants controlled by a URL param or resolved state: (1) "Organization not found" for unknown tenant slug; (2) "Which organization are you from?" for missing subdomain. No information about valid tenants is exposed. Contact administrator link. All strings via `react-intl`.
  - **Spec Reference**: Plan §4.18
  - **Dependencies**: Tasks 5.5, 1.6
  - **Estimated**: 30 min

- [ ] **5.8** `[S]` `[002-01]` `[002-18]` Implement auth guard
  - **File**: `apps/web/src/components/auth/auth-guard.tsx`
  - **Type**: Create new file
  - **Description**: Route guard component (or TanStack Router `beforeLoad` hook). Checks `authStore.isAuthenticated`. If false, calls `authStore.login()` to redirect to Keycloak. Renders `children` only when authenticated.
  - **Spec Reference**: Plan §7 Phase 4 (auth-guard)
  - **Dependencies**: Task 5.4
  - **Estimated**: 20 min

- [ ] **5.9** `[S]` `[002-04]` `[002-05]` `[EC-05]` Implement session expired handler
  - **File**: `apps/web/src/components/auth/session-expired-handler.tsx`
  - **Type**: Create new file
  - **Description**: Subscribes to the `sessionExpired` event from auth store. Shows a toast: "Your session has expired. Redirecting to sign-in…". Auto-redirects to Keycloak login after 5 seconds (plan §4.21 says 5 s; original plan task says 3 s — use 5 s per component spec). All strings via `react-intl`.
  - **Spec Reference**: Plan §4.21
  - **Dependencies**: Tasks 5.4
  - **Estimated**: 25 min

- [ ] **5.10** `[S]` `[002-15]` `[002-19]` Implement `useCurrentUser` TanStack Query hook
  - **File**: `apps/web/src/hooks/use-current-user.ts`
  - **Type**: Create new file
  - **Description**: `useCurrentUser()` — wraps `useQuery` to call `GET /api/me` via `apiClient`. Returns `{ user, isLoading, isError }`. Used by dashboard and header components to display the current user's name.
  - **Spec Reference**: Plan §5 (hooks file map)
  - **Dependencies**: Tasks 5.3, 5.4 (api client + auth store for token)
  - **Estimated**: 20 min

- [ ] **5.11** `[M]` `[002-01]` `[002-18]` Wire up app entry point and providers
  - **File**: `apps/web/src/main.tsx` · `apps/web/src/app.tsx`
  - **Type**: Modify existing
  - **Description**: `main.tsx` — wrap root with `QueryClientProvider`, `RouterProvider` (using router from Task 5.5), `IntlProvider` (react-intl, English locale), and `SessionExpiredHandler`. `app.tsx` — replace the login placeholder with the router outlet (`<RouterProvider />`). Delete `apps/web/src/pages/login-page.tsx` (replaced by Keycloak redirect).
  - **Spec Reference**: Plan §7 Phase 4 (main.tsx / app.tsx tasks)
  - **Dependencies**: Tasks 5.5, 5.9
  - **Estimated**: 45 min

- [ ] **5.12** `[S]` `[002-17]` Add auth + tenant i18n messages
  - **File**: `apps/web/src/i18n/messages.en.ts`
  - **Type**: Modify existing
  - **Location**: Messages export object
  - **Description**: Add all new message keys for auth flow: loading states, error messages, org-error page text, callback page text, session expired toast. Follow existing key naming conventions in the file.
  - **Spec Reference**: Plan §7 Phase 4 (i18n messages step)
  - **Dependencies**: Tasks 5.6, 5.7, 5.9
  - **Estimated**: 20 min

- [ ] **5.13** `[S]` `[002-19]` Add Vite dev API proxy
  - **File**: `apps/web/vite.config.ts`
  - **Type**: Modify existing
  - **Location**: `server.proxy` section
  - **Description**: Add proxy rule: `/api` → `http://localhost:3001` (core-api dev port). This allows the frontend dev server to forward API calls without CORS issues during local development.
  - **Spec Reference**: Plan §7 Phase 4 (Vite dev proxy step)
  - **Dependencies**: None (config-only change)
  - **Estimated**: 10 min

---

## Phase 6: Frontend Shell & Dashboard

> Authenticated layout shell (AppShell, Sidebar, Header) and Dashboard page.
> Depends on Phase 5 (auth must work to render authenticated views).
> All layout component tasks within this phase are parallelizable.

- [ ] **6.1** `[S]` `[002-13]` `[002-20]` `[P]` Implement skip-to-content link
  - **File**: `apps/web/src/components/layout/skip-link.tsx`
  - **Type**: Create new file
  - **Description**: Visually hidden `<a href="#main-content">` link that becomes visible on keyboard focus. First focusable element in the DOM (placed before sidebar and header). Anchors to `<main id="main-content">` in AppShell. WCAG 2.4.1 bypass block.
  - **Spec Reference**: Plan §4.14 (skip-to-content); spec 002-20
  - **Dependencies**: Task 5.11 (providers in place)
  - **Estimated**: 15 min

- [ ] **6.2** `[S]` `[002-13]` `[002-20]` `[P]` Implement user avatar component
  - **File**: `apps/web/src/components/layout/avatar.tsx`
  - **Type**: Create new file
  - **Description**: Wraps Radix `Avatar` primitive. Shows user profile image if available; falls back to initials derived from `firstName + lastName`. Sizes: `sm` (32px), `md` (40px), `lg` (48px). `aria-label` set to user's full name.
  - **Spec Reference**: Plan §4.14; plan §7 Phase 5
  - **Dependencies**: Task 1.5 (Radix Avatar installed)
  - **Estimated**: 20 min

- [ ] **6.3** `[S]` `[002-04]` `[002-13]` `[P]` Implement user menu dropdown
  - **File**: `apps/web/src/components/layout/user-menu.tsx`
  - **Type**: Create new file
  - **Description**: Radix `DropdownMenu` triggered by the `Avatar` component. Shows user name, email (non-interactive), then a separator, then "Sign out" menu item. Clicking "Sign out" calls `authStore.logout()`. Keyboard accessible: Space/Enter opens, arrow keys navigate, Escape closes.
  - **Spec Reference**: Plan §4.16 (user menu in header); plan §7 Phase 5
  - **Dependencies**: Tasks 6.2, 5.4 (avatar + auth store)
  - **Estimated**: 30 min

- [ ] **6.4** `[S]` `[002-13]` `[P]` Implement breadcrumb component
  - **File**: `apps/web/src/components/layout/breadcrumb.tsx`
  - **Type**: Create new file
  - **Description**: Derives breadcrumb items from TanStack Router's `useMatches()` hook. Renders `<nav aria-label="Breadcrumb">` with `<ol>` list. Home icon + route labels from route `meta.title`. Last item has `aria-current="page"`. Separator between items is decorative (`aria-hidden`).
  - **Spec Reference**: Plan §4.16
  - **Dependencies**: Task 5.5 (router configured)
  - **Estimated**: 30 min

- [ ] **6.5** `[S]` `[002-13]` `[002-20]` `[P]` Implement sidebar nav item
  - **File**: `apps/web/src/components/layout/sidebar-nav-item.tsx`
  - **Type**: Create new file
  - **Description**: Single navigation link rendered as TanStack Router `<Link>`. Props: `icon` (Lucide component), `label` (string, from react-intl), `to` (route path). When the route is active, applies active styles and sets `aria-current="page"`. Supports collapsed mode (icon only, `title` attribute for tooltip).
  - **Spec Reference**: Plan §4.15
  - **Dependencies**: Tasks 5.5, 1.5
  - **Estimated**: 25 min

- [ ] **6.6** `[M]` `[002-13]` `[002-20]` `[P]` Implement sidebar component
  - **File**: `apps/web/src/components/layout/sidebar.tsx`
  - **Type**: Create new file
  - **Description**: Three responsive variants driven by viewport width and a toggle. Expanded (240px) at ≥ 1024px; collapsed (64px icon-only) when toggled; drawer (mobile overlay) at < 768px. Focus trap when in drawer mode (keyboard users cannot tab behind the overlay). `aria-label="Primary navigation"`. Composes multiple `SidebarNavItem` instances.
  - **Spec Reference**: Plan §4.15; spec 002-13, 002-20
  - **Dependencies**: Task 6.5
  - **Estimated**: 90 min

- [ ] **6.7** `[M]` `[002-13]` `[002-20]` `[P]` Implement header component
  - **File**: `apps/web/src/components/layout/header.tsx`
  - **Type**: Create new file
  - **Description**: Top navigation bar. Left: hamburger `<button>` (`aria-label="Toggle sidebar"`, `aria-expanded` reflects sidebar state) + breadcrumb. Right: search placeholder (disabled `<input>` with `aria-label`) + `UserMenu`. Sticky position, `role="banner"`. Height 64px.
  - **Spec Reference**: Plan §4.16
  - **Dependencies**: Tasks 6.3, 6.4 (user menu + breadcrumb)
  - **Estimated**: 60 min

- [ ] **6.8** `[M]` `[002-13]` `[002-14]` `[002-20]` Implement AppShell layout component
  - **File**: `apps/web/src/components/layout/app-shell.tsx`
  - **Type**: Create new file
  - **Description**: Root authenticated layout. Renders `<SkipLink />` first, then `<Header />` (`role="banner"`), `<Sidebar />` (`role="navigation"`), `<main id="main-content">` with `children`. CSS Grid layout. Manages sidebar open/closed state via `useState` (passed to Header and Sidebar). Applies design system tokens: Inter font, brand colour variables, consistent spacing.
  - **Spec Reference**: Plan §4.14
  - **Dependencies**: Tasks 6.1, 6.6, 6.7 (skip-link, sidebar, header)
  - **Estimated**: 60 min

- [ ] **6.9** `[S]` `[002-13]` `[P]` Implement skeleton loader component
  - **File**: `apps/web/src/components/feedback/skeleton-loader.tsx`
  - **Type**: Create new file
  - **Description**: Animated placeholder for loading states. Variants: `text` (full-width line), `card` (rounded rectangle), `circle` (for avatar). Uses CSS animation (`@keyframes pulse`). Respects `prefers-reduced-motion` — renders static grey block when motion is reduced. `aria-hidden="true"` (live content will replace it).
  - **Spec Reference**: Plan §7 Phase 5
  - **Dependencies**: None
  - **Estimated**: 20 min

- [ ] **6.10** `[S]` `[002-13]` `[P]` Implement empty state component
  - **File**: `apps/web/src/components/feedback/empty-state.tsx`
  - **Type**: Create new file
  - **Description**: Lucide icon + heading + description text + optional CTA button slot. Used by dashboard's "Recent activity" section when a new tenant has no data. All text via `react-intl` props. `role="status"` on the container.
  - **Spec Reference**: Plan §7 Phase 5
  - **Dependencies**: Task 1.5
  - **Estimated**: 20 min

- [ ] **6.11** `[S]` `[002-16]` `[P]` Implement error fallback UI
  - **File**: `apps/web/src/components/error/error-fallback.tsx`
  - **Type**: Create new file
  - **Description**: Presentational component shown inside the error boundary. "Something went wrong" heading, optional `error.message` (never raw stack trace). Two CTA buttons: "Go to Dashboard" (TanStack Router `<Link>`) and "Refresh" (`window.location.reload()`). `role="alert"` on the container. All strings via `react-intl`.
  - **Spec Reference**: Plan §4.20
  - **Dependencies**: Task 5.5 (router for dashboard link)
  - **Estimated**: 20 min

- [ ] **6.12** `[M]` `[002-16]` `[P]` Implement route-level error boundary
  - **File**: `apps/web/src/components/error/route-error-boundary.tsx`
  - **Type**: Create new file
  - **Description**: React class component implementing `componentDidCatch`. Catches errors thrown in the wrapped route subtree. Renders `<ErrorFallback>` while keeping the shell (sidebar + header) intact — only the `<main>` content area shows the fallback. Resets on navigation (`useRouter`-based reset).
  - **Spec Reference**: Plan §4.20; spec 002-16
  - **Dependencies**: Tasks 6.8, 6.11 (shell structure + fallback UI)
  - **Estimated**: 45 min

- [ ] **6.13** `[M]` `[002-15]` `[002-17]` `[002-19]` Implement dashboard page
  - **File**: `apps/web/src/pages/dashboard-page.tsx`
  - **Type**: Create new file
  - **Description**: Default authenticated landing page. Calls `useCurrentUser()` to get `{ firstName }`. Shows personalized greeting: "Welcome back, {firstName}" (react-intl `<FormattedMessage>` with interpolation). Four stat cards showing skeleton loaders (no real data in Phase 1). "Recent activity" section with `<EmptyState>` (Lucide `Activity` icon, "No activity yet" message). All data fetched via TanStack Query.
  - **Spec Reference**: Plan §4.17; spec 002-15
  - **Dependencies**: Tasks 5.10, 6.9, 6.10 (hook + skeletons + empty state)
  - **Estimated**: 60 min

- [ ] **6.14** `[S]` `[002-13]` `[002-16]` Wire shell, dashboard and error boundary into router
  - **File**: `apps/web/src/router.tsx`
  - **Type**: Modify existing
  - **Location**: Authenticated route tree
  - **Description**: Wrap authenticated routes with `<AppShell>` as the layout component and `<RouteErrorBoundary>` wrapping the route `<Outlet>`. Add `/dashboard` as the default post-auth redirect route.
  - **Spec Reference**: Plan §7 Phase 5 (wire dashboard into router)
  - **Dependencies**: Tasks 6.8, 6.12, 6.13
  - **Estimated**: 20 min

- [ ] **6.15** `[S]` `[002-17]` Add shell + dashboard i18n messages
  - **File**: `apps/web/src/i18n/messages.en.ts`
  - **Type**: Modify existing
  - **Location**: Messages export object
  - **Description**: Add all remaining message keys: sidebar navigation labels, header labels (toggle, search), dashboard greeting + stat card labels + empty-state text, error fallback text, skeleton `aria-label` strings.
  - **Spec Reference**: Plan §7 Phase 5 (i18n messages step)
  - **Dependencies**: Tasks 6.7, 6.13
  - **Estimated**: 20 min

- [ ] **6.16** `[S]` `[002-14]` Export new UI primitives from design system package
  - **File**: `packages/ui/src/index.ts`
  - **Type**: Modify existing
  - **Location**: Exports list
  - **Description**: Export `DropdownMenu` (Radix `@radix-ui/react-dropdown-menu` re-export with Plexica styles) if not already present. This ensures the design system package remains the single entry point for Radix primitives across all apps.
  - **Spec Reference**: Plan §5 (Files to Modify — packages/ui)
  - **Dependencies**: Task 1.5
  - **Estimated**: 15 min

---

## Phase 7: Backend Integration Tests

> Vitest integration tests with real services (no mocks). Parallelizable
> at file level once the implementation they test is complete.

- [ ] **7.1** `[M]` `[002-02]` `[002-03]` `[NFR-02]` `[NFR-03]` `[EC-06]` Auth middleware integration tests
  - **File**: `services/core-api/src/__tests__/auth-middleware.test.ts`
  - **Type**: Create new file
  - **Description**: Uses real Keycloak tokens (no mocks). Test cases: valid RS256 token → 200; no token → 401; expired token → 401; token from wrong realm → 401; JWKS cache hit after warm-up (NFR-03 — `getCacheStats().hits > 0`); JWKS key rotation simulation: invalidate cache, next request re-fetches (EC-06). Timing assertion: validation < 10 ms after cache warm-up (NFR-02).
  - **Spec Reference**: Plan §8.2; spec NFR-02, NFR-03
  - **Dependencies**: Tasks 2.1, 2.2, 2.5 (full middleware stack)
  - **Estimated**: 90 min

- [ ] **7.2** `[M]` `[002-07]` `[002-08]` `[002-11]` `[NFR-04]` `[EC-07]` Tenant context isolation tests
  - **File**: `services/core-api/src/__tests__/tenant-context.test.ts`
  - **Type**: Create new file
  - **Description**: Uses real PostgreSQL. Test cases: request with tenant A slug → `search_path` set to `tenant_a,core,public`; concurrent requests for tenant A and tenant B do not share context (EC-07 — AsyncLocalStorage isolation); no subdomain → 400 `INVALID_TENANT_CONTEXT` (EC-01); unknown slug → same 400 error (EC-02 — identical response, no enumeration).
  - **Spec Reference**: Plan §8.2; spec EC-01, EC-02, EC-07
  - **Dependencies**: Tasks 3.1, 3.2, 3.3
  - **Estimated**: 90 min

- [ ] **7.3** `[M]` `[002-11]` `[NFR-04]` `[P]` Cross-tenant isolation proof test
  - **File**: `services/core-api/src/__tests__/cross-tenant-isolation.test.ts`
  - **Type**: Create new file
  - **Description**: Critical security test. Seeds two tenant schemas with distinct data. Authenticates as tenant A. Makes a request for a resource ID that belongs to tenant B. Asserts **HTTP 404** (no data leakage — not 403, not 400). Also asserts the response body contains no tenant B data. Runs on real PostgreSQL with real schema isolation.
  - **Spec Reference**: Spec 002-11; spec AC-2; NFR-04 (zero cross-tenant leaks)
  - **Dependencies**: Tasks 3.1, 3.2, 3.3
  - **Estimated**: 60 min

- [ ] **7.4** `[L]` `[002-10]` `[EC-03]` `[EC-04]` `[NFR-05]` `[P]` Tenant provisioning tests
  - **File**: `services/core-api/src/__tests__/tenant-provisioning.test.ts`
  - **Type**: Create new file
  - **Description**: Uses real PostgreSQL + Keycloak + MinIO. Test cases: happy path → schema + realm + bucket all exist, `core.tenants` row updated; rollback EC-03 → make realm creation fail (inject error) → verify schema is dropped; rollback EC-04 → make bucket creation fail → verify realm deleted + schema dropped; timing assertion: provisioning < 30 s (NFR-05).
  - **Spec Reference**: Plan §8.2; spec EC-03, EC-04, NFR-05
  - **Dependencies**: Tasks 4.4, 4.7
  - **Estimated**: 120 min

- [ ] **7.5** `[M]` `[002-12]` `[EC-08]` `[NFR-06]` `[P]` Multi-schema migration tests
  - **File**: `services/core-api/src/__tests__/multi-schema-migrate.test.ts`
  - **Type**: Create new file
  - **Description**: Uses real PostgreSQL with 3 test tenant schemas. Test cases: all succeed → `MigrationReport` shows all `ok`; 2nd tenant fails → report shows tenant 1 `ok`, tenant 2 `failed` with error, tenant 3 not in results (`stoppedAt = tenant-2`); timing: 10 tenants < 60 s (NFR-06). Verifies tenant 1 migration is committed (not rolled back) even when tenant 2 fails.
  - **Spec Reference**: Plan §8.2; spec EC-08, NFR-06
  - **Dependencies**: Task 4.6
  - **Estimated**: 90 min

- [ ] **7.6** `[S]` `[002-02]` `[002-06]` `[002-15]` `[P]` User routes and tenant resolve integration tests
  - **File**: `services/core-api/src/__tests__/user-routes.test.ts`
  - **Type**: Create new file
  - **Description**: `GET /api/me` with valid token + valid tenant → 200 with user profile; no token → 401; invalid tenant → 400 `INVALID_TENANT_CONTEXT`. `GET /api/tenants/resolve?slug=acme` → 200 `{ exists: true, realm: "plexica-acme" }`; unknown slug → 200 `{ exists: false }` (no 404 — anti-enumeration); no slug param → 400 `TENANT_REQUIRED`.
  - **Spec Reference**: Plan §3.2, §3.4; plan §8.2
  - **Dependencies**: Tasks 2.4, 4.5, 3.3
  - **Estimated**: 45 min

---

## Phase 8: E2E Tests (Playwright)

> Full-stack Playwright tests. Requires all implementation phases to be
> complete and Docker Compose stack running. All test files are parallelizable.

- [ ] **8.1** `[L]` `[002-01]` `[002-02]` `[002-06]` `[002-15]` `[NFR-01]` Configure Playwright for multi-subdomain + write login flow E2E
  - **File**: `apps/web/e2e/login-flow.spec.ts`
  - **Type**: Create new file
  - **Description**: First, configure Playwright `playwright.config.ts` for multi-subdomain testing (use `extraHTTPHeaders` with `X-Tenant-Slug` or custom DNS entry via `hosts`). Then write login flow: navigate to `acme.plexica.io` (or local equivalent) → verify redirect to Keycloak `plexica-acme` realm → enter valid credentials → verify redirect to `/callback` → verify redirect to `/dashboard` with "Welcome back, {firstName}" message. Timing assertion: end-to-end < 3 s (NFR-01).
  - **Spec Reference**: Spec AC-1; plan §8.3; NFR-01
  - **Dependencies**: Phases 1–6 complete
  - **Estimated**: 120 min

- [ ] **8.2** `[M]` `[002-04]` `[P]` Logout E2E test
  - **File**: `apps/web/e2e/logout.spec.ts`
  - **Type**: Create new file
  - **Description**: Login as tenant user, capture access token. Click "Sign out" in user menu. Verify redirect to Keycloak login page. Make a direct `fetch` to `GET /api/me` with the captured token → assert 401 (token rejected). Verify no other sessions affected (only current session invalidated — spec AC-3).
  - **Spec Reference**: Spec AC-3; plan §8.3; spec 002-04
  - **Dependencies**: Task 8.1 (Playwright configured)
  - **Estimated**: 60 min

- [ ] **8.3** `[S]` `[002-06]` `[EC-01]` `[EC-02]` `[P]` Organization error page E2E
  - **File**: `apps/web/e2e/org-error.spec.ts`
  - **Type**: Create new file
  - **Description**: (1) Navigate with unknown subdomain → verify "Organization not found" error page is shown and contains no information about valid tenants. (2) Navigate with no subdomain (`localhost:3000` without tenant context) → verify "Which organization?" page variant.
  - **Spec Reference**: Plan §8.3; spec EC-01, EC-02
  - **Dependencies**: Task 8.1
  - **Estimated**: 30 min

- [ ] **8.4** `[M]` `[002-11]` `[NFR-04]` `[P]` Cross-tenant isolation E2E
  - **File**: `apps/web/e2e/cross-tenant.spec.ts`
  - **Type**: Create new file
  - **Description**: Login as user in tenant A. Obtain a resource ID from tenant B's database (seeded in test setup). Make an API call for that resource ID via the browser context authenticated as tenant A. Assert the UI shows "Not found" (or equivalent 404 response). Verify no tenant B data is visible anywhere on screen.
  - **Spec Reference**: Spec AC-2; plan §8.3; NFR-04
  - **Dependencies**: Task 8.1
  - **Estimated**: 60 min

- [ ] **8.5** `[M]` `[002-20]` `[NFR-08]` `[P]` Shell accessibility E2E audit
  - **File**: `apps/web/e2e/shell-a11y.spec.ts`
  - **Type**: Create new file
  - **Description**: Login and navigate to dashboard. Inject `axe-core` via Playwright. Run `checkA11y()` on the full page. Assert **zero violations**. Also test: Tab key cycles through all interactive elements with visible focus indicators; skip-to-content link appears on first Tab press; sidebar keyboard navigation; `aria-current="page"` on active nav item; color contrast not tested by axe → verify manually via design tokens (task note).
  - **Spec Reference**: Spec 002-20, AC-7; NFR-08; plan §8.3
  - **Dependencies**: Task 8.1
  - **Estimated**: 60 min

- [ ] **8.6** `[S]` `[002-16]` `[P]` Error boundary recovery E2E
  - **File**: `apps/web/e2e/error-boundary.spec.ts`
  - **Type**: Create new file
  - **Description**: Navigate to a test route that intentionally throws a React error. Assert the error fallback UI is shown (`role="alert"` content visible). Assert the AppShell (sidebar + header) is still rendered and functional. Click "Go to Dashboard" → assert navigation to `/dashboard` succeeds and the error boundary resets.
  - **Spec Reference**: Plan §8.3; spec 002-16
  - **Dependencies**: Task 8.1
  - **Estimated**: 30 min

---

## Phase 9: Polish & Verification

- [ ] **9.1** `[S]` `[NFR-07]` Verify shell first contentful paint performance
  - **File**: `apps/web/e2e/login-flow.spec.ts`
  - **Type**: Modify existing
  - **Description**: Add a Playwright performance assertion after login: capture `performance.getEntriesByType("paint")` in the browser context. Assert `first-contentful-paint` < 1500 ms (NFR-07). If the assertion fails, investigate bundle splitting in `vite.config.ts`.
  - **Spec Reference**: NFR-07
  - **Dependencies**: Task 8.1
  - **Estimated**: 20 min

- [ ] **9.2** `[S]` `[ALL]` Verify responsive breakpoints manually
  - **Description**: Using Playwright device emulation or browser DevTools, verify the shell renders correctly at: 1440px (expanded sidebar), 1024px (expanded), 768px (sidebar collapses to icon), 375px (sidebar becomes drawer overlay). Document any layout regressions.
  - **Spec Reference**: Plan §7 Phase 5 (breakpoint verification step)
  - **Dependencies**: Phase 6 complete
  - **Estimated**: 30 min

- [ ] **9.3** `[S]` `[ALL]` Run `pnpm --filter core-api test` and confirm all pass
  - **Description**: Run the full backend test suite (unit + integration). All tests must pass against the live Docker Compose stack. Fix any flaky tests or timing issues.
  - **Spec Reference**: Constitution Rule 2
  - **Dependencies**: Phases 7 complete
  - **Estimated**: 20 min

- [ ] **9.4** `[S]` `[ALL]` Run `pnpm --filter web test:e2e` and confirm all pass
  - **Description**: Run all Playwright E2E tests. All 6 test files must pass in CI (Docker Compose stack). Fix any test setup or timing issues.
  - **Spec Reference**: Constitution Rule 1, Rule 2
  - **Dependencies**: Phase 8 complete
  - **Estimated**: 20 min

- [ ] **9.5** `[S]` `[ALL]` Run `/forge-review` adversarial review
  - **Command**: `/forge-review .forge/specs/002-foundations/`
  - **Description**: Dual-model adversarial review across all 7 dimensions before merge. Address all HIGH severity findings. Document any accepted MEDIUM findings in `.forge/knowledge/decision-log.md`.
  - **Spec Reference**: AGENTS.md "Daily workflow" step 5
  - **Dependencies**: All implementation complete (Phases 1–8)
  - **Estimated**: 30 min (review setup) + time to fix findings

---

## Summary

| Metric                     | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Total tasks                | 57                                                                  |
| Total phases               | 9                                                                   |
| Parallelizable tasks `[P]` | 26                                                                  |
| `[S]` tasks (< 30 min)     | 28                                                                  |
| `[M]` tasks (30 min–2 h)   | 24                                                                  |
| `[L]` tasks (2–4 h)        | 5                                                                   |
| `[XL]` tasks (4+ h)        | 0                                                                   |
| Functional reqs covered    | 20/20 (002-01 → 002-20)                                             |
| NFRs covered               | 8/9 (NFR-01 → NFR-08; NFR-09 is Keycloak-managed, no platform code) |
| Edge cases covered         | 8/8 (EC-01 → EC-08)                                                 |

---

## Cross-References

| Document      | Path                                           |
| ------------- | ---------------------------------------------- |
| Spec          | `.forge/specs/002-foundations/spec.md`         |
| Plan          | `.forge/specs/002-foundations/plan.md`         |
| Design Spec   | `.forge/specs/002-foundations/design-spec.md`  |
| User Journeys | `.forge/specs/002-foundations/user-journey.md` |
| Constitution  | `.forge/constitution.md`                       |
| Decision Log  | `.forge/knowledge/decision-log.md`             |
