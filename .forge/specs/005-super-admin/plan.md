# Plan: 005 — Super Admin Panel

> Technical implementation plan for the Super Admin Panel (Phase 4). Created by
> `forge-architect` via `/forge-plan`. Translates Spec 005 into a concrete
> implementation blueprint with data models, API contracts, file maps, and
> testing strategy.

| Field   | Value                                         |
| ------- | --------------------------------------------- |
| Status  | Draft                                         |
| Author  | forge-architect                               |
| Date    | 2026-07-10                                    |
| Track   | Feature                                       |
| Spec    | `.forge/specs/005-super-admin/spec.md`        |
| ADR     | ADR-022; ADR-023 (Accepted)                   |

---

## 1. Overview

This plan covers the full implementation of the Super Admin Panel — 11 features
(005-01 through 005-11) spanning a new backend `admin` module in `services/core-api`,
a new separate frontend app `apps/admin/`, two new `core` tables, Loki+Grafana
infrastructure, and a Prisma migration for the optimistic-locking `version` column
on `core.tenants`.

The plan is structured to allow incremental E2E-testable delivery: each feature
can be merged independently once its dependency chain is satisfied.

**Reference documents**:
- Spec: `.forge/specs/005-super-admin/spec.md` — features, edge cases, NFRs
- ADR-022: `.forge/knowledge/adr/adr-022-super-admin-infra-and-data-model.md` —
  SQL DDL for new tables, Loki+Grafana infra, optimistic locking, `pino-loki`
- ADR-023: `.forge/knowledge/adr/adr-023-admin-pkce-auth.md` — PKCE S256,
  RP-Initiated Logout, exact URIs, and isolated E2E token helper
- Architecture: `.forge/architecture/architecture.md` — §4.3 admin routes bypass
  tenant-context middleware (ID-003), §3.2 data model, §7.1 logging

---

## 2. Architecture Decisions

### 2.1 Confirmed — ADR-022 Basis

ADR-022 (Accepted) provides the five foundational decisions this plan builds on:

1. **`core.tenant_deletion_steps`** — forward-only deletion saga (no rollback,
   GDPR-safe). Per-step status tracking with retry. Includes `pending_deletion`
   tenant status transition.
2. **`core.platform_audit_log`** — platform-level audit trail in `core` schema,
   survives tenant deletion. `actor_id` is `VARCHAR(255)` (Keycloak sub).
3. **Loki + Grafana** for system logs — `pino-loki` transport, admin API proxies
   to Loki HTTP API. No `core.system_logs` table.
4. **Optimistic locking** via `version` column on `core.tenants` — 409 Conflict
   on concurrent admin actions.
5. **Plugin review queue** — `reviewStatus`, `reviewNotes`, `reviewedAt`,
   `reviewedBy` columns on `core.plugins`; `deprecated` status distinguishes
   "withdrawn after installs" from `unpublished` ("withdrawn before installs").

### 2.2 Additional Technical Decisions (Plan-Level)

Except for D-3, these do not cross the ADR threshold. Accepted ADR-023
supersedes D-3.

| Decision | Rationale |
| -------- | --------- |
| **D-1: New `admin` module consolidates super-admin routes** | Currently super-admin routes are scattered: `POST /api/admin/tenants` in `tenant/tenant-routes.ts`, plugin catalog in `plugin/routes/admin-*.ts`. Spec 005 adds 20+ more admin endpoints. A dedicated `modules/admin/` module with route sub-files keeps each file under 200 lines (Rule 4) and provides a clear ownership boundary. Existing routes in `tenant/` and `plugin/` admin scopes remain for now — the new `admin` module adds the remaining features and new route files. A future refactor can consolidate. |
| **D-2: Admin app uses object-based TanStack Router** | The web app uses object-based routing (`createRoute` + `addChildren`). The admin app replicates this exact pattern — no file-based routing framework to learn. Same `router-shell.tsx` + `router-shell-routes.tsx` split. |
| **D-3 (superseded): Admin browser auth uses PKCE S256** | Public `plexica-admin` uses Authorization Code + PKCE against the master realm. `/login` redirects to Keycloak; `/callback` validates state and exchanges code. Application clients explicitly disable password grant. Access, refresh, and ID tokens are tab-scoped in `sessionStorage`. See ADR-023. |
| **D-4: Metrics aggregation via `setInterval` scheduled job** | The pre-aggregated Redis metrics (user count, workspace count) need a 5-minute refresh. A `setInterval` in the server bootstrap (`src/index.ts`) starts the aggregation job — same pattern as the DLQ consumer startup. No external cron or job runner needed for v2. |
| **D-5: Loki query proxy in backend, never direct from frontend** | The admin frontend calls `GET /api/v1/admin/logs` which proxies to Loki. The backend translates admin filters (tenant, level, time range) into LogQL labels + line filters using parameterized construction. The frontend never knows the Loki URL or LogQL syntax. |
| **D-6: `withCoreDb` for all admin route handlers** | Admin routes bypass tenant-context middleware (ID-003). All admin database operations use `withCoreDb` (from `lib/tenant-database.ts`) which uses the singleton Prisma client against the `core` schema. Cross-schema aggregates (user counts per tenant) use `prisma.$queryRaw` with parameterized schema names. |

---

## 3. Backend Module Structure

### 3.1 Module Layout

A new `modules/admin/` module in `services/core-api`:

```
services/core-api/src/modules/admin/
  index.ts                          — Module Fastify plugin, registers all route groups
  schemas/
    tenant-schemas.ts               — Zod schemas for tenant list/detail/provision/suspend/delete
    plugin-catalog-schemas.ts       — Zod schemas for plugin catalog management
    dashboard-schemas.ts            — Zod schemas for dashboard query params
    health-schemas.ts               — Zod schemas for health check response
    logs-schemas.ts                 — Zod schemas for logs query params + Loki response
    audit-schemas.ts                — Zod schemas for platform audit log query
    kafka-schemas.ts                — Zod schemas for Kafka status query
  services/
    dashboard-metrics.service.ts    — Reads pre-aggregated metrics from Redis
    tenant-list.service.ts          — Tenant list with search + filter + pagination
    tenant-detail.service.ts        — Aggregates tenant info + cross-schema user/workspace/plugin counts
    tenant-suspend.service.ts       — Suspend saga: update status, disable Keycloak realm, invalidate Redis cache
    tenant-reactivate.service.ts    — Reactivate: reverse of suspend
    deletion-saga.service.ts        — Orchestrates forward-only deletion saga
    deletion-step-schema-drop.ts    — Step handler: DROP SCHEMA
    deletion-step-realm-delete.ts   — Step handler: delete Keycloak realm
    deletion-step-bucket-delete.ts  — Step handler: delete MinIO bucket
    deletion-retry.service.ts       — Retry a single failed deletion step
    health-checker.service.ts       — Pings all infra services, returns status enum
    health-check-postgres.ts        — PostgreSQL health probe
    health-check-redis.ts           — Redis health probe
    health-check-keycloak.ts        — Keycloak health probe
    health-check-kafka.ts           — Kafka/Redpanda health probe
    health-check-minio.ts           — MinIO health probe
    logs-query.service.ts           — Translates filters → LogQL, proxies to Loki HTTP API
    audit-log.service.ts            — Writes + reads platform audit log entries
    metrics-aggregator.service.ts   — Scheduled job: aggregates user/workspace counts across schemas → Redis
    kafka-status.service.ts         — Reads consumer lag + DLQ size per plugin (wraps existing lag-metrics.service)
  lib/
    optimistic-lock.ts              — Optimistic lock helper: UPDATE ... WHERE version = $expected, returns 409 on conflict
  routes/
    dashboard.routes.ts             — GET /admin/dashboard (005-01)
    tenant-list.routes.ts           — GET /admin/tenants (list) (005-02)
    tenant-detail.routes.ts         — GET /admin/tenants/:id (005-03)
    tenant-provision.routes.ts      — POST /admin/tenants (005-04) — extends existing tenant-routes.ts
    tenant-suspend.routes.ts        — POST /admin/tenants/:id/suspend (005-05)
    tenant-reactivate.routes.ts     — POST /admin/tenants/:id/reactivate (005-06)
    tenant-delete.routes.ts         — DELETE /admin/tenants/:id (005-07)
    deletion-status.routes.ts       — GET /admin/tenants/:id/deletion-status, POST /admin/deletions/:stepId/retry
    plugin-catalog.routes.ts        — GET/POST /admin/plugins (catalog management) (005-08)
    health.routes.ts                — GET /admin/health (005-09)
    logs.routes.ts                  — GET /admin/logs (005-10)
    audit-log.routes.ts             — GET /admin/audit-logs
    kafka-status.routes.ts          — GET /admin/system/kafka (005-11)
```

### 3.2 Route Registration

The admin module is registered in `src/index.ts` inside the existing admin scope
(lines 106-110). The admin scope already has `authMiddleware` and a 30 req/min
rate limit. The new `adminRoutes` plugin is registered alongside `pluginAdminRoutes`:

```typescript
await server.register(async (adminScope) => {
  adminScope.addHook('preHandler', authMiddleware);
  adminScope.addHook('preHandler', rateLimitMiddleware(30, 60000));
  await adminScope.register(pluginAdminRoutes);   // existing — plugin catalog + DLQ + kafka
  await adminScope.register(adminRoutes);          // NEW — all spec 005 admin routes
});
```

All admin route files use `requireSuperAdmin` as a `preHandler` (same pattern as
existing `admin-catalog.routes.ts`). The admin scope handles authentication; the
`requireSuperAdmin` preHandler on each route group enforces the role.

### 3.3 Deletion Saga Execution Model

The GDPR deletion saga is **asynchronous**, not synchronous in the request
(C-5 fix — resolves the sync/async contradiction):

1. **`DELETE /admin/tenants/:id`** — validates `confirmSlug`, sets tenant
   `status = 'pending_deletion'`, creates 3 `tenant_deletion_steps` rows
   (all `pending`: `schema_drop`, `realm_delete`, `bucket_delete`),
   writes an audit log entry, returns **`202 Accepted`** with
   `{ deletionId, steps: [{ step, status }] }`. The request does not wait
   for step execution.

2. **Background executor** — an in-process async function (launched via
   `setImmediate` after the response is sent) processes steps sequentially:
   `schema_drop → realm_delete → bucket_delete`. Each step: set `in_progress`,
   attempt, set `done` or `failed` (with `last_error`). If `failed`, retry
   with backoff (max 3 attempts; after 3 failures the step stays `failed`
   for manual retry via the admin UI).

3. **Completion** — when all 3 steps are `done`, set tenant `status =
   'deleted'` and write an audit log entry.

4. **`GET /admin/tenants/:id/deletion-status`** — reads the step statuses
   from `tenant_deletion_steps`. Returns `{ steps: [{ id, step, status,
   attempts, lastError, updatedAt }] }`.

5. **`POST /admin/deletions/:stepId/retry`** — resets a `failed` step to
   `pending`, resets `attempts` to 0, and triggers the background executor
   again for that step. Returns `200: { step, status, attempts }`.

> **Why not a job queue**: the deletion saga is low-volume (admin-triggered,
> not user-triggered) and short-running (< 30s happy path). An in-process
> async executor is sufficient. If the server restarts mid-saga, steps in
   `in_progress` are detected on startup and resumed (a startup sweep checks
> for `in_progress` steps older than a timeout and resets them to `pending`).
> A dedicated job queue (BullMQ, etc.) is out of scope for this sprint and
> would add a Redis dependency beyond caching.

### 3.4 Route File Inventory

| Route File | HTTP Methods | Path(s) | Purpose | Feature |
| ---------- | ------------ | ------- | ------- | ------- |
| `dashboard.routes.ts` | GET | `/api/v1/admin/dashboard` | Platform metrics (tenant count, user count, active plugins) | 005-01 |
| `tenant-list.routes.ts` | GET | `/api/v1/admin/tenants` | List tenants with search, status filter, pagination | 005-02 |
| `tenant-detail.routes.ts` | GET | `/api/v1/admin/tenants/:id` | Tenant detail: info, cross-schema user/workspace/plugin counts, audit log | 005-03 |
| `tenant-provision.routes.ts` | POST | `/api/v1/admin/tenants` | Provision new tenant (schema + realm + bucket + seed) | 005-04 |
| `tenant-suspend.routes.ts` | POST | `/api/v1/admin/tenants/:id/suspend` | Suspend tenant (optimistic lock, disable realm, cache invalidate) | 005-05 |
| `tenant-reactivate.routes.ts` | POST | `/api/v1/admin/tenants/:id/reactivate` | Reactivate suspended tenant | 005-06 |
| `tenant-delete.routes.ts` | DELETE | `/api/v1/admin/tenants/:id` | Start GDPR deletion saga (requires slug confirmation) | 005-07 |
| `deletion-status.routes.ts` | GET | `/api/v1/admin/tenants/:id/deletion-status` | View deletion saga step status | 005-07 |
| `deletion-status.routes.ts` | POST | `/api/v1/admin/deletions/:stepId/retry` | Retry a single failed deletion step | 005-07 |
| `plugin-catalog.routes.ts` | POST | `/api/v1/admin/plugins/:slug/review` | Submit review decision (approve/reject) — only endpoint in this file | 005-08 |
| `health.routes.ts` | GET | `/api/v1/admin/health` | System health: per-service status enum | 005-09 |
| `logs.routes.ts` | GET | `/api/v1/admin/logs` | Filterable system logs (Loki proxy) | 005-10 |
| `audit-log.routes.ts` | GET | `/api/v1/admin/audit-logs` | Platform audit log with filters | 005-03 (detail) + cross-ref |
| `kafka-status.routes.ts` | GET | `/api/v1/admin/system/kafka` | Consumer lag per plugin, DLQ size | 005-11 |

> **Route Ownership Table** — explicit ownership to prevent route
> duplication (C-4 fix). Every admin route and its owner file:

| Method | Path | Current File | New File | Action |
| ------ | ---- | ------------ | -------- | ------ |
| GET | `/api/v1/admin/plugins` | `plugin/routes/admin-catalog.routes.ts` | — | KEEP (extend with `installedCount` + `reviewStatus`) |
| POST | `/api/v1/admin/plugins/register` | `plugin/routes/admin-catalog.routes.ts` | — | KEEP |
| POST | `/api/v1/admin/plugins/:slug/publish` | `plugin/routes/admin-publish.routes.ts` | — | KEEP (update: check `reviewStatus === 'approved'` before publish) |
| POST | `/api/v1/admin/plugins/:slug/unpublish` | `plugin/routes/admin-publish.routes.ts` | — | KEEP (update: set `deprecated` if installed, `unpublished` if not) |
| GET | `/api/v1/admin/plugins/:slug/versions` | `plugin/routes/admin-versions.routes.ts` | — | KEEP |
| POST | `/api/v1/admin/plugins/:slug/review` | — | `admin/routes/plugin-catalog.routes.ts` | NEW (only this endpoint in the new file) |
| GET | `/api/v1/admin/system/dlq` | `plugin/routes/dlq.routes.ts` | — | KEEP |
| POST | `/api/v1/admin/system/dlq/:id/retry` | `plugin/routes/dlq.routes.ts` | — | KEEP |
| POST | `/api/v1/admin/system/dlq/:id/dismiss` | `plugin/routes/dlq.routes.ts` | — | KEEP |
| GET | `/api/v1/admin/system/kafka` | `plugin/routes/kafka-status.routes.ts` | — | KEEP (extend with DLQ size per plugin) |
| POST | `/api/admin/tenants` | `tenant/tenant-routes.ts` | `admin/routes/tenant-provision.routes.ts` | MOVE (supersede with audit + conflict detection; old route removed) |
| POST | `/api/admin/tenants/migrate-all` | `tenant/tenant-routes.ts` | — | KEEP in `tenant-routes.ts` (infra migration tool, not a Spec 005 feature; stays at `/api/admin/tenants/migrate-all`) |
| GET | `/api/v1/admin/dashboard` | — | `admin/routes/dashboard.routes.ts` | NEW |
| GET | `/api/v1/admin/tenants` | — | `admin/routes/tenant-list.routes.ts` | NEW |
| GET | `/api/v1/admin/tenants/:id` | — | `admin/routes/tenant-detail.routes.ts` | NEW |
| POST | `/api/v1/admin/tenants/:id/suspend` | — | `admin/routes/tenant-suspend.routes.ts` | NEW |
| POST | `/api/v1/admin/tenants/:id/reactivate` | — | `admin/routes/tenant-reactivate.routes.ts` | NEW |
| DELETE | `/api/v1/admin/tenants/:id` | — | `admin/routes/tenant-delete.routes.ts` | NEW |
| GET | `/api/v1/admin/tenants/:id/deletion-status` | — | `admin/routes/deletion-status.routes.ts` | NEW |
| POST | `/api/v1/admin/deletions/:stepId/retry` | — | `admin/routes/deletion-status.routes.ts` | NEW |
| GET | `/api/v1/admin/health` | — | `admin/routes/health.routes.ts` | NEW |
| GET | `/api/v1/admin/logs` | — | `admin/routes/logs.routes.ts` | NEW |
| GET | `/api/v1/admin/audit-logs` | — | `admin/routes/audit-log.routes.ts` | NEW |

> **Key clarification**: The new `admin/routes/plugin-catalog.routes.ts`
> file contains **only** `POST /api/v1/admin/plugins/:slug/review`. The
> `publish` and `unpublish` routes stay in the existing
> `admin-publish.routes.ts` — they are updated in place (not moved, not
> duplicated). The existing `GET /api/v1/admin/plugins` stays in
> `admin-catalog.routes.ts` and is extended with `installedCount` and
> `reviewStatus` columns in the response.
>
> **W-2 — Route prefix inconsistency**: Existing tenant admin routes use
> `/api/admin/tenants` (no `v1`); plugin admin routes use `/api/v1/admin/`.
> The new admin module uses `/api/v1/admin/` consistently. The old
> `POST /api/admin/tenants` is moved to `/api/v1/admin/tenants` (new owner).
> `POST /api/admin/tenants/migrate-all` stays at its current path
> (`/api/admin/tenants/migrate-all`) — it is an infra tool, not a Spec 005
> feature. Tests hitting the old path (`__tests__/rate-limit.test.ts`) must
> be updated to the new `/api/v1/admin/tenants` path.

---

## 4. Frontend App Structure

### 4.1 App Layout

A new `apps/admin/` application — separate from `apps/web/`:

```
apps/admin/
  package.json                      — dependencies (React, TanStack Router/Query, Zustand, @plexica/ui, @plexica/i18n)
  vite.config.ts                    — Vite config (no Module Federation, no MF host)
  tsconfig.json
  tailwind.config.ts
  postcss.config.js
  index.html
  playwright.config.ts              — Playwright config (port 3002, admin app)
  src/
    main.tsx                        — Entry point: QueryClientProvider + IntlProvider + RouterProvider
    router.tsx                      — TanStack Router setup (createRouter)
    router-shell.tsx                — Root route + shell route + auth guard
    router-shell-routes.tsx         — All authenticated child routes
    app.tsx                         — App shell layout (sidebar + topbar)
    styles/
      globals.css                   — Tailwind globals (imports @plexica/ui/tokens)
    stores/
      auth-store.ts                 — Zustand auth store (master realm, PKCE + RP logout)
    services/
      api-client.ts                 — Configured fetch wrapper (master realm token, no X-Tenant-Slug)
      keycloak-auth.ts              — Master-realm PKCE/OIDC client config
      admin-api.ts                  — Admin API methods (dashboard, tenants, plugins, health, logs, kafka)
    hooks/
      use-dashboard.ts              — TanStack Query: dashboard metrics
      use-tenants.ts                — TanStack Query: tenant list + detail + mutations
      use-tenant-lifecycle.ts       — TanStack Query: suspend/reactivate/delete mutations
      use-deletion-status.ts        — TanStack Query: deletion saga status + retry mutation
      use-plugin-catalog.ts         — TanStack Query: plugin catalog + publish/unpublish/review mutations
      use-health.ts                 — TanStack Query: system health (polling)
      use-logs.ts                   — TanStack Query: system logs query
      use-audit-log.ts              — TanStack Query: platform audit log
      use-kafka-status.ts           — TanStack Query: Kafka status + DLQ
    components/
      layout/
        admin-shell.tsx             — Main layout (sidebar nav + content area)
        sidebar.tsx                 — Navigation sidebar (dashboard, tenants, plugins, health, logs, kafka)
      auth/
        auth-guard.tsx              — Starts PKCE when no valid session exists
        session-expired-handler.tsx — Announces expiry before re-authentication
      pages/
        login-page.tsx              — Keycloak redirect/fallback; no credentials
        auth-callback-page.tsx      — Validate callback and exchange code
      dashboard/
        dashboard-page.tsx          — 005-01: metric cards + status summary
        metric-card.tsx             — Reusable metric card component
      tenants/
        tenant-list-page.tsx        — 005-02: searchable, filterable tenant table
        tenant-detail-page.tsx      — 005-03: tabs (info, users, plugins, audit)
        tenant-detail-info.ts       — Info tab content
        tenant-detail-plugins.ts    — Plugins tab content
        tenant-detail-audit.ts      — Audit tab content
        provision-wizard-page.tsx   — 005-04: multi-step provisioning wizard
        provision-wizard-step-1.ts  — Step 1: slug + name + admin email
        provision-wizard-step-2.ts  — Step 2: review + confirm
        provision-wizard-step-3.ts  — Step 3: progress + result
        suspend-dialog.tsx          — 005-05: suspend confirmation dialog
        reactivate-dialog.tsx       — 005-06: reactivate confirmation dialog
        delete-dialog.tsx           — 005-07: type-to-confirm delete dialog
        deletion-status-panel.tsx   — 005-07: deletion saga step status view
      plugins/
        plugin-catalog-page.tsx     — 005-08: plugin catalog table + review queue
        plugin-review-dialog.tsx    — Review approve/reject dialog
      health/
        health-page.tsx             — 005-09: service health grid
        service-status-card.tsx     — Per-service status card (healthy/degraded/down)
      logs/
        logs-page.tsx               — 005-10: log viewer with filters
        log-filters.tsx             — Filter bar (tenant, level, time range)
      kafka/
        kafka-status-page.tsx       — 005-11: consumer lag table + DLQ summary
    types/
      admin-types.ts                — TypeScript types for admin API responses
    i18n/
      messages.en.ts                — Admin app i18n messages (English)
      messages.en.dashboard.ts      — Dashboard messages
      messages.en.tenants.ts        — Tenant management messages
      messages.en.plugins.ts        — Plugin catalog messages
      messages.en.system.ts         — Health + logs + kafka messages
  e2e/
    global-setup.ts                 — Seed data + ephemeral API helper client
    global-teardown.ts              — Delete run-scoped helper client
    helpers/
      admin-login.ts                — Super admin login helper
      api-client.ts                 — Admin API helper for test assertions
    005-01-dashboard.spec.ts
    005-02-tenant-list.spec.ts
    005-03-tenant-detail.spec.ts
    005-04-provisioning.spec.ts
    005-05-suspend.spec.ts
    005-06-reactivate.spec.ts
    005-07-deletion.spec.ts
    005-08-plugin-catalog.spec.ts
    005-09-health-check.spec.ts
    005-10-logs.spec.ts
    005-11-kafka-status.spec.ts
```

### 4.2 Patterns Replicated from `apps/web/`

| Pattern | Source in `apps/web/` | Replicated in `apps/admin/` |
| ------- | --------------------- | --------------------------- |
| Router setup | `router.tsx` (object-based, `createRoute` + `addChildren`) | `src/router.tsx` — identical structure |
| Router shell | `router-shell.tsx` (root route + shell route + auth guard) | `src/router-shell.tsx` — no tenant resolution (master realm only) |
| Shell routes | `router-shell-routes.tsx` (all child route definitions) | `src/router-shell-routes.tsx` |
| Auth store | `stores/auth-store.ts` (Zustand + persist + sessionStorage) | Master-realm PKCE; access, refresh, ID token, and expiry status are tab-scoped |
| API client | `services/api-client.ts` (fetch wrapper + 401 refresh) | `src/services/api-client.ts` — no `X-Tenant-Slug` header |
| TanStack Query hooks | `hooks/use-plugins.ts` (useQuery + useMutation + invalidation) | `src/hooks/use-*.ts` — identical pattern |
| i18n | `i18n/messages.en.ts` (react-intl message catalogs) | `src/i18n/messages.en.*.ts` |
| Entry point | `main.tsx` (QueryClientProvider + IntlProvider + RouterProvider) | `src/main.tsx` — same structure |
| Keycloak auth | `services/keycloak-auth.ts` (PKCE flow) | PKCE S256 with exact environment callback/logout URIs |

### 4.3 Frontend Routes

| Route Path | Component | Feature |
| ---------- | --------- | ------- |
| `/login` | `login-page.tsx` | Auth — master realm login |
| `/callback` | `auth-callback-page.tsx` | Public PKCE callback |
| `/dashboard` | `dashboard-page.tsx` | 005-01 |
| `/tenants` | `tenant-list-page.tsx` | 005-02 |
| `/tenants/$tenantId` | `tenant-detail-page.tsx` | 005-03 |
| `/tenants/provision` | `provision-wizard-page.tsx` | 005-04 |
| `/plugins` | `plugin-catalog-page.tsx` | 005-08 |
| `/health` | `health-page.tsx` | 005-09 |
| `/logs` | `logs-page.tsx` | 005-10 |
| `/kafka` | `kafka-status-page.tsx` | 005-11 |

> **Note**: Suspend (005-05), reactivate (005-06), and delete (005-07) are
> actions accessible from the tenant detail page — they are dialog components,
> not separate routes.

---

## 5. Infrastructure Changes

### 5.1 Loki + Grafana in docker-compose.yml

Two new services added to `docker-compose.yml`:

```yaml
  loki:
    image: grafana/loki@sha256:<pinned-digest>
    # grafana/loki:3.x — single binary, single node in dev
    command: -config.file=/etc/loki/local-config.yaml
    ports:
      - '${LOKI_PORT:-3100}:3100'
    volumes:
      - ./infra/loki/local-config.yaml:/etc/loki/local-config.yaml:ro
    deploy:
      resources:
        limits:
          memory: 256M
    healthcheck:
      test: ['CMD-SHELL', 'wget -q --spider http://localhost:3100/ready || exit 1']
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 15s

  grafana:
    image: grafana/grafana@sha256:<pinned-digest>
    # grafana/grafana:11.x — dashboards for Prometheus + Loki
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_ADMIN_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD:-changeme}
      GF_AUTH_ANONYMOUS_ENABLED: 'false'
    ports:
      - '${GRAFANA_PORT:-3001}:3000'
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./infra/grafana/dashboards:/var/lib/grafana/dashboards:ro
    deploy:
      resources:
        limits:
          memory: 256M
    healthcheck:
      test: ['CMD-SHELL', 'wget -q --spider http://localhost:3000/api/health || exit 1']
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 15s
```

> **Port conflict note**: Grafana defaults to port 3000, but the web app dev
> server uses 3000. Grafana is mapped to host port 3001 (configurable via
> `GRAFANA_PORT`). The core API listens on 3001 internally but is accessed via
> Vite proxy — no conflict.

Infra files to create:
- `infra/loki/local-config.yaml` — Loki single-node config (filesystem storage)
- `infra/grafana/provisioning/datasources/loki.yml` — Loki datasource provisioning
- `infra/grafana/provisioning/datasources/prometheus.yml` — Prometheus datasource
- `infra/grafana/dashboards/` — Pre-configured dashboards (optional for this sprint)

### 5.2 Pino-Loki Transport Configuration

The existing logger (`services/core-api/src/lib/logger.ts`) is modified to add
a `pino-loki` transport alongside the existing `pino-pretty` (dev) / JSON (prod)
output. The transport is configured via env vars — no code path differs between
dev and prod (Constitution: no test-only code paths).

```typescript
// logger.ts (modified)
import pino from 'pino';
import { config } from './config.js';

const transports = pino.transport({
  targets: [
    // stdout target — always present (JSON in prod, pretty in dev)
    {
      target: config.NODE_ENV === 'production' ? 'pino/file' : 'pino-pretty',
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      options: config.NODE_ENV === 'production'
        ? {}
        : { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
    },
    // Loki target — present when LOKI_URL is set
    ...(config.LOKI_URL !== '' ? [{
      target: 'pino-loki',
      level: 'info',
      options: {
        host: config.LOKI_URL,
        labels: { service: 'core-api', env: config.NODE_ENV },
      },
    }] : []),
  ],
});

export const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: transports,
  redact: {
    paths: ['email', 'password', 'token', 'secret', 'credential'],
    censor: '[REDACTED]',
  },
});
```

**New dependency**: `pino-loki` added to `services/core-api/package.json`.
Already documented in ADR-022 — no separate ADR needed (it's a log transport,
not a core dependency).

**Fail-safe**: if Loki is unreachable, `pino-loki` buffers and drops — logging
never blocks request handling (ADR-022 Consequences).

### 5.3 Prisma Migration

A new Prisma migration adds:

1. `core.tenant_deletion_steps` table (ADR-022 Decision 1)
2. `core.platform_audit_log` table (ADR-022 Decision 2)
3. `ALTER TABLE core.tenants ADD COLUMN version INTEGER NOT NULL DEFAULT 1` (ADR-022 Decision 4)
4. `pending_deletion` value added to `TenantStatus` enum (ADR-022 Decision 1)
5. Review queue columns on `core.plugins`: `review_status`, `review_notes`, `reviewed_at`, `reviewed_by` (ADR-022 Decision 5)
6. `deprecated` value added to `core.plugins.status` CHECK constraint (ADR-022 Decision 5)

**Prisma schema additions** (`services/core-api/prisma/schema.prisma`):

```prisma
model TenantDeletionStep {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  step      String   @db.VarChar(32)
  status    String   @default("pending") @db.VarChar(16)
  attempts  Int      @default(0)
  lastError String?  @map("last_error") @db.Text
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at") @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, step])
  @@index([status, updatedAt])
  @@map("tenant_deletion_steps")
  @@schema("core")
}

model PlatformAuditLog {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actorId      String   @map("actor_id") @db.VarChar(255)
  action       String   @db.VarChar(64)
  resourceType String   @map("resource_type") @db.VarChar(64)
  resourceId   String?  @map("resource_id") @db.Uuid
  tenantId     String?  @map("tenant_id") @db.Uuid
  metadata     Json     @default("{}") @db.JsonB
  ipAddress    String?  @map("ip_address") @db.Inet
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  @@index([actorId, createdAt])
  @@index([action, createdAt])
  @@index([tenantId, createdAt])
  @@map("platform_audit_log")
  @@schema("core")
}
```

**Modified `Tenant` model** — add `version` column:

```prisma
model Tenant {
  // ... existing fields ...
  version Int @default(1) @db.Integer
  // ... relations ...
}
```

The `Tenant` model also gains a relation to `TenantDeletionStep`:

```prisma
  deletionSteps TenantDeletionStep[]
```

**Modified `TenantStatus` enum** — add `pending_deletion`:

```prisma
enum TenantStatus {
  active
  suspended
  pending_deletion
  deleted

  @@schema("core")
}
```

**Modified `Plugin` model** — add review queue columns (ADR-022 Decision 5):

```prisma
model Plugin {
  // ... existing fields ...
  status        String   @default("draft") @db.VarChar(16)
  // Review queue (ADR-022 Decision 5)
  reviewStatus  String   @default("none") @map("review_status") @db.VarChar(16)
  reviewNotes   String?  @map("review_notes") @db.Text
  reviewedAt    DateTime? @map("reviewed_at") @db.Timestamptz
  reviewedBy    String?  @map("reviewed_by") @db.VarChar(255)
  // ... relations ...
  @@index([status])
  @@map("plugins")
  @@schema("core")
}
```

> **Migration note**: The `core.plugins.status` CHECK constraint must be
> updated (via raw SQL in the migration) to allow `deprecated` alongside
> `draft`, `published`, `unpublished`. Similarly, `review_status` gets a
> CHECK constraint for `none`, `pending`, `approved`, `rejected`. The
> `TenantStatus` enum update is handled by Prisma's native enum migration.
>
> **Backfill (N-2 fix)**: The migration must set `review_status = 'approved'`
> for all plugins where `status = 'published'` at migration time, so that
> existing vetted plugins can be re-published without going through the
> review queue again:
> ```sql
> UPDATE core.plugins SET review_status = 'approved'
>   WHERE status = 'published' AND review_status = 'none';
> ```

### 5.4 New Environment Variables

| Variable | Purpose | Default | Added to |
| -------- | ------- | ------- | -------- |
| `LOKI_URL` | Loki HTTP endpoint for pino-loki transport + admin logs proxy | `http://localhost:3100` | `config.ts`, docker-compose |
| `GRAFANA_URL` | Grafana URL (optional — admin UI links to it, not queried) | `http://localhost:3001` | `config.ts` |

Added to `services/core-api/src/lib/config.ts` Zod schema:

```typescript
LOKI_URL: z.string().default(''),
GRAFANA_URL: z.string().default(''),
```

`LOKI_URL` defaults to empty string (disabled) — the pino-loki transport is
only active when set. This allows CI environments without Loki to run tests
without log shipping. The admin logs endpoint returns a 503 when Loki is not
configured.

### 5.5 Keycloak Master Realm — `plexica-admin` Client

Public client `plexica-admin` enables standard flow and explicitly disables
implicit flow, direct grants, service accounts, and authorization services. Set
`pkce.code.challenge.method = S256`, `fullScopeAllowed: false`, and map only
standard OIDC scopes plus required `super_admin`. Never register `/*`.

| Environment | Redirect URI | Post-logout URI | Web origin |
| --- | --- | --- | --- |
| Local/CI | `http://localhost:3002/callback` | `http://localhost:3002/login` | `http://localhost:3002` |
| Production | `https://admin.plexica.app/callback` | `https://admin.plexica.app/login` | `https://admin.plexica.app` |

Staging/review use the same paths under their exact HTTPS origin; production
contains no localhost/review values. Configure `post.logout.redirect.uris`.
Persist the ID token in `sessionStorage`; logout clears local/query state then
redirects to Keycloak with `client_id`, `id_token_hint`, and the exact URI.

---

## 6. API Endpoints

Complete table of all admin API endpoints. All require `super_admin` role
(verified by `requireSuperAdmin` preHandler). All are prefixed `/api/v1/admin/`.

| # | Method | Path | Feature | Purpose | Zod Input | Output |
| - | ------ | ---- | ------- | ------- | --------- | ------ |
| 1 | GET | `/admin/dashboard` | 005-01 | Platform metrics | — (query: none) | `{ tenantCount, userCount, workspaceCount, activePlugins, tenantsByStatus: { active, suspended, pending_deletion, deleted } }` |
| 2 | GET | `/admin/tenants` | 005-02 | List tenants with search + filter | Query: `search?`, `status?`, `page=1`, `pageSize=20` | `{ data: Tenant[], total, page, pageSize }` |
| 3 | GET | `/admin/tenants/:id` | 005-03 | Tenant detail (info, users, plugins, audit) | Param: `id` (UUID) | `{ tenant: Tenant, userCount, workspaceCount, pluginInstallations: [], recentAudit: [] }` |
| 4 | POST | `/admin/tenants` | 005-04 | Provision new tenant | Body: `{ slug, name, adminEmail }` | `201: { tenantId, slug, schemaName, realmName, minioBucket, tempPassword }` |
| 5 | POST | `/admin/tenants/:id/suspend` | 005-05 | Suspend tenant | Param: `id`, Body: `{ version }` (optimistic lock) | `200: { id, status: "suspended", version }` |
| 6 | POST | `/admin/tenants/:id/reactivate` | 005-06 | Reactivate tenant | Param: `id`, Body: `{ version }` | `200: { id, status: "active", version }` |
| 7 | DELETE | `/admin/tenants/:id` | 005-07 | Start GDPR deletion saga | Param: `id`, Body: `{ confirmSlug }` (type-to-confirm) | `202: { deletionId, steps: [{ step, status }] }` |
| 8 | GET | `/admin/tenants/:id/deletion-status` | 005-07 | View deletion saga status | Param: `id` | `{ steps: [{ id, step, status, attempts, lastError, updatedAt }] }` |
| 9 | POST | `/admin/deletions/:stepId/retry` | 005-07 | Retry failed deletion step | Param: `stepId` (UUID) | `200: { step, status, attempts }` |
| 10 | GET | `/admin/plugins` | 005-08 | Plugin catalog + review queue | Query: `search?`, `status?`, `page=1`, `pageSize=20` | `{ data: Plugin[], total, page, pageSize }` |
| 11 | POST | `/admin/plugins/:slug/publish` | 005-08 | Publish plugin | Param: `slug` | `200: { id, slug, status: "published" }` |
| 12 | POST | `/admin/plugins/:slug/unpublish` | 005-08 | Unpublish (deprecate if installed, else unpublished) | Param: `slug` | `200: { id, slug, status: "deprecated"|"unpublished", installedCount }` |
| 13 | POST | `/admin/plugins/:slug/review` | 005-08 | Submit review decision | Param: `slug`, Body: `{ decision: "approve"|"reject", notes? }` | `200: { id, slug, reviewStatus: "approved"|"rejected", reviewedAt, reviewedBy }` |
| 14 | GET | `/admin/health` | 005-09 | System health check | — | `{ services: [{ name, status: "healthy"|"degraded"|"down", latencyMs }] }` |
| 15 | GET | `/admin/logs` | 005-10 | Filterable system logs (Loki proxy) | Query: `tenant?`, `level?`, `start?`, `end?`, `limit=100` | `{ logs: [{ timestamp, level, tenant, message }], total }` |
| 16 | GET | `/admin/audit-logs` | 005-03 | Platform audit log | Query: `action?`, `tenantId?`, `actorId?`, `page=1`, `pageSize=20` | `{ data: AuditEntry[], total, page, pageSize }` |
| 17 | GET | `/admin/system/kafka` | 005-11 | Kafka consumer lag + DLQ | — | `{ consumers: [{ pluginSlug, tenantSlug, lag, topic }], totalLag, dlqSizes: [{ pluginSlug, count }] }` |

### 6.1 Endpoint Error Responses

All admin endpoints follow the standard error format (architecture §4.2):

| Status | Code | When |
| ------ | ---- | ---- |
| 400 | `VALIDATION_ERROR` | Invalid input (Zod validation failure) |
| 401 | `UNAUTHORIZED` | Missing/invalid token |
| 403 | `FORBIDDEN` | Token lacks `super_admin` role |
| 404 | `NOT_FOUND` | Tenant/plugin/deletion step not found |
| 409 | `CONFLICT` | Optimistic lock version mismatch (005-05/06/07) |
| 409 | `CONFLICT` | Provisioning: schema/realm/bucket already exists (005-04) |
| 403 | `TENANT_PENDING_DELETION` | Non-admin request to a `pending_deletion` tenant — rejected same as `suspended` (C-3) |
| 422 | `CONFIRMATION_REQUIRED` | Delete request missing or incorrect `confirmSlug` (005-07) |
| 503 | `SERVICE_UNAVAILABLE` | Loki unreachable for logs query (005-10) |
| 503 | `LOG_QUERY_TIMEOUT` | Loki query exceeded 5s timeout — `{ error: "LOG_QUERY_TIMEOUT", message: "Log query timed out" }` (005-10) |

> **W-6 — Loki query timeout**: The logs proxy endpoint
> (`GET /admin/logs`) uses `AbortSignal.timeout(5000)` on the Loki HTTP
> call. If the timeout fires, the endpoint returns `503` with
> `{ error: "LOG_QUERY_TIMEOUT", message: "Log query timed out" }`. This
> is distinct from Loki being unreachable (503 `SERVICE_UNAVAILABLE`).

---

## 7. Implementation Sequence

The 11 features are ordered by dependency to allow incremental E2E testing.
Each feature can be merged independently once its dependencies are in place.

### 7.0 Task 0 — Security Fix (Pre-Implementation)

> **Must be done BEFORE any Spec 005 feature work.** This is a fix to an
> existing security bug (C-6), not a new feature.

**Update `services/core-api/src/middleware/require-super-admin.ts`** to
enforce `user.realm === config.KEYCLOAK_MASTER_REALM`, matching the H-03
fix pattern currently inlined in `tenant-routes.ts`. The current shared
middleware only checks the `super_admin` role — a tenant admin who creates
a `super_admin` role in their own realm can escalate. The fix:

```typescript
export async function requireSuperAdmin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const user = request.user as { roles?: string[]; realm?: string } | undefined;
  if (!user) throw new UnauthorizedError('Authentication required');
  if (user.realm !== config.KEYCLOAK_MASTER_REALM) {
    throw new UnauthorizedError('super_admin endpoints require a master realm token');
  }
  if (!user.roles?.includes('super_admin')) {
    throw new UnauthorizedError('super_admin role required');
  }
}
```

**Remove the inline `requireSuperAdmin` function** from
`tenant/tenant-routes.ts` (lines 34-41) and use the shared middleware
everywhere. The `POST /api/admin/tenants` and `POST /api/admin/tenants/migrate-all`
routes switch to `preHandler: [requireSuperAdmin]` (the shared version).

**Files modified**:
- `services/core-api/src/middleware/require-super-admin.ts` — add realm check + import `config`
- `services/core-api/src/modules/tenant/tenant-routes.ts` — remove inline function, use shared middleware

| Order | Feature | Rationale | Dependencies |
| ----- | ------- | --------- | ------------ |
| **1** | **005-09** System health check | Independent — no dependency on other features. Only needs health checker service + infra probes. | Prisma migration (for `version` column — migration is a prerequisite for all) |
| **2** | **005-02** Tenant list | Needs only `core.tenants` (existing). Foundational for 005-03, 005-04, 005-05, 005-06, 005-07. | None (uses existing table) |
| **3** | **005-03** Tenant detail | Depends on 005-02 (tenant list links to detail). Needs cross-schema aggregates + audit log. | 005-02, Prisma migration (platform_audit_log) |
| **4** | **005-04** Tenant provisioning | Builds on existing `tenant-provisioning.ts`. Adds conflict detection + audit log. Must come before suspend/reactivate/delete (need a tenant to act on). | 005-02, Prisma migration |
| **5** | **005-05** Tenant suspension | Depends on 005-04 (need a provisioned tenant). Needs optimistic lock (version column). | 005-04, Prisma migration |
| **6** | **005-06** Tenant reactivation | Depends on 005-05 (need a suspended tenant to reactivate). Same optimistic lock pattern. | 005-05 |
| **7** | **005-07** Tenant deletion | Depends on 005-04 (need a tenant to delete). Needs `tenant_deletion_steps` table + deletion saga. Most complex — last of the lifecycle features. | 005-04, Prisma migration |
| **8** | **005-08** Plugin catalog management | Independent of tenant lifecycle. Extends existing plugin admin routes. Needs audit log for publish/unpublish actions. | Prisma migration (platform_audit_log) |
| **9** | **005-11** Kafka status | Depends on Spec 004's Kafka infra (already implemented). Wraps existing `lag-metrics.service.ts`. Adds DLQ size per plugin. | Spec 004 (existing) |
| **10** | **005-10** System logs | Depends on Loki infrastructure (§5.1). Needs `pino-loki` transport + Loki query proxy. | Loki + Grafana infra, `pino-loki` dependency |
| **11** | **005-01** Dashboard | Last — aggregates metrics from all other features. Needs tenant count, user count (aggregation job), active plugins, status breakdown. Depends on metrics aggregator + Redis keys. | 005-02, 005-08, Prisma migration |

### 7.1 Migration First

The Prisma migration (§5.3) is a **hard prerequisite** for all features. It
creates `tenant_deletion_steps`, `platform_audit_log`, and adds `version` to
`core.tenants`. This migration is applied as the first task before any feature
implementation begins.

### 7.2 Infra Parallel Track

Loki + Grafana infrastructure (§5.1) and the `pino-loki` transport (§5.2) can
be set up in parallel with the first features. They are only needed by 005-10
(order 10) but should be ready earlier for log visibility during development.

---

## 8. Testing Strategy

### 8.1 E2E Tests (Playwright)

One spec file per feature, in `apps/admin/e2e/`:

| Spec File | Feature | What It Tests |
| --------- | ------- | ------------- |
| `005-01-dashboard.spec.ts` | 005-01 | Super admin sees tenant count, user count, active plugins, status breakdown on dashboard |
| `005-02-tenant-list.spec.ts` | 005-02 | Search tenant by name, filter by status, pagination works |
| `005-03-tenant-detail.spec.ts` | 005-03 | Navigate to tenant detail, see info/users/plugins/audit tabs |
| `005-04-provisioning.spec.ts` | 005-04 | Complete provisioning wizard, verify tenant operational (login as tenant admin, schema exists, realm exists, bucket exists) |
| `005-05-suspend.spec.ts` | 005-05 | Suspend tenant, verify users cannot access (login attempt fails), verify atomic propagation |
| `005-06-reactivate.spec.ts` | 005-06 | Reactivate suspended tenant, verify users can access again |
| `005-07-deletion.spec.ts` | 005-07 | Delete tenant with type-to-confirm, verify schema dropped, realm deleted, bucket deleted — all three resources gone |
| `005-08-plugin-catalog.spec.ts` | 005-08 | Publish a draft plugin, verify it appears in marketplace; unpublish, verify it disappears; submit review |
| `005-09-health-check.spec.ts` | 005-09 | View health dashboard, see all services (DB, Keycloak, Redis, Kafka, MinIO) with status enum |
| `005-10-logs.spec.ts` | 005-10 | View system logs, filter by tenant + level + time range, verify results |
| `005-11-kafka-status.spec.ts` | 005-11 | View Kafka status, see consumer lag per plugin, DLQ size per plugin |

**E2E test setup**:
- `global-setup.ts` seeds data and creates a unique, run-scoped confidential
  helper. Direct grants exist only there; `fullScopeAllowed` is false and only
  required role mappings are attached.
- Generate its secret per run with no committed/default fallback; never log it.
  Refuse setup outside explicit local/CI E2E infrastructure.
- `global-teardown.ts` plus failure cleanup deletes the helper.
- `helpers/admin-login.ts` exercises Keycloak browser PKCE and `/callback`.
- `helpers/api-client.ts` — admin API helper for test assertions (verify
  schema dropped, realm deleted, bucket deleted) with the scoped helper token,
  never `admin-cli`.

Bootstrap credentials may call Keycloak Admin REST only to create/delete the
helper; that control-plane token is never sent to Plexica APIs.

**Destructive operation cleanup**:
- `005-07-deletion.spec.ts` creates a dedicated test tenant (e.g.,
  `e2e-delete-test`) and deletes it — no cleanup needed (the test IS the
  deletion). The test tenant is provisioned in `global-setup.ts` or the
  spec's `beforeAll`.
- `005-04-provisioning.spec.ts` provisions a test tenant and cleans it up
  in `afterAll` via the deletion API (or direct DB/realm/bucket cleanup).

### 8.2 Integration Tests (Vitest)

Integration tests with real DB, real Keycloak, real MinIO, real Redis:

| Test File | Endpoints Tested | Focus |
| --------- | ---------------- | ----- |
| `admin/dashboard.routes.int.test.ts` | GET /admin/dashboard | Metrics aggregation, Redis pre-aggregated values |
| `admin/tenant-list.routes.int.test.ts` | GET /admin/tenants | Search, filter, pagination with real tenant data |
| `admin/tenant-detail.routes.int.test.ts` | GET /admin/tenants/:id | Cross-schema aggregate counts, audit log |
| `admin/tenant-provision.routes.int.test.ts` | POST /admin/tenants | Full provisioning with real Keycloak + MinIO; conflict detection (schema/realm/bucket already exists) |
| `admin/tenant-suspend.routes.int.test.ts` | POST /admin/tenants/:id/suspend | Optimistic lock, 409 on version mismatch, Keycloak realm disabled, Redis cache invalidated |
| `admin/tenant-reactivate.routes.int.test.ts` | POST /admin/tenants/:id/reactivate | Reverse of suspend |
| `admin/tenant-delete.routes.int.test.ts` | DELETE /admin/tenants/:id | Deletion saga: all three steps complete, tenant marked deleted; confirmation slug required |
| `admin/deletion-status.routes.int.test.ts` | GET /admin/tenants/:id/deletion-status, POST /admin/deletions/:stepId/retry | Stuck deletion, retry single step |
| `admin/plugin-catalog.routes.int.test.ts` | GET /admin/plugins, POST publish/unpublish/review | Catalog list, publish with manifest validation, unpublish with installed count warning |
| `admin/health.routes.int.test.ts` | GET /admin/health | All services healthy; degraded/down detection |
| `admin/logs.routes.int.test.ts` | GET /admin/logs | Loki proxy, filter translation, 503 when Loki unavailable |
| `admin/audit-log.routes.int.test.ts` | GET /admin/audit-logs | Audit log query with filters |
| `admin/kafka-status.routes.int.test.ts` | GET /admin/system/kafka | Consumer lag, DLQ size per plugin |

### 8.3 Unit Tests (Vitest)

| Test File | Focus |
| --------- | ----- |
| `admin/services/deletion-saga.service.test.ts` | Saga orchestration: step ordering, status transitions, never mark deleted until all done |
| `admin/services/health-checker.service.test.ts` | Status enum logic: healthy/degraded/down based on latency + response |
| `admin/services/metrics-aggregator.service.test.ts` | Cross-schema count aggregation, Redis key updates |
| `admin/services/logs-query.service.test.ts` | LogQL filter construction (tenant → label, level → line filter), no string interpolation of user input |
| `admin/services/audit-log.service.test.ts` | Audit entry creation, metadata structure (no PII) |
| `admin/lib/optimistic-lock.test.ts` | Version mismatch → 409, version increment on success |

### 8.4 Edge Case Integration Tests (W-4)

These explicit edge case tests must be present as `it()` cases within the
existing integration test files listed in §8.2 (not separate files):

| Test Case | File | What It Asserts |
| --------- | ---- | --------------- |
| Plugin publish with broken manifest → 400 with field-level errors | `plugin-catalog.routes.int.test.ts` | Invalid manifest (missing required fields, wrong types); `POST /publish` returns 400 `VALIDATION_ERROR` with per-field messages; plugin `status` stays `draft` |
| Unpublish plugin installed by tenants → `deprecated` + warning | `plugin-catalog.routes.int.test.ts` + `005-08-plugin-catalog.spec.ts` | Install plugin in test tenant, then unpublish; response has `installedCount > 0`, `status: "deprecated"`; plugin gone from marketplace, existing install works |
| Unpublish plugin with no installs → `unpublished` | `plugin-catalog.routes.int.test.ts` | Unpublish plugin with zero installs; response has `status: "unpublished"` (not `deprecated`) |
| Concurrent suspend + reactivate → 409 Conflict | `tenant-suspend.routes.int.test.ts` | Two concurrent requests with same `version`; one 200, one 409 `CONFLICT` |
| Provisioning — schema already exists → 409 | `tenant-provision.routes.int.test.ts` | Pre-create `tenant_<slug>` schema; `POST /admin/tenants` returns 409 `{ conflictType: "schema_exists" }` |
| Provisioning — realm already exists → 409 | `tenant-provision.routes.int.test.ts` | Pre-create `plexica-<slug>` realm; returns 409 `{ conflictType: "realm_exists" }` |
| Provisioning — bucket already exists → 409 | `tenant-provision.routes.int.test.ts` | Pre-create `tenant-<slug>` bucket; returns 409 `{ conflictType: "bucket_exists" }` |

---

## 9. File Inventory

### 9.1 Backend — `services/core-api/src/modules/admin/`

| Path | Purpose | Est. Lines |
| ---- | ------- | ---------- |
| `index.ts` | Module Fastify plugin — registers all route groups | ~50 |
| `schemas/tenant-schemas.ts` | Zod schemas for tenant operations | ~80 |
| `schemas/plugin-catalog-schemas.ts` | Zod schemas for plugin catalog | ~40 |
| `schemas/dashboard-schemas.ts` | Zod schemas for dashboard | ~20 |
| `schemas/health-schemas.ts` | Zod schemas for health check | ~25 |
| `schemas/logs-schemas.ts` | Zod schemas for logs query + Loki response | ~40 |
| `schemas/audit-schemas.ts` | Zod schemas for audit log | ~30 |
| `schemas/kafka-schemas.ts` | Zod schemas for Kafka status | ~20 |
| `services/dashboard-metrics.service.ts` | Reads pre-aggregated Redis metrics | ~60 |
| `services/tenant-list.service.ts` | Tenant list with search + filter | ~70 |
| `services/tenant-detail.service.ts` | Cross-schema aggregate for detail | ~90 |
| `services/tenant-suspend.service.ts` | Suspend saga | ~80 |
| `services/tenant-reactivate.service.ts` | Reactivate logic | ~60 |
| `services/deletion-saga.service.ts` | Deletion saga orchestrator | ~90 |
| `services/deletion-step-schema-drop.ts` | Step: DROP SCHEMA | ~40 |
| `services/deletion-step-realm-delete.ts` | Step: delete Keycloak realm | ~40 |
| `services/deletion-step-bucket-delete.ts` | Step: delete MinIO bucket | ~50 |
| `services/deletion-retry.service.ts` | Retry single failed step | ~60 |
| `services/health-checker.service.ts` | Orchestrates health probes | ~60 |
| `services/health-check-postgres.ts` | PostgreSQL probe | ~30 |
| `services/health-check-redis.ts` | Redis probe | ~25 |
| `services/health-check-keycloak.ts` | Keycloak probe | ~30 |
| `services/health-check-kafka.ts` | Kafka probe | ~30 |
| `services/health-check-minio.ts` | MinIO probe | ~30 |
| `services/logs-query.service.ts` | Loki query proxy + LogQL builder | ~90 |
| `services/audit-log.service.ts` | Platform audit log CRUD | ~80 |
| `services/metrics-aggregator.service.ts` | Scheduled aggregation job | ~80 |
| `services/kafka-status.service.ts` | Wraps lag-metrics + DLQ size | ~60 |
| `lib/optimistic-lock.ts` | Optimistic lock helper | ~50 |
| `routes/dashboard.routes.ts` | GET /admin/dashboard | ~40 |
| `routes/tenant-list.routes.ts` | GET /admin/tenants | ~50 |
| `routes/tenant-detail.routes.ts` | GET /admin/tenants/:id | ~60 |
| `routes/tenant-provision.routes.ts` | POST /admin/tenants | ~70 |
| `routes/tenant-suspend.routes.ts` | POST /admin/tenants/:id/suspend | ~50 |
| `routes/tenant-reactivate.routes.ts` | POST /admin/tenants/:id/reactivate | ~50 |
| `routes/tenant-delete.routes.ts` | DELETE /admin/tenants/:id | ~70 |
| `routes/deletion-status.routes.ts` | GET deletion-status + POST retry | ~70 |
| `routes/plugin-catalog.routes.ts` | POST /admin/plugins/:slug/review (only review endpoint) | ~60 |
| `routes/health.routes.ts` | GET /admin/health | ~35 |
| `routes/logs.routes.ts` | GET /admin/logs | ~50 |
| `routes/audit-log.routes.ts` | GET /admin/audit-logs | ~50 |
| `routes/kafka-status.routes.ts` | GET /admin/system/kafka | ~40 |

### 9.2 Backend — Tests

| Path | Purpose |
| ---- | ------- |
| `__tests__/admin/dashboard.routes.int.test.ts` | Integration: dashboard |
| `__tests__/admin/tenant-list.routes.int.test.ts` | Integration: tenant list |
| `__tests__/admin/tenant-detail.routes.int.test.ts` | Integration: tenant detail |
| `__tests__/admin/tenant-provision.routes.int.test.ts` | Integration: provisioning |
| `__tests__/admin/tenant-suspend.routes.int.test.ts` | Integration: suspend |
| `__tests__/admin/tenant-reactivate.routes.int.test.ts` | Integration: reactivate |
| `__tests__/admin/tenant-delete.routes.int.test.ts` | Integration: deletion |
| `__tests__/admin/deletion-status.routes.int.test.ts` | Integration: deletion status + retry |
| `__tests__/admin/plugin-catalog.routes.int.test.ts` | Integration: plugin catalog |
| `__tests__/admin/health.routes.int.test.ts` | Integration: health check |
| `__tests__/admin/logs.routes.int.test.ts` | Integration: logs proxy |
| `__tests__/admin/audit-log.routes.int.test.ts` | Integration: audit log |
| `__tests__/admin/kafka-status.routes.int.test.ts` | Integration: Kafka status |
| `__tests__/admin/deletion-saga.service.test.ts` | Unit: deletion saga logic |
| `__tests__/admin/health-checker.service.test.ts` | Unit: health checker logic |
| `__tests__/admin/metrics-aggregator.service.test.ts` | Unit: metrics aggregation |
| `__tests__/admin/logs-query.service.test.ts` | Unit: LogQL construction |
| `__tests__/admin/audit-log.service.test.ts` | Unit: audit log service |
| `__tests__/admin/optimistic-lock.test.ts` | Unit: optimistic lock |

### 9.3 Frontend — `apps/admin/`

| Path | Purpose | Est. Lines |
| ---- | ------- | ---------- |
| `package.json` | Dependencies + scripts | ~40 |
| `vite.config.ts` | Vite config (no MF) | ~30 |
| `tsconfig.json` | TypeScript config | ~30 |
| `tailwind.config.ts` | Tailwind config | ~25 |
| `postcss.config.js` | PostCSS config | ~10 |
| `index.html` | HTML entry | ~15 |
| `playwright.config.ts` | Playwright config (port 3002) | ~40 |
| `src/main.tsx` | Entry point | ~35 |
| `src/router.tsx` | Router setup | ~30 |
| `src/router-shell.tsx` | Root + shell route + auth guard | ~60 |
| `src/router-shell-routes.tsx` | All child routes | ~80 |
| `src/app.tsx` | App shell (placeholder re-export) | ~10 |
| `src/styles/globals.css` | Tailwind globals | ~10 |
| `src/stores/auth-store.ts` | Zustand auth store (master realm) | ~130 |
| `src/services/api-client.ts` | Fetch wrapper (master realm, no tenant header) | ~100 |
| `src/services/keycloak-auth.ts` | Master-realm PKCE S256 + RP logout | ~70 |
| `src/services/admin-api.ts` | Admin API methods | ~120 |
| `src/hooks/use-dashboard.ts` | Dashboard metrics query | ~20 |
| `src/hooks/use-tenants.ts` | Tenant list + detail queries | ~40 |
| `src/hooks/use-tenant-lifecycle.ts` | Suspend/reactivate/delete mutations | ~50 |
| `src/hooks/use-deletion-status.ts` | Deletion status query + retry mutation | ~30 |
| `src/hooks/use-plugin-catalog.ts` | Plugin catalog queries + mutations | ~50 |
| `src/hooks/use-health.ts` | Health check query (polling) | ~20 |
| `src/hooks/use-logs.ts` | Logs query | ~25 |
| `src/hooks/use-audit-log.ts` | Audit log query | ~25 |
| `src/hooks/use-kafka-status.ts` | Kafka status query | ~20 |
| `src/components/layout/admin-shell.tsx` | Main layout | ~80 |
| `src/components/layout/sidebar.tsx` | Navigation sidebar | ~70 |
| `src/components/auth/auth-guard.tsx` | Auth guard | ~30 |
| `src/pages/login-page.tsx` | Keycloak redirect/fallback; no credentials | ~60 |
| `src/pages/auth-callback-page.tsx` | PKCE callback validation/exchange | ~80 |
| `src/components/auth/session-expired-handler.tsx` | Expiry notice + re-authentication | ~50 |
| `src/components/dashboard/dashboard-page.tsx` | 005-01 dashboard | ~90 |
| `src/components/dashboard/metric-card.tsx` | Metric card | ~40 |
| `src/components/tenants/tenant-list-page.tsx` | 005-02 tenant list | ~100 |
| `src/components/tenants/tenant-detail-page.tsx` | 005-03 detail | ~80 |
| `src/components/tenants/tenant-detail-info.ts` | Info tab | ~60 |
| `src/components/tenants/tenant-detail-plugins.ts` | Plugins tab | ~60 |
| `src/components/tenants/tenant-detail-audit.ts` | Audit tab | ~60 |
| `src/components/tenants/provision-wizard-page.tsx` | 005-04 wizard | ~90 |
| `src/components/tenants/provision-wizard-step-1.ts` | Step 1 | ~70 |
| `src/components/tenants/provision-wizard-step-2.ts` | Step 2 | ~60 |
| `src/components/tenants/provision-wizard-step-3.ts` | Step 3 | ~60 |
| `src/components/tenants/suspend-dialog.tsx` | 005-05 dialog | ~50 |
| `src/components/tenants/reactivate-dialog.tsx` | 005-06 dialog | ~50 |
| `src/components/tenants/delete-dialog.tsx` | 005-07 type-to-confirm | ~70 |
| `src/components/tenants/deletion-status-panel.tsx` | Deletion status | ~70 |
| `src/components/plugins/plugin-catalog-page.tsx` | 005-08 catalog | ~100 |
| `src/components/plugins/plugin-review-dialog.tsx` | Review dialog | ~60 |
| `src/components/health/health-page.tsx` | 005-09 health | ~80 |
| `src/components/health/service-status-card.tsx` | Status card | ~50 |
| `src/components/logs/logs-page.tsx` | 005-10 logs | ~90 |
| `src/components/logs/log-filters.tsx` | Filter bar | ~70 |
| `src/components/kafka/kafka-status-page.tsx` | 005-11 kafka | ~90 |
| `src/types/admin-types.ts` | TypeScript types | ~80 |
| `src/i18n/messages.en.ts` | Main i18n entry | ~10 |
| `src/i18n/messages.en.dashboard.ts` | Dashboard messages | ~30 |
| `src/i18n/messages.en.tenants.ts` | Tenant messages | ~50 |
| `src/i18n/messages.en.plugins.ts` | Plugin messages | ~30 |
| `src/i18n/messages.en.system.ts` | Health + logs + kafka messages | ~40 |

### 9.4 Frontend — E2E Tests

| Path | Purpose |
| ---- | ------- |
| `e2e/global-setup.ts` | Guarded run-scoped helper client + seed data |
| `e2e/global-teardown.ts` | Failure-safe helper deletion |
| `e2e/helpers/admin-login.ts` | Browser PKCE login helper |
| `e2e/helpers/api-client.ts` | API assertions with E2E-only helper token |
| `e2e/005-01-dashboard.spec.ts` | Dashboard E2E |
| `e2e/005-02-tenant-list.spec.ts` | Tenant list E2E |
| `e2e/005-03-tenant-detail.spec.ts` | Tenant detail E2E |
| `e2e/005-04-provisioning.spec.ts` | Provisioning wizard E2E |
| `e2e/005-05-suspend.spec.ts` | Suspension E2E |
| `e2e/005-06-reactivate.spec.ts` | Reactivation E2E |
| `e2e/005-07-deletion.spec.ts` | GDPR deletion E2E |
| `e2e/005-08-plugin-catalog.spec.ts` | Plugin catalog E2E |
| `e2e/005-09-health-check.spec.ts` | Health check E2E |
| `e2e/005-10-logs.spec.ts` | System logs E2E |
| `e2e/005-11-kafka-status.spec.ts` | Kafka status E2E |

### 9.5 Infrastructure

| Path | Purpose |
| ---- | ------- |
| `docker-compose.yml` | Modified: add `loki` + `grafana` services |
| `infra/loki/local-config.yaml` | Loki single-node config |
| `infra/grafana/provisioning/datasources/loki.yml` | Loki datasource |
| `infra/grafana/provisioning/datasources/prometheus.yml` | Prometheus datasource |
| `infra/grafana/dashboards/` | Dashboard JSON files (optional this sprint) |
| `infra/keycloak/admin-client-realm.json` | S256, exact URIs, direct grants disabled |

### 9.6 Backend — Modified Files

| Path | Change | Reason |
| ---- | ------ | ------ |
| `services/core-api/src/index.ts` | Register `adminRoutes` in admin scope + start metrics aggregator | New admin module |
| `services/core-api/src/lib/logger.ts` | Add `pino-loki` transport when `LOKI_URL` is set | ADR-022 Decision 3 |
| `services/core-api/src/lib/config.ts` | Add `LOKI_URL`, `GRAFANA_URL` to Zod schema | New env vars |
| `services/core-api/prisma/schema.prisma` | Add `TenantDeletionStep`, `PlatformAuditLog` models; `version` column + `pending_deletion` enum on `Tenant`; review queue columns + `deprecated` status on `Plugin` | ADR-022 |
| `services/core-api/src/__tests__/rate-limit.test.ts` | Update test paths from `/api/admin/tenants` to `/api/v1/admin/tenants` (route move) | W-2 prefix alignment |
| `services/core-api/src/modules/tenant/tenant-routes.ts` | Remove `POST /api/admin/tenants` (superseded by admin module); remove inline `requireSuperAdmin` (use shared middleware) | Consolidation, C-6 fix |
| `services/core-api/src/modules/plugin/routes/admin-publish.routes.ts` | Update `unpublish` to set `deprecated` when plugin has existing installations, `unpublished` when none; update `publish` to require `reviewStatus === 'approved'` | C-2 fix, ADR-022 Decision 5 |
| `services/core-api/src/middleware/require-super-admin.ts` | Add master realm enforcement (`user.realm === config.KEYCLOAK_MASTER_REALM`) | C-6 security fix (Task 0) |
| `services/core-api/src/middleware/tenant-context.ts` | Reject `pending_deletion` tenant status same as `suspended` — return 403 `TENANT_PENDING_DELETION` | ADR-022 Decision 1 (N-1 fix) |
| `services/core-api/package.json` | Add `pino-loki` dependency | ADR-022 |

### 9.7 Root — Modified Files

| Path | Change | Reason |
| ---- | ------ | ------ |
| `pnpm-workspace.yaml` | Add `apps/admin` to workspace | New app |
| `.env.example` | Add `LOKI_URL`, `GRAFANA_URL` | New env vars |
| `.github/workflows/ci.yml` | Add admin app build + Playwright E2E (port 3002) + unit/integration tests | W-5 CI pipeline |

---

## 10. Requirement Traceability

| Feature ID | Spec Section | Plan Section | Backend Route File | Frontend Component | E2E Spec |
| ---------- | ------------ | ------------ | ------------------ | ------------------ | -------- |
| 005-01 | §4, §5 | §6 (#1), §7 (order 11) | `dashboard.routes.ts` | `dashboard-page.tsx` | `005-01-dashboard.spec.ts` |
| 005-02 | §4, §5 | §6 (#2), §7 (order 2) | `tenant-list.routes.ts` | `tenant-list-page.tsx` | `005-02-tenant-list.spec.ts` |
| 005-03 | §4, §5 | §6 (#3, #16), §7 (order 3) | `tenant-detail.routes.ts`, `audit-log.routes.ts` | `tenant-detail-page.tsx` | `005-03-tenant-detail.spec.ts` |
| 005-04 | §4, §5, §7 | §6 (#4), §7 (order 4) | `tenant-provision.routes.ts` | `provision-wizard-page.tsx` | `005-04-provisioning.spec.ts` |
| 005-05 | §4, §5, §7 | §6 (#5), §7 (order 5) | `tenant-suspend.routes.ts` | `suspend-dialog.tsx` | `005-05-suspend.spec.ts` |
| 005-06 | §4, §5, §7 | §6 (#6), §7 (order 6) | `tenant-reactivate.routes.ts` | `reactivate-dialog.tsx` | `005-06-reactivate.spec.ts` |
| 005-07 | §4, §5, §7 | §6 (#7, #8, #9), §7 (order 7) | `tenant-delete.routes.ts`, `deletion-status.routes.ts` | `delete-dialog.tsx`, `deletion-status-panel.tsx` | `005-07-deletion.spec.ts` |
| 005-08 | §4, §5 | §6 (#10-13), §7 (order 8) | `plugin-catalog.routes.ts` | `plugin-catalog-page.tsx` | `005-08-plugin-catalog.spec.ts` |
| 005-09 | §4, §5 | §6 (#14), §7 (order 1) | `health.routes.ts` | `health-page.tsx` | `005-09-health-check.spec.ts` |
| 005-10 | §4, §5, §8 | §6 (#15), §7 (order 10) | `logs.routes.ts` | `logs-page.tsx` | `005-10-logs.spec.ts` |
| 005-11 | §4, §5 | §6 (#17), §7 (order 9) | `kafka-status.routes.ts` | `kafka-status-page.tsx` | `005-11-kafka-status.spec.ts` |

### NFR Traceability

| NFR | Target | How Met |
| --- | ------ | ------- |
| Dashboard load < 2s | §9 | Pre-aggregated Redis metrics (no schema scan) |
| Tenant list < 1s (100+ tenants) | §9 | Indexed `core.tenants` table, pagination, Redis status counts |
| Provisioning < 30s | §9 | Existing `provisionTenant` is synchronous; Keycloak + MinIO + PG are fast in dev |
| Deletion < 30s | §9 | Deletion saga starts asynchronously (202 Accepted), steps execute via background job with retry. Deletion completes < 30s in the happy path. Stuck deletions surface in admin UI for manual retry. |
| Suspension propagation < 5s | §9 | Redis cache invalidation + Keycloak realm disable; middleware checks on every request |
| Health check < 500ms | §9 | Parallel health probes with 200ms timeout per service |
| Logs query < 2s | §9 | Loki query_range with limit; backend proxy is a simple HTTP forward |

### 10.2 CI Pipeline Changes (W-5)

`.github/workflows/ci.yml` must be updated to add admin app jobs:

| Job | Steps | Depends On |
| --- | ----- | ---------- |
| `admin-build` | `pnpm --filter @plexica/admin build` | Install |
| `admin-unit-int` | `pnpm --filter @plexica/admin test` (Vitest unit + integration) | admin-build |
| `admin-e2e` | Start admin dev server (port 3002) + core API + infra; `pnpm --filter @plexica/admin e2e` (Playwright) | admin-build, core-api running |

The admin E2E job runs in the same `docker compose up` environment as the
web E2E job (shared Keycloak, PostgreSQL, Redis, Kafka, MinIO, Loki). The
admin app Playwright config (`apps/admin/playwright.config.ts`) targets
port 3002. All 11 admin E2E spec files must pass for CI green (Rule 2).

---

## 11. Constitution Compliance

| Article | Status | Notes |
| ------- | ------ | ----- |
| Rule 1: E2E per feature | **COMPLIANT** | 11 E2E spec files (one per feature 005-01 through 005-11). Destructive operations (provision, suspend, delete) test against real Keycloak, real MinIO, real PostgreSQL — no mocks of core services (AGENTS.md testing rules). |
| Rule 2: No merge without green CI | **COMPLIANT** | Unit, integration, and E2E suites all pass before merge. Each feature merged independently with its own E2E spec. |
| Rule 3: One pattern per operation | **COMPLIANT** | TanStack Query; RHF+Zod where forms exist; no Plexica credential form; one Zustand store and PKCE S256 for browser auth. |
| Rule 4: No file above 200 lines | **COMPLIANT** | All backend route files decomposed (max ~90 lines). Deletion saga split across 3 step handler files. Health checker split across 5 probe files. All frontend components decomposed (max ~100 lines). Provisioning wizard split across 3 step files. Enforced via lint rule in CI. |
| Rule 5: ADR for significant decisions | **COMPLIANT** | ADR-022 covers data/infra. ADR-023 (Accepted) supersedes auth D-3 and covers PKCE, logout, persistence, client settings, and E2E isolation. |
| Rule 6: English commit messages | **COMPLIANT** | All commits for this sprint written in English. |

### Security Compliance

| Security Rule | Status | Notes |
| ------------- | ------ | ----- |
| §1 Tenant isolation | **COMPLIANT** | Deletion saga drops schema (full erasure). Admin routes operate on `core` schema only via `withCoreDb`. Cross-schema aggregates use parameterized schema names (validated slug → `toSchemaName`). No cross-tenant data leak. |
| §2 Authentication | **COMPLIANT** | Endpoints require `super_admin`; browser auth uses master-realm PKCE S256; public clients disable direct grants; logout terminates Keycloak SSO. |
| §3 SQL injection | **COMPLIANT** | All queries via Prisma parameterized. Cross-schema `SET search_path` uses validated slug (ID-001). Loki queries built via parameterized LogQL construction — no string interpolation of user input. |
| §4 Input validation | **COMPLIANT** | Zod schemas on every admin endpoint (§3.1 schemas/ directory). |
| §5 Secrets | **COMPLIANT** | Runtime credentials use env vars. E2E helper secrets are random per run, never committed/defaulted/logged, then torn down. |
| §6 PII | **COMPLIANT** | Pino logger redacts PII before shipping to Loki (existing redaction config). Platform audit log `metadata` carries structural data (slug, step, counts), not personal data. Health check returns status enum only — no connection strings or credentials. |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| **Loki unavailable in CI** | Logs E2E test (005-10) cannot run | Loki is added to docker-compose.yml — CI runs `docker compose up` with all services. If Loki is flaky in CI, the logs integration test returns 503 and the E2E test verifies the graceful degradation path. |
| **Deletion saga stuck in E2E** | 005-07 E2E test hangs if a step fails | Each deletion step has a timeout. The E2E test creates a dedicated test tenant with known state (no active connections, empty bucket). If the saga gets stuck, the test queries deletion-status and asserts the step state. |
| **Metrics aggregation job at scale** | `setInterval` aggregation scans all tenant schemas every 5 min — could be slow with 100+ tenants | The aggregation job counts rows in `user_profile` and `workspaces` tables across schemas. With 100 tenants this is 200 count queries — acceptable. For 1000+ tenants, a materialized view or per-tenant trigger would be needed (out of scope this sprint). |
| **Grafana port conflict** | Grafana defaults to port 3000, same as web app dev server | Grafana is mapped to host port 3001 (configurable). The web app's Vite dev server runs on 3000. The admin app runs on 3002. No conflict. |
| **`plexica-admin` settings/URIs drift** | Login, callback, or logout fails; PKCE bypass risk | Provision ADR-023 per environment; reject wildcards and validate S256, callback, and RP logout before merge. |
| **Existing `POST /api/admin/tenants` route duplication** | Two routes at the same path → Fastify error | The old route in `tenant/tenant-routes.ts` is removed when the new `tenant-provision.routes.ts` in the admin module is registered. The Route Ownership Table (§3.4) documents explicit ownership of every admin route — `publish`/`unpublish` stay in `admin-publish.routes.ts`, only `review` is new. This is a coordinated change in one PR. |
| **Optimistic lock 409 on legitimate retry** | Admin user sees confusing 409 error | The frontend handles 409 by re-fetching the tenant detail and showing a "tenant was modified by another admin" message with a retry button. The mutation hook's `onError` checks for 409 status. |

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Spec | `.forge/specs/005-super-admin/spec.md` |
| ADR-022 | `.forge/knowledge/adr/adr-022-super-admin-infra-and-data-model.md` |
| ADR-023 | `.forge/knowledge/adr/adr-023-admin-pkce-auth.md` |
| Architecture | `.forge/architecture/architecture.md` (§4.3 admin routes, §3.2 data model, §7.1 logging) |
| Constitution | `.forge/constitution.md` |
| Product Brief | `.forge/product-brief.md` (Super Admin persona) |
| Docker Compose | `docker-compose.yml` (existing infra services) |
| ADR-001 | `.forge/knowledge/adr/adr-001-schema-per-tenant.md` |
| ADR-002 | `.forge/knowledge/adr/adr-002-keycloak-multi-realm.md` |
| ADR-004 | `.forge/knowledge/adr/adr-004-kafka-redpanda-event-bus.md` |
| ADR-016 | `.forge/knowledge/adr/adr-016-two-tier-dead-letter-queue.md` |
