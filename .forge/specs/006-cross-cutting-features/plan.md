# Plan: 006 — Cross-Cutting Features

> Technical implementation plan for the Cross-Cutting Features phase (Phase 5).
> Created by `forge-architect` via `/forge-plan`. Translates Spec 006 (20
> features across 4 sections) into a concrete implementation blueprint with
> data models, API contracts, file maps, and testing strategy. Aligned with
> `.forge/sprints/active/sprint-006.yaml` (13 stories, 27 pts, 4 phases).

| Field  | Value                                                          |
| ------ | -------------------------------------------------------------- |
| Status | Draft                                                          |
| Author | forge-architect                                                |
| Date   | 2026-09-17                                                     |
| Track  | Feature                                                        |
| Spec   | `.forge/specs/006-cross-cutting-features/spec.md`              |
| ADR    | **ADR-035** (Accepted 2026-09-17 — manual SSE, `notifications` + `email_queue` tables, consumer topology); **ADR-036** (Accepted 2026-09-17 — `prom-client`); ADR-034 (accepted, storage vocabulary — respected) |

> **ADR status (Constitution Rule 5 / Governance)**: both ADRs required by this
> plan are now **Accepted** (2026-09-17) — see §3.3:
> - **ADR-035 — Real-time Notification Delivery** (**Accepted**): bundles the
>   manual-SSE mechanism (story E06-S001 already decided: no new core dependency,
>   Fastify `reply.raw`), the new tenant `notifications` table (a **new core
>   entity** — explicitly an ADR trigger per AGENTS.md governance), the
>   `core.email_queue` retry table, and the notification Kafka consumer
>   topology. Settles the emit contract (`202 { status: "accepted",
>   notificationId }` — §5.1).
> - **ADR-036 — Prometheus metrics via `prom-client`** (**Accepted**): the **new
>   core dependency** in `services/core-api/package.json` (constitution: "New
>   dependencies require an ADR"). Required by 006-17/006-18/006-20.
> The §13 Rule 5 implementation gate is cleared — Phase 1 and Phase 4 may start.

---

## 1. Overview

This plan delivers the four horizontal capability groups of Spec 006 into the
existing Plexica v2 monolith (`services/core-api`) and web app (`apps/web`),
reusing the confirmed architecture (`architecture.md` §2.2, §3.2, §4.1, §5.2,
§7) and the already-merged foundations from Specs 002–005.

**6.1 Notifications** — greenfield `modules/notification/` module: manual SSE
delivery (no new dependency), a tenant `notifications` table, a notification
Kafka consumer that reuses the existing outbox → Kafka → DLQ pipeline
(`events/outbox-repository.ts`, `events/outbox-publisher.ts`, ADR-004, ADR-016),
an SMTP retry queue backed by a new `core.email_queue` table, per-type
notification preferences on the existing `user_profile.notification_prefs`
JSONB, and plugin notification emission via the plugin SDK.

**6.2 i18n** — full react-intl migration already partially in place
(`apps/web/src/i18n/`). Adds an Italian catalog, a locale-driven `IntlProvider`
with no page reload, locale-aware formatting, plugin translation registration
via Module Federation remote assets, and tenant translation overrides.

**6.3 User Profile** — extends the existing `modules/user-profile/` module
(view/edit already present, E2E-08). Adds Keycloak `picture`-claim avatar
display, active session listing/termination via the Keycloak Admin API, and
password change via redirect to the Keycloak account console.

**6.4 Observability** — upgrades `/health` from liveness to deep dependency
probes (reusing the Spec 005 admin probe services), adds a Prometheus `/metrics`
endpoint (`prom-client`), request-context structured logging (requestId,
tenantId, userId, correlationId), a base Grafana dashboard, and a Kafka
monitoring dashboard. 006-19 (OpenTelemetry) is **deferred to Sprint 7** per
`sprint-006.yaml`.

**Reference documents**:
- Spec: `.forge/specs/006-cross-cutting-features/spec.md` — features, NFRs, risk table
- Architecture: `.forge/architecture/architecture.md` — §2.2 (notification module),
  §3.2/§3.3 (`notifications` model + index), §4.1 (notification/profile/health/metrics
  endpoints), §5.2 (Kafka), §7 (logging/monitoring)
- ADR-002 (Keycloak multi-realm), ADR-004 (Kafka/Redpanda event bus, amended),
  ADR-010 (Keycloakify theme), ADR-012 (rate limiting), ADR-016 (two-tier DLQ),
  ADR-023 (PKCE), ADR-034 (Silo/storage vocabulary)
- Sprint: `.forge/sprints/active/sprint-006.yaml` (13 stories, 27 pts)
- Story: `.forge/epics/epic-06-cross-cutting/story-E06-S001-sse-notification-infrastructure.md`
  (006-01 is pre-broken into 7 tasks — reused/adapted in §9 Phase 1)

### 1.1 Key Constraints Discovered in the Codebase

| Constraint | Evidence | Plan consequence |
| ---------- | -------- | ---------------- |
| `notifications` table **does not exist** in the tenant Prisma schema; only `user_profile.notification_prefs` exists | `prisma/tenant-schema/core-models.prisma` | New model + migration (§4.1) |
| No `workspace.invite` event is emitted today — invitation service writes no outbox events | `modules/invitation/service.ts`, grep for `enqueueEvent` | Add outbox emission in invitation create (§5.3) |
| `GET /health` is a **liveness-only** endpoint whose payload is asserted by the CI runtime contract | `modules/health/basic-health-routes.ts`, `apps/web/e2e/ci-runtime-contract.spec.ts` | Upgrade payload **additively** (`status`, `version` kept); `basic-health-routes.ts` **superseded** — observability probe serves both `/health` + `/api/v1/health` (§5.6, F7) + update contract test (§9 Phase 4) |
| SSE must avoid new core deps (story E06-S001 decided: Fastify `reply.raw`) | story file, Constitution Rule 5 | Manual SSE implementation (§5.1) |
| Grafana datasources are already provisioned (Prometheus + Loki) but **no Prometheus service exists** and `/metrics` does not exist | `infra/grafana/provisioning/datasources/prometheus.yml` | Add Prometheus service to compose + `prom-client` (§5.6, §7) |
| `terminateUserSessions(realm, userId)` already exists in Keycloak helpers; individual session list/delete does not | `lib/keycloak-admin-users.ts` | Add `listUserSessions` / `deleteUserSession` (§5.4) |
| Avatar today is upload-based (`avatarPath` + presigned URL); JWT `picture` claim not used | `modules/user-profile/service.ts` | Prefer `picture` claim, fall back to upload (§5.4) |
| Plugin events emit via `POST /api/v1/events/emit` with plugin service identity | `modules/plugin/routes/events.routes.ts`, `middleware/plugin-event-auth.ts` | Mirror this pattern for notification emission (§5.1 `POST /notifications/emit`) |
| Admin health probes exist (postgres, redis, keycloak, kafka) | `modules/admin/services/health-check-*.ts` | Reuse, do not duplicate (§5.5) |

---

## 2. Requirements Analysis

### 2.1 Functional Requirements (20/20)

| ID | Feature | Backend | Frontend | Priority |
| -- | ------- | ------- | -------- | -------- |
| 006-01 | Real-time in-app notifications (SSE) | `modules/notification/` SSE route + consumer | SSE client + notification bell | High |
| 006-02 | Notification center (list, mark read) | `GET /notifications`, `PATCH /:id/read`, `POST /read-all` | Notification center page | High |
| 006-03 | Email notifications | `core.email_queue` + worker + Mailpit | — (email is out-of-app) | High |
| 006-04 | Per-user notification preferences | `GET/PATCH /notifications/preferences` | Preferences page | High |
| 006-05 | Plugins generate notifications | `POST /notifications/emit` + rate limit + SDK | CRM demo emission | High |
| 006-06 | All frontend strings from react-intl | — | Catalog domains + lint rule | High |
| 006-07 | Language switch (EN/IT) | profile `language` already synced | Locale store + IntlProvider re-render | High |
| 006-08 | Locale-aware date/number formatting | — | Formatting helper + `<FormattedDate/Number>` | Medium |
| 006-09 | Plugin translations via SDK | Manifest `i18n` bundles | Shell merges MF remote bundles | Medium |
| 006-10 | Tenant translation overrides | `GET/PUT /tenant/translations` (tenant-settings) | Admin settings UI | Medium |
| 006-11 | Profile page with personal data | `PATCH /profile` + email sync to Keycloak | Existing profile page + email field | High |
| 006-12 | Avatar from JWT `picture` claim | `getProfile` merges claim | Header + profile avatar | Medium |
| 006-13 | Active session management | `GET /profile/sessions`, `DELETE /:sessionId` | Sessions card | Medium |
| 006-14 | Password change → Keycloak console | Account URL in profile payload | Link/button | Medium |
| 006-15 | Health check `/health` (DB/Redis/Keycloak/Kafka) | `modules/observability/` deep probe | — (ops endpoint) | High |
| 006-16 | Structured Pino logs with requestId/tenantId/userId | `lib/request-context.ts` ASLS | — | High |
| 006-17 | Prometheus `/metrics` | `prom-client` registry + hooks | — | High |
| 006-18 | Base Grafana dashboard | — | `infra/grafana/dashboards/` | Medium |
| 006-19 | OpenTelemetry tracing (optional) | **Deferred to Sprint 7** — feature flag stub only | — | Low |
| 006-20 | Kafka monitoring dashboard | `kafka-metrics.ts` gauges | `infra/grafana/dashboards/` | Medium |

### 2.2 Non-Functional Requirements

| Metric | Target | How Met |
| ------ | ------ | ------- |
| SSE connection establishment | < 1 s | Fastify `reply.raw` on an authenticated route; connection manager registers synchronously; integration test asserts connect latency |
| Notification delivery (event to UI) | < 2 s | Notification consumer inserts + SSE-pushes inline; outbox publisher polls every 1 s; E2E measures invite → event |
| Language switch (full UI update) | < 500 ms, no page reload | Both catalogs bundled statically; Zustand locale state re-renders `IntlProvider` in place |
| Health check response time | < 200 ms | Parallel probes, 150 ms per-probe timeout, Redis-backed memoization (5 s) |
| Prometheus scrape duration | < 100 ms | Gauges pre-aggregated on a 30 s interval; scrape only serializes the registry |
| Notification preferences save | < 300 ms | Single `PATCH` on existing JSONB column; integration test asserts latency |
| Log write overhead on request latency | < 5 ms | AsyncLocalStorage-bound child logger; Pino async transport (already); benchmark in unit test |

### 2.3 Spec Risk Table → Mitigations Implemented

| Spec Risk | Mitigation in this plan |
| --------- | ----------------------- |
| SSE connection management at scale | Per-tenant connection pools, per-user cap (5), heartbeat (20 s comment), cleanup on `close`/abort (§5.1) |
| Missing i18n keys at runtime | EN default fallback; CI key-parity test between `en`/`it` catalogs and plugin bundles (§10.3 `i18n-keys.test.ts`) |
| Observability overhead on API latency | Pre-aggregated gauges; OTel sampling deferred + feature-flagged off; async Pino (§2.2) |
| Email delivery reliability | `core.email_queue` + retry worker (3 attempts, 1s/4s/16s backoff) + dead-letter logging (§5.2) |
| Plugin notification spam | Redis counter `notif-rl:{tenantId}:{pluginSlug}:{userId}` max 10/min at emission (§5.1) + defense-in-depth 100/min per user at consumer `notification:{tenantId}:{userId}:emit` (§5.2) |

---

## 3. Architectural Decisions (Plan-Level)

### 3.1 Confirmed Basis

- **ADR-004** outbox → Kafka pipeline is the single delivery backbone for
  notifications; at-least-once + DLQ (ADR-016) already handle failure. No new
  eventing infrastructure.
- **ADR-012** rate limiting (Redis-backed, per-route overrides) is reused for
  the SSE route, the notification emit endpoint, and notification preferences.
- **ADR-002** Keycloak multi-realm is the source for session data and the
  `picture` claim; the account console URL is derived per realm.

### 3.2 Plan-Level Decisions

| ID | Decision | Rationale | ADR? |
| -- | -------- | --------- | ---- |
| D-1 | **Manual SSE on Fastify `reply.raw`** — `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, heartbeat comment | Story E06-S001 already decided. Zero new dependency; avoids an SSE ADR on the dependency axis. | Bundled into **ADR-035** (Accepted) |
| D-2 | **Single `modules/notification/` module** (routes/service/repository/schema/types + consumer + connection manager + email queue) | Mirrors existing module structure; 200-line gate enforced by decomposition | No |
| D-3 | **`core.email_queue` table + in-process worker** for all outbound notification email (invitation email moved onto it) | Durable retry across restarts, testable against Mailpit, dead-letter logging per risk table. Core schema (cross-tenant infrastructure) | Bundled into **ADR-035** (Accepted) |
| D-4 | **Notifications flow through the existing Kafka topics**: core modules emit domain events (`plexica.workspace.invite`); plugins emit via `POST /api/v1/notifications/emit` → `plexica.notification` topic; one notification consumer group subscribes to both | Preserves plugin subscription to domain events (ADR-004 semantics) while keeping one notification sink | No |
| D-5 | **Plugin notification emission via a dedicated endpoint** (mirrors `/events/emit`, service identity + installed-plugin check) with a Redis **10/min/plugin/user** limit at emission + 100/min/user consumer cap | Spec risk table ("plugin notification spam"); per-plugin-per-user keying; defense in depth | No |
| D-6 | **Notification preferences schema** on the existing `notification_prefs` JSONB: `{ defaults: {inApp,email}, types: { "<type>": {inApp,email} } }` | Avoids a new table; backward-compatible with the current flat boolean map (migration helper reads both) | No |
| D-7 | **Language switch state in the existing Zustand auth store** (`locale` field, persisted) | Constitution Rule 3 / AGENTS.md: one auth store; profile `language` stays the source of truth synced via `PATCH /profile` | No |
| D-8 | **Plugin i18n bundles as static JSON assets** declared in the plugin manifest, fetched by the shell on plugin load and merged under the `plugin.{slug}.` namespace prefix | Avoids key collisions; no new dependency; works with the MF remote delivery model (ADR-014) | No |
| D-9 | **Tenant translation overrides** in a new tenant table `translation_overrides`, managed by the `tenant-settings` module | Tenant-scoped data must live in the tenant schema (ADR-001); reuses the settings module's admin guard | No |
| D-10 | **`modules/observability/`** consolidates deep health + Prometheus metrics, **reusing** admin probe services (no duplication) | **Supersedes `modules/health/basic-health-routes.ts`** (F7): `/health` + `/api/v1/health` move to the deep probe with an additive payload; `index.ts` registration replaced | No |
| D-11 | **`prom-client` as new core dependency** for `/metrics` | Standard Node Prometheus client; required for 006-17/18/20. **New core dep → ADR-036 required** | **ADR-036** (Accepted) |
| D-12 | **Authenticated SSE via fetch streaming** (ReadableStream), not `EventSource` | `EventSource` cannot set an Authorization header; query-string tokens leak into logs/proxies (Security §2, §6). Reuses the existing access token + silent refresh | No |
| D-13 | **006-19 OTel deferred** to Sprint 7; only a `OTEL_TRACING_ENABLED` config stub + disabled-by-default flag lands this sprint | `sprint-006.yaml` + `velocity.md` explicit deferral; avoids two new core deps now | No (Sprint 7) |

### 3.3 ADR Recommendations (both Accepted 2026-09-17)

| ADR | Title | Trigger | Status |
| --- | ----- | ------- | ------ |
| ADR-035 | Real-time Notification Delivery (manual SSE, `notifications` + `email_queue` tables, notification consumer topology) | **New core entity** (`notifications`), new core table (`email_queue`), infrastructure delivery pattern — AGENTS.md governance + Rule 5 | **Accepted** (2026-09-17) |
| ADR-036 | Prometheus metrics via `prom-client` | **New core dependency** (Constitution: "New dependencies require an ADR") | **Accepted** (2026-09-17) |

Both ADRs were reviewed and **Accepted** by the team on 2026-09-17. ADR-035
settled the emit contract (`202 { status: "accepted", notificationId }`,
§5.1), the SSE connect preset (`SSE_CONNECT_RATE_LIMIT`, 10/min/user), the
100/min/user consumer defense-in-depth cap (§5.2), and deferred the
`eventId`-based idempotency mechanism to the consumer task (implemented in
this plan — §4.1, §5.2). ADR-036 confirmed `prom-client@15.1.3` (exact pin) with the
open-by-default `/metrics` + optional `METRICS_TOKEN` guard. No fallback is
needed; the decision-log entry is orchestrator-owned.

---

## 4. Data Model

### 4.1 New Tables

#### `tenant_{slug}.notifications` — tenant schema (`prisma/tenant-schema/notification-models.prisma`)

Shape is **already confirmed** in architecture.md §3.2 — this plan adds it to
Prisma (the model does not exist today).

| Column | Type | Constraints | Notes |
| ------ | ---- | ----------- | ----- |
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| event_id | VARCHAR(255) | NOT NULL, **UNIQUE** | Consumer idempotency key — dedupes at-least-once redelivery (ADR-004, ADR-035 negative consequence; §5.2 dedupe step) |
| user_id | UUID | FK → user_profile.user_id, NOT NULL | Target user |
| type | VARCHAR(63) | NOT NULL | `workspace.invite`, `workspace.invite_accepted`, `plugin.{slug}.{type}` |
| title | VARCHAR(255) | NOT NULL | i18n key (e.g. `notifications.workspace.invite.title`); UI resolves |
| body | TEXT | NULLABLE | i18n key or resolved text |
| metadata | JSONB | DEFAULT '{}' | `{ workspaceId, workspaceName, pluginSlug, link }` — no PII |
| read | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| INDEX | | `(user_id, read, created_at DESC)` | architecture §3.3 |
| UNIQUE INDEX | | `(event_id)` | Consumer idempotency — insert-ignore on duplicate |

Prisma model (adds a relation to `UserProfile` in `core-models.prisma`):

```prisma
model Notification {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  eventId   String   @unique @map("event_id") @db.VarChar(255)
  userId    String   @map("user_id") @db.Uuid
  type      String   @db.VarChar(63)
  title     String   @db.VarChar(255)
  body      String?  @db.Text
  metadata  Json     @default("{}") @db.JsonB
  read      Boolean  @default(false)
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz

  user UserProfile @relation(fields: [userId], references: [userId])

  @@unique([eventId])
  @@index([userId, read, createdAt(sort: Desc)])
  @@map("notifications")
}
```

#### `core.email_queue` — core schema (`prisma/schema.prisma`)

| Column | Type | Constraints | Notes |
| ------ | ---- | ----------- | ----- |
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| tenant_id | UUID | NULLABLE, FK → core.tenants.id | For GDPR purge (ADR-016 pattern) |
| to_address | VARCHAR(255) | NOT NULL | Redacted in logs |
| subject | VARCHAR(255) | NOT NULL | |
| html_body | TEXT | NOT NULL | Rendered template |
| email_type | VARCHAR(63) | NOT NULL | `workspace.invite`, `notification` |
| status | VARCHAR(16) | NOT NULL, DEFAULT 'pending' | CHECK IN ('pending','sending','sent','failed','dead') |
| attempts | INTEGER | NOT NULL, DEFAULT 0 | |
| next_attempt_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Backoff scheduling |
| last_error | VARCHAR(512) | NULLABLE | Bounded, no stack/PII |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| sent_at | TIMESTAMPTZ | NULLABLE | |
| INDEX | | `(status, next_attempt_at)` | Worker claim query |

#### `tenant_{slug}.translation_overrides` — tenant schema

| Column | Type | Constraints | Notes |
| ------ | ---- | ----------- | ----- |
| key | VARCHAR(255) | PK | Full i18n key (e.g. `common.save`) |
| locale | VARCHAR(8) | PK (composite with key) | `en` or `it` |
| value | VARCHAR(1024) | NOT NULL | Overridden string |
| updated_by | UUID | NULLABLE | user_id |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

### 4.2 Modified Tables

#### `tenant_{slug}.user_profile` — `notification_prefs` column

| Column | Change | Before | After |
| ------ | ------ | ------ | ----- |
| notification_prefs | Semantic upgrade | Flat `Record<string, boolean>` (legacy shape) | Nested `{ defaults:{inApp,email}, types:{ "<type>":{inApp,email} } }`. Reader normalizes legacy shape (`true` → `{inApp:true,email:false}`) |

#### `core.tenants`

No structural change. `email_queue.tenant_id` gains an FK → `core.tenants.id`
(ADR-016 GDPR pattern). **Deletion-saga purge (F8)**: the Spec 005 GDPR
deletion saga (spec 005 plan §3.3; `STEP_ORDER` in
`modules/admin/services/deletion-step-executor.ts`:
`event_data_purge → schema_drop → realm_delete → bucket_delete`) is extended
with a **new step `email_queue_purge`** (handler
`deletion-step-email-queue-purge.ts`) that runs
`DELETE FROM core.email_queue WHERE tenant_id = $1` — placed **between
`event_data_purge` and `schema_drop`**. The rationale is **not** FK-ordering:
`completeGdprDeletion` never deletes the tenant row (the tombstone is kept —
`status: 'deleted'`, slug renamed, `storageBucket` nulled), so no FK ever
blocks deletion. The real reasons are (a) GDPR **right-to-erasure** of
`email_queue` PII (`to_address`, `html_body`) and (b) preventing the email
worker from sending mail for a deleted tenant. Task named in §9 Phase 1;
integration-tested in §10.2/§7.3. (The prior "noted in §8.4" reference was
broken — the dependencies section ends at §8.3; the purge note now lives in
§9 Phase 1 and the deletion-saga context is spec 005 plan §3.3.)

### 4.3 Indexes

| Table | Index | Type | Purpose |
| ----- | ----- | ---- | ------- |
| notifications | `(user_id, read, created_at DESC)` | B-tree | Unread list + center pagination |
| notifications | `(event_id)` | **UNIQUE B-tree** | Consumer idempotency (insert-ignore dedupe, §5.2) |
| email_queue | `(status, next_attempt_at)` | B-tree | Worker claim (UPDATE ... WHERE ... LIMIT, SKIP LOCKED) |
| translation_overrides | PK `(key, locale)` | B-tree | Exact key lookup on shell boot |

### 4.4 Migrations

**Two migrations, not one.** Verified against `src/lib/multi-schema-migrate.ts`:
tenant DDL is executed as **raw SQL files registered in
`TENANT_MIGRATION_FILES`** (per-tenant, `SET LOCAL search_path`), while core DDL
runs through standard Prisma migrations (`prisma migrate deploy`, tracking table
in the core schema). A single Prisma migration **cannot span both schemas** —
Prisma cannot locate its migration tracking table when the schema is switched to
`tenant_<slug>`. Hence:

1. **`<ts>_email_queue`** (core schema, standard Prisma migration): `CREATE
   TABLE core.email_queue` + CHECK constraints + indexes. Applied via `db:migrate`.
2. **`006_notifications/migration.sql`** (tenant raw-SQL migration, registered
   in `TENANT_MIGRATION_FILES`): `CREATE TABLE tenant_{slug}.notifications` +
   `event_id` unique index + `(user_id, read, created_at DESC)` index. Applied
   per tenant via `migrateAll()` / `tenant:migrate`. Additive, no backfill.
3. **`006_translation_overrides/migration.sql`** (tenant raw-SQL migration,
   additive; same mechanism as #2).

> **Migration strategy**: follows the established incremental pattern
> (decision-log ID-007: per-migration transactional DDL; `migrateAll()` stops
> on first failure, prior tenants remain migrated). No application-level
> rollback code. Down-migrations are not required by convention in this
> codebase (ADR-034 notes the exception pattern for reversible migrations; these
> are additive-only).

---

## 5. API Design

All paths under `/api/v1/`. Auth required unless marked `[PUBLIC]`. Error
format per architecture §4.2 `{ code, message, details? }`. Zod validation on
every input (Security §4).

### 5.1 Notification Endpoints

#### [GET] `/api/v1/notifications/stream` — SSE (006-01)

- **Description**: Long-lived authenticated SSE stream. Registered inside
  `tenantScope` (authMiddleware + tenantContextMiddleware + userProfileResolver).
- **Auth**: Required (Bearer JWT validated at connection open; token is checked
  once — the connection carries the user's identity for its lifetime).
- **Rate Limit**: **new preset `SSE_CONNECT_RATE_LIMIT` (10/min/user)** applies
  to the connection *establishment* (ADR-035 Decision 1); sustained delivery is
  push-only (no per-minute requests). Connection cap: 5 per user (oldest
  evicted).
- **Response**: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
  `Connection: keep-alive`, `X-Accel-Buffering: no`. Events framed as
  `event: notification\ndata: {json}\n\n`; heartbeat `:ping\n\n` every 20 s.
- **Event payload** (matches persisted row):
  ```json
  { "notificationId": "…uuid", "type": "workspace.invite", "titleKey": "notifications.workspace.invite.title",
    "bodyKey": null, "metadata": { "workspaceId": "…", "link": "/workspaces/…" }, "read": false, "createdAt": "…" }
  ```
- **Errors**: 401 (invalid/missing token), 403 (tenant suspended — existing
  tenant-context behavior), 429 (connection-establishment rate limit).

#### [GET] `/api/v1/notifications` — notification center (006-02)

- **Description**: Paginated list of the caller's notifications.
- **Auth**: Required. **Query**: `page=1&pageSize=20&filter=unread|all`.
- **Response (200)**:
  ```json
  { "data": [ { "id":"…", "type":"workspace.invite", "titleKey":"…", "bodyKey":null,
               "metadata":{} , "read":false, "createdAt":"…" } ], "total": 12, "page": 1, "pageSize": 20 }
  ```
- **Errors**: 400 `VALIDATION_ERROR` (bad query), 401, 429.

#### [PATCH] `/api/v1/notifications/:id/read` — mark read (006-02)

- **Auth**: Required. **Params**: `id` (UUID, must belong to caller).
- **Response (200)**: `{ id, read: true }`.
- **Errors**: 400, 401, 404 `NOT_FOUND` (not found **or** not owned — no
  enumeration), 429.

#### [POST] `/api/v1/notifications/read-all` — mark all read (006-02, plan addition)

- **Description**: Marks all the caller's notifications read in one call.
  *Extends architecture §4.1 (additive); needed by the center UI.*
- **Response (200)**: `{ updated: 7 }`.

#### [GET] `/api/v1/notifications/preferences` — prefs read (006-04)

- **Response (200)**:
  ```json
  { "defaults": { "inApp": true, "email": false },
    "types": { "workspace.invite": { "inApp": true, "email": true } } }
  ```

#### [PATCH] `/api/v1/notifications/preferences` — prefs write (006-04)

- **Body** (Zod, partial):
  ```json
  { "defaults": { "inApp": true, "email": true },
    "types": { "plugin.crm.contact_created": { "inApp": true, "email": false } } }
  ```
- **Response (200)**: saved prefs. **NFR**: round-trip < 300 ms (integration
  test). **Errors**: 400, 401, 429.

#### [GET] `/api/v1/notifications/types` — type registry (006-04/006-05)

- **Description**: Core notification types + installed plugin-declared types,
  for the prefs UI. **Auth**: Required.
- **Response (200)**: `{ types: [ { key: "workspace.invite", labelKey: "…", channels: ["inApp","email"] },
  { key: "plugin.crm.contact_created", labelKey: "notifications.plugin.crm.contact_created.title" } ] }`

#### [POST] `/api/v1/notifications/emit` — plugin emission (006-05)

- **Description**: Plugin backends emit a notification. Registered in the
  `eventScope` (pluginEventAuth, like `/events/emit`) so both plugin service
  identity and user JWT paths work. Verifies the plugin is installed
  (`verifyPluginInstalled` pattern from `events.routes.ts`).
- **Rate Limit**: **10/min per plugin per user** via Redis counter
  `notif-rl:{tenantId}:{pluginSlug}:{userId}` (INCR + EXPIRE 60 s); 429
  `RATE_LIMIT_EXCEEDED` on breach.
- **Body** (as sent by the SDK — see §6.6 for the SDK contract):
  ```json
  { "userId": "…uuid", "type": "plugin.crm.contact_created", "titleKey": "notifications.plugin.crm.contact_created.title",
    "titleParams": { "name": "Ada" }, "bodyKey": null, "metadata": { "link": "/contacts/123" },
    "timestamp": "…ISO-8601", "correlationId": "…uuid" }
  ```
  **The SDK pre-prefixes `type` as `plugin.{slug}.{type}` and adds
  `timestamp` + `correlationId`** (mirroring the existing `/api/v1/events/emit`
  contract, `events.routes.ts:22-25`, which requires the SDK to prefix). The
  route does **NOT** prefix the type again. The Phase 2 Zod body schema for
  `POST /notifications/emit` **must include `timestamp`
  (`z.string().datetime`) and `correlationId` (`z.string().uuid`)** alongside
  `userId`, `type`, `titleKey`, and the optional fields.
- **Behavior**: the `notificationId` is generated **at emission** and returned
  synchronously; persistence + SSE delivery are **asynchronous via the
  consumer**. The handler enqueues a `plexica.notification` Kafka event
  (envelope: `type` passed through already-prefixed, producer kind `plugin`, id =
  installId, plus the generated `notificationId` and `event_id` for consumer
  idempotency) via the outbox and returns
  **`202 { status: "accepted", notificationId }`** — verbatim per ADR-035
  Decision 5. There is **no** `200 { status: "queued" }` alternative; the
  `202`/`200` open choice is settled by the Accepted ADR.
- **Errors**: 400, 401, 403, 429 `RATE_LIMIT_EXCEEDED`, 503.

### 5.2 Notification Consumer Topology (internal, not HTTP)

- Consumer group `plexica-notification-consumer` subscribes to:
  - `plexica.workspace.invite` (core domain event, from invitation service)
  - `plexica.notification` (plugin emissions and future core notifications)
- **Target input**: the envelope carries either `userId` (plugin emission,
  §5.1) or `email` (invite event, §5.3). Email-carried targets are resolved
  once, up-front (`email` → `user_profile.user_id`, §5.3), to feed the cap key
  and the insert. A non-tenant invitee skips steps 1–3 (no in-app row, no
  per-user cap) and delivers email only via step 4.
- Per-event flow, **in this exact order** (in `consumer.ts`):
  1. **Cap check (F5)** — Redis counter key
     `notification:{tenantId}:{userId}:emit` (INCR + EXPIRE 60 s) enforces the
     **100/min per user** consumer cap from ADR-035 **before any persistence**.
     On breach: **drop the event — no persistence, no delivery** — increment
     the `notifications_rate_limited_total` counter, and log a warn (no crash,
     no DLQ).
  2. **Insert-ignore (F6)** — insert the `notifications` row with
     **insert-ignore** semantics: `INSERT ... ON CONFLICT (event_id) DO NOTHING`
     (backed by the UNIQUE index on `notifications.event_id`, §4.1). This is
     the **only** insert of the `notifications` row in the pipeline.
  3. **If `rowCount = 0`** → the `event_id` already exists → duplicate
     redelivery (ADR-004 at-least-once): **skip** — no row, no SSE, no email.
  4. **Else (`rowCount = 1`)** → resolve the target user's profile, read
     `notification_prefs`, decide channels (in-app vs email), **SSE-push** to
     the user's connections, and **enqueue email** in `core.email_queue` when
     the email channel is enabled.
- Failures: retry 3× with backoff via existing consumer machinery, then DLQ
  (ADR-016) — a *processing* failure is never silently dropped; a *cap-breach*
  drop in step 1 is intentional and counted, never retried.

### 5.3 Invitation Event (006-01 trigger)

`modules/invitation/service.ts` `createInvitationService` gains one outbox
enqueue (inside the existing `withTenantDb` transaction):

```
enqueueEvent(tx, 'plexica.workspace.invite', buildDomainEvent({
  type: 'workspace.invite',
  tenantId: ctx.tenantId,
  producer: { kind: 'core', id: 'invitation' },
  payload: { workspaceId, workspaceName, inviteeEmail, invitedBy, role },
  correlationId: request correlationId,
}))
```

Consumer resolves `inviteeEmail` → `user_profile.user_id`; if the invitee is
already a tenant user → in-app notification + SSE. If not (pure email invite) →
in-app skipped, email path still fires (006-03). **No PII in the event payload**
(email is the minimal required target; the envelope is tenant-key encrypted per
ADR-004).

### 5.4 Profile Endpoints

#### [GET] `/api/v1/profile` — modified (006-11/006-12/006-14)

- **Response** extended additively:
  ```json
  { "userId":"…", "email":"…", "displayName":"…", "timezone":"Europe/Rome", "language":"it",
    "notificationPrefs": {…}, "avatarUrl": "…", "avatarSource": "keycloak|upload",
    "keycloakAccountUrl": "http://keycloak:8080/realms/plexica-acme/account/" }
  ```
- `avatarUrl`: JWT `picture` claim wins when present (006-12), else the
  presigned upload URL. `keycloakAccountUrl` drives 006-14.

#### [PATCH] `/api/v1/profile` — modified (006-11)

- Body extended with optional `email`. Service syncs the new email to Keycloak
  (new `syncEmail` helper, fire-and-forget like `syncDisplayName`) and updates
  `user_profile.email`. Email validation via Zod (basic format) + Keycloak
  uniqueness handled at sync time (logged warning on conflict).

#### [GET] `/api/v1/profile/sessions` — new (006-13)

- **Auth**: Required. Calls Keycloak Admin API
  `GET /admin/realms/{realm}/users/{sub}/sessions`.
- **Response (200)**:
  ```json
  { "sessions": [ { "id":"…", "clientId":"plexica-web", "ipAddress":"…", "startedAt":"…",
                    "lastSeenAt":"…", "current": true } ] }
  ```
- **Errors**: 401, 403, 503 `SERVICE_UNAVAILABLE` (Keycloak unreachable).

#### [DELETE] `/api/v1/profile/sessions/:sessionId` — new (006-13)

- **Ownership check FIRST (F4)**: the handler must verify ownership **before**
  calling the Keycloak Admin API. Fetch the caller's own sessions via
  `listUserSessions(realm, callerSub)`, require `sessionId ∈ caller.sessions`;
  if not present → **`404 NOT_FOUND`** (not found **or** not owned — no
  enumeration, mirroring the notification `:id/read` 404-if-not-owned pattern,
  §5.1). Only then call Keycloak Admin API
  `DELETE /admin/realms/{realm}/sessions/{sessionId}`.
- Self-termination of the current session is allowed (forces re-login);
  response `200 { revoked: true }`.
- **Errors**: 400, 401, 404 `NOT_FOUND` (unknown **or** another user's
  sessionId), 503 `SERVICE_UNAVAILABLE` (Keycloak unreachable).

### 5.5 i18n Endpoints

#### [GET] `/api/v1/tenant/translations` — new (006-10)

- **Auth**: Required (any tenant user). Returns all overrides:
  ```json
  { "overrides": { "common.save": { "en": "Save", "it": "Salva" } } }
  ```
  Cached client-side (TanStack Query staleTime 10 min) — fetched on shell boot.

#### [PUT] `/api/v1/tenant/translations/:key` — new (006-10)

- **Auth**: Required + `tenant_admin` (reuses tenant-settings admin guard).
- **Body**: `{ "locale": "it", "value": "Salva" }`.
- **Response (200)**: `{ key, locale, value, updatedAt }`. Deletes the row when
  `value` is empty (revert to default).

### 5.6 Observability Endpoints

#### [GET] `/health` [PUBLIC] — upgraded (006-15)

- **Route ownership (F7)**: `modules/health/basic-health-routes.ts` is
  **superseded**. The new observability deep probe serves **BOTH**
  `GET /health` **and** `GET /api/v1/health` (the /api-namespaced twin) with the
  **same additive payload** — registered on the root instance (opt-in public,
  exempt from rate limit) replacing the `basicHealthRoutes` registration in
  `index.ts`. The `/api/v1/health` twin is what the **CI runtime contract
  actually probes** — verified in code:
  `apps/web/e2e/helpers/ci-runtime-contract-flow.ts` fetches
  `/api/v1/health?contract=ordinary` and asserts the body
  `{ status: 'ok', version: '2.0.0' }` (exact `toEqual` today — see the
  BREAKING CONTRACT NOTE below for the required assertion update).
- Probes in parallel with 150 ms timeouts: PostgreSQL (`SELECT 1`), Redis
  (`PING`), Keycloak (realm `.well-known/openid-configuration`), Kafka/Redpanda
  (producer `metadata`).
- **Response (200/503)**, additive to the current contract (both routes):
  ```json
  { "status": "ok|degraded|down", "version": "2.0.0",
    "checks": [ { "name":"postgres", "status":"ok", "latencyMs": 3 },
                { "name":"redis", "status":"ok", "latencyMs": 1 },
                { "name":"keycloak", "status":"ok", "latencyMs": 40 },
                { "name":"kafka", "status":"degraded", "latencyMs": 160 } ] }
  ```
  `status: ok` (all ok), `degraded` (some ok), `down` (all failing). HTTP 200
  for ok/degraded, 503 for down. No PII, no connection strings.
- **BREAKING CONTRACT NOTE**: `ci-runtime-contract.spec.ts` **and** its helper
  `ci-runtime-contract-flow.ts` assert the exact current payload at
  `ci-runtime-contract-flow.ts:105` —
  `expect(result.ordinary).toEqual({ status: 200, body: { status: 'ok',
  version: '2.0.0' } })`. Once the deep probe serves the additive payload, this
  exact `toEqual` is **flaky (Rule 6 — deterministic tests)**. Replace it with:
  `expect(result.ordinary).toMatchObject({ status: 200, body: { status:
  expect.stringMatching(/ok|degraded/), version: '2.0.0' } })` plus a structural
  check that `result.ordinary.body.checks` is an array of length **≥ 4**
  (postgres, redis, keycloak, kafka). Both files must be updated **in the same
  PR** as the handler change (§9 Phase 4).

#### [GET] `/metrics` [PUBLIC] — new (006-17)

- **Auth**: None (opt-in public). Prometheus scrape endpoint.
- **Metrics**:
  - `http_request_duration_seconds` histogram (method, route, status)
  - `http_requests_total` counter (method, route, status)
  - `kafka_consumer_lag` gauge (plugin, tenant) — wraps existing lag service
  - `kafka_dlq_size` gauge (plugin)
  - `outbox_pending_events` gauge (from `getOutboxMetrics`)
  - `sse_active_connections` gauge (tenant)
  - `notifications_emitted_total`, `notifications_rate_limited_total` counters
  - `email_queue_depth`, `email_queue_dead_total` gauges
  - process metrics (`prom-client` defaults)
- **NFR**: scrape < 100 ms — gauges refreshed on a 30 s interval, scrape only
  serializes.
- **Errors**: 401/403 only if `METRICS_TOKEN` env is set (optional auth switch);
  default open for scrape.

---

## 6. Component Design

### 6.1 `modules/notification/` (greenfield)

```
services/core-api/src/modules/notification/
  index.ts                — Fastify plugin: registers routes (tenantScope) + emit route (eventScope)
  types.ts                — NotificationDto, PreferenceMap, EmitNotificationInput, EmailQueueRow
  schema.ts               — Zod: list query, read params, prefs, emit body, translations
  repository.ts           — notifications CRUD (list, markRead, markAllRead, insert), prefs read/write
  service.ts              — orchestration: createNotification (channels decision), list, prefs
  routes.ts               — GET list / stream, PATCH read, POST read-all, prefs, types
  emit.routes.ts          — POST /api/v1/notifications/emit (plugin service identity)
  sse.ts                  — SSE framing helpers (writeEvent, heartbeat, headers)
  connection-manager.ts   — per-tenant pools, per-user cap (5), heartbeat, eviction, cleanup
  consumer.ts             — Kafka consumer (plexica.workspace.invite + plexica.notification); event_id dedupe + 100/min/user cap (§5.2)
  emit-rate-limit.ts      — Redis 10/min/plugin/user counter
  email-queue.service.ts  — enqueue/claim/settle rows in core.email_queue
  email-queue-worker.ts   — retry worker (3 attempts, 1s/4s/16s, dead-letter log)
```

**Key classes/methods**:

| Component | Method | Signature | Returns | Description |
| --------- | ------ | --------- | ------- | ----------- |
| `ConnectionManager` | `connect` | `(tenantSlug, userId, res)` | `ConnectionHandle` | Registers in tenant pool; enforces cap 5 (evict oldest); wires `close`/abort cleanup |
| `ConnectionManager` | `publish` | `(tenantSlug, userId, NotificationDto)` | `boolean` | Writes SSE frame to all user's connections |
| `ConnectionManager` | `getGauge` | `()` | `{tenant: number}` | Feeds `sse_active_connections` |
| `NotificationService` | `createNotification` | `(tenantDb, {userId, type, titleKey, …}, channels)` | `NotificationDto` | Inserts row + `ConnectionManager.publish` |
| `NotificationService` | `listNotifications` | `(tenantDb, userId, {page, filter})` | `PaginatedResult` | Center list |
| `NotificationConsumer` | `start/stop` | `()` | `Promise<void>` | Consumer group `plexica-notification-consumer`; **dedupe by `event_id` (insert-ignore) + enforce 100/min/user cap** (F5/F6); resolve user → prefs → channels |
| `EmailQueueService` | `enqueue` / `claim` / `settle` | `(…EmailQueueRow)` | `string \| null` | INSERT; `UPDATE … WHERE id … RETURNING` claim; mark sent/failed/dead |
| `EmailQueueWorker` | `runTick` | `()` | `Promise<{sent, failed, dead}>` | Claim batch, `nodemailer` send, backoff scheduling |
| `EmitRateLimiter` | `assert` | `(tenantId, pluginSlug, userId)` | `void` | Redis INCR/EXPIRE; throw 429 at 10/min |

**Integration with existing infra**:
- Outbox/Kafka: `enqueueEvent` (outbox-repository), `publishOutboxBatch`
  (outbox-publisher, already running), consumer machinery `lib/kafka-consumer.ts`
  + `events/dlq-contract.ts` (same pattern as the DLQ bridge and plugin
  consumers).
- Rate limiting: `lib/rate-limit-config.ts` gets one new preset:
  `SSE_CONNECT_RATE_LIMIT` (10/min/user) for SSE connection establishment
  (ADR-035 Decision 1). The aggregate `NOTIFICATION_EMIT_RATE_LIMIT`
  (10/min/user) preset considered earlier is **removed** — ADR-035 does not
  define an aggregate emit limit. The full ladder is: per-plugin-per-user
  **10/min/plugin/user** at emission (Redis counter in `emit-rate-limit.ts`,
  extends ADR-012) + defense-in-depth **100/min/user** at the consumer
  (`notification:{tenantId}:{userId}:emit` in `consumer.ts`, §5.2).
- Email: `lib/email.ts` refactored into two paths — `sendMailNow` (kept for the
  current sync callers during migration) and `enqueueEmail` (new default);
  `sendInvitationEmail` switches to `enqueueEmail`.
- Bootstrap lifecycle (`src/bootstrap.ts`): add `startNotificationConsumer()`,
  `startEmailQueueWorker()`, `startKafkaMetricsPoller()` (reverse order on
  teardown, matching the documented start/stop mirror in bootstrap.ts).

### 6.2 `modules/observability/` (greenfield)

```
services/core-api/src/modules/observability/
  index.ts            — registers health + metrics routes on root instance (public)
  health.routes.ts    — GET /health deep probe handler (also serves /api/v1/health twin)
  health-check.ts     — orchestrates probes in parallel (150 ms timeout, 5 s Redis memo)
  metrics.routes.ts   — GET /metrics serialization
  metrics-registry.ts — prom-client Registry + typed metrics (histograms, gauges, counters)
  http-metrics.ts     — Fastify onRequest/onResponse hooks (duration + count)
  kafka-metrics.ts    — 30 s poller: consumer lag, DLQ size, outbox pending
```

- **F7 route ownership**: `modules/health/basic-health-routes.ts` is
  **superseded** — `health.routes.ts` serves **both** `/health` and
  `/api/v1/health` (the twin the CI runtime contract probes). `index.ts`
  replaces the `basicHealthRoutes` registration with `observabilityRoutes`;
  `basic-health-routes.ts` is removed.

- Reuses `modules/admin/services/health-check-postgres.ts`,
  `health-check-redis.ts`, `health-check-keycloak.ts`, `health-check-kafka.ts`
  (already exported; no duplication).
- `metrics-registry.ts` is the **only** module importing `prom-client`.

### 6.3 `lib/request-context.ts` (new) + logging

- AsyncLocalStorage `RequestContext { requestId, correlationId, tenantId, userId }`.
- `authMiddleware` + `tenantContextMiddleware` bind into the store (2-line
  additions); a root `onRequest` hook seeds `requestId` (Fastify `genReqId`) and
  `correlationId` (`X-Correlation-Id` header or generated UUIDv4).
- Logger child helper `ctxLogger()` returns
  `logger.child({ requestId, correlationId, tenantId, userId })` — used by
  route handlers; Pino async transport keeps write overhead < 5 ms (NFR).
- No PII added (Security §6): UUIDs + tenant slug only.

### 6.4 User Profile extensions

| File | Change |
| ---- | ------ |
| `service.ts` | `getProfile` merges JWT `picture` claim → `avatarUrl` + `avatarSource`; adds `keycloakAccountUrl`; `updateProfile` accepts `email` and syncs via `syncEmail` |
| `routes.ts` | Add `GET /profile/sessions`, `DELETE /profile/sessions/:sessionId` — **ownership check via `listUserSessions(callerSub)` before the Keycloak call, else 404 (F4)**; Keycloak Admin via `withCoreDb`-style keycloak helper, not tenant DB |
| `repository.ts` | `updateEmail` helper |
| `schema.ts` | `email` optional field on update schema |
| `lib/keycloak-admin-users.ts` | Add `listUserSessions(realm, userId)`, `deleteUserSession(realm, sessionId)`, `syncEmail(realm, userId, email)` |

### 6.5 Frontend

| Area | Design |
| ---- | ------ |
| **i18n core** | `i18n/locales.ts` exports `{ en: messages.en, it: messages.it }`; `IntlProvider` in `main.tsx` derives `locale` + `messages` from the Zustand auth store `locale` field (persisted). `use-locale.ts` hook wraps `PATCH /profile` + store update — no page reload (006-07). |
| **Formatting** | `lib/format.ts` helper using `react-intl` (`FormattedDate`, `FormattedNumber`, currency via `Intl.NumberFormat` with `userProfile.timezone`) (006-08). |
| **Notification UI** | `notification-bell.tsx` (Radix DropdownMenu, unread badge, TanStack Query `use-notifications` poll every 30 s + SSE push invalidation), `notification-center-page.tsx` (list + mark read), `notification-prefs-page.tsx` (per-type toggles via `use-notification-prefs`). |
| **SSE client** | `services/sse-client.ts` — fetch-based streaming (ReadableStream) with the existing Bearer token, auto-reconnect (backoff), heartbeat timeout detection, dispatch `notification` events to a small in-memory bus consumed by TanStack Query invalidation. |
| **Profile** | `sessions-card.tsx` (list + revoke buttons), password change button → `keycloakAccountUrl` (006-14), header `avatar.tsx` prefers `avatarSource: 'keycloak'`. |
| **Plugin translations** | `plugin-loader.tsx` (modified) reads manifest `i18n.bundles`, fetches `i18n/{locale}.json` from the MF remote asset base, merges under `plugin.{slug}.` prefix into the active message set (006-09). |
| **Tenant overrides** | Tenant settings admin UI: `translations-admin-page` (list + edit + revert), backed by `use-translations`; shell boot merges overrides last (highest precedence: overrides > plugin > core) (006-10). |

### 6.6 SDK + shared types

| File | Change |
| ---- | ------ |
| `packages/sdk/src/plugin-sdk.ts` | Add `emitNotification(input: EmitNotificationInput): Promise<{ notificationId: string }>` → `POST /api/v1/notifications/emit` via `PluginHttp` (authenticated with service identity, same as `emitEvent`) (006-05). **SDK contract**: sends `type` **pre-prefixed** as `plugin.{slug}.{type}` plus `timestamp` + `correlationId` (route does NOT prefix — §5.1); returns the `notificationId` from the `202` body for caller correlation (ADR-035 Decision 5). |
| `packages/sdk/src/types.ts` | `EmitNotificationInput` + `EmitNotificationResult { notificationId: string }` + `NotificationPreferences` types |
| `packages/api-types/src/tenant/notification.ts` (new) | Zod response schemas: `NotificationDto`, `NotificationList`, `NotificationPreferences`, `SessionList` — single contract for web + tests (ADR-029 pattern) |

---

## 7. File Map

> All paths relative to repo root. Sizes are estimates respecting the 200-line
> gate (Rule 4). `N` = new, `M` = modified.

### 7.1 Backend — New Files (Notification)

| Path | Purpose | Size |
| ---- | ------- | ---- |
| `services/core-api/prisma/tenant-schema/notification-models.prisma` | `Notification` model + index | S |
| `services/core-api/src/modules/notification/index.ts` | Module Fastify plugin (tenant routes + emit scope) | S |
| `services/core-api/src/modules/notification/types.ts` | DTO + preference types | M |
| `services/core-api/src/modules/notification/schema.ts` | Zod schemas | M |
| `services/core-api/src/modules/notification/repository.ts` | Notifications CRUD + prefs | M |
| `services/core-api/src/modules/notification/service.ts` | Channel decision + create/list | M |
| `services/core-api/src/modules/notification/routes.ts` | List/read/read-all/prefs/types routes | M |
| `services/core-api/src/modules/notification/emit.routes.ts` | `POST /notifications/emit` | M |
| `services/core-api/src/modules/notification/sse.ts` | SSE framing + headers | S |
| `services/core-api/src/modules/notification/connection-manager.ts` | Pools, cap, heartbeat, eviction | M |
| `services/core-api/src/modules/notification/consumer.ts` | Kafka consumer (invite + notification topics) — event_id dedupe + 100/min/user cap (§5.2) | M |
| `services/core-api/src/modules/notification/emit-rate-limit.ts` | Redis 10/min/plugin/user | S |
| `services/core-api/src/modules/notification/email-queue.service.ts` | `core.email_queue` enqueue/claim/settle | M |
| `services/core-api/src/modules/notification/email-queue-worker.ts` | Retry worker | M |

### 7.2 Backend — New Files (Observability + lib)

| Path | Purpose | Size |
| ---- | ------- | ---- |
| `services/core-api/src/lib/request-context.ts` | AsyncLocalStorage + `ctxLogger()` | M |
| `services/core-api/src/modules/observability/index.ts` | Health + metrics route registration | S |
| `services/core-api/src/modules/observability/health.routes.ts` | Deep `/health` + `/api/v1/health` twin (supersedes basic-health-routes, F7) | M |
| `services/core-api/src/modules/observability/health-check.ts` | Parallel probe orchestrator | M |
| `services/core-api/src/modules/observability/metrics.routes.ts` | `/metrics` serialization | S |
| `services/core-api/src/modules/observability/metrics-registry.ts` | prom-client registry (sole importer) | M |
| `services/core-api/src/modules/observability/http-metrics.ts` | onRequest/onResponse hooks | M |
| `services/core-api/src/modules/observability/kafka-metrics.ts` | 30 s lag/DLQ/outbox poller | M |

### 7.3 Backend — Test Files (New)

| Path | Purpose |
| ---- | ------- |
| `services/core-api/src/modules/notification/__tests__/connection-manager.test.ts` | Cap eviction, heartbeat, cleanup, tenant isolation (unit) |
| `services/core-api/src/modules/notification/__tests__/notification.service.test.ts` | Channel decisions, legacy prefs normalization (unit) |
| `services/core-api/src/modules/notification/__tests__/notification.routes.int.test.ts` | Stream (connect < 1 s, 401, isolation), list, mark read, prefs < 300 ms (integration) |
| `services/core-api/src/modules/notification/__tests__/notification.consumer.int.test.ts` | Invite → row + SSE < 2 s, plugin emission, **cap breach (F5): event dropped → no `notifications` row persisted**; **redelivery dedupe (F6): same event published twice → single `notifications` row**, DLQ (integration) |
| `services/core-api/src/modules/notification/__tests__/email-queue.service.test.ts` | Retry, backoff, dead-letter, claim idempotency (**integration** — real SMTP/Mailpit, as §10.2) |
| `services/core-api/src/modules/notification/__tests__/emit-rate-limit.test.ts` | 10/min boundary (unit) |
| `services/core-api/src/modules/observability/__tests__/health.routes.int.test.ts` | Deep probes, < 200 ms, degraded statuses (integration) |
| `services/core-api/src/modules/observability/__tests__/metrics.routes.int.test.ts` | Scrape < 100 ms, histogram labels, gauge values (integration) |
| `services/core-api/src/modules/observability/__tests__/metrics-registry.test.ts` | Registry wiring, label cardinality bound (unit) |
| `services/core-api/src/modules/user-profile/__tests__/profile-sessions.int.test.ts` | Sessions list/revoke vs real Keycloak; **DELETE another user's sessionId → 404 (F4 ownership)** (integration) |
| `services/core-api/src/lib/__tests__/keycloak-admin-users.test.ts` | `listUserSessions`/`deleteUserSession`/`syncEmail` helper contracts (unit — mocked Keycloak Admin HTTP) |
| `services/core-api/src/__tests__/admin/email-queue-purge.int.test.ts` | **F8 GDPR**: tenant deletion saga with pending `core.email_queue` rows succeeds and purges them (integration) |
| `services/core-api/src/__tests__/request-context.test.ts` | Context binding, correlation propagation, no-PII (**unit** — ASLS + child-logger logic, as §10.3) |

### 7.4 Frontend — New Files (`apps/web/`)

| Path | Purpose | Size |
| ---- | ------- | ---- |
| `src/i18n/messages.it.ts` | Italian catalog aggregate | S |
| `src/i18n/messages.it.auth-nav.ts` | IT auth/nav strings | M |
| `src/i18n/messages.it.workspace-users.ts` | IT workspace strings | M |
| `src/i18n/messages.it.settings-common.ts` | IT settings strings | M |
| `src/i18n/messages.it.plugins.ts` | IT plugin strings | S |
| `src/i18n/messages.en.notifications.ts` | EN notification strings (new domain) | M |
| `src/i18n/messages.it.notifications.ts` | IT notification strings | M |
| `src/i18n/locales.ts` | Locale registry + key-parity type | S |
| `src/i18n/__tests__/i18n-keys.test.ts` | EN/IT + plugin key parity — no missing keys (006-06) | M |
| `src/hooks/use-locale.ts` | Language switch mutation + store sync | S |
| `src/components/i18n/language-switcher.tsx` | EN/IT switcher (Radix DropdownMenu) | S |
| `src/lib/format.ts` | Locale-aware date/number/currency helpers | M |
| `src/services/sse-client.ts` | Fetch-based authenticated SSE client | M |
| `src/services/notifications-api.ts` | List/read/prefs/emit API methods | M |
| `src/services/translations-api.ts` | Tenant override API methods | S |
| `src/hooks/use-notifications.ts` | List + unread count + mutations | M |
| `src/hooks/use-notification-prefs.ts` | Prefs query + save mutation | S |
| `src/hooks/use-sessions.ts` | Sessions query + revoke mutation | S |
| `src/hooks/use-translations.ts` | Overrides query + upsert mutation | S |
| `src/components/notifications/notification-bell.tsx` | Header bell + unread badge | M |
| `src/components/notifications/notification-item.tsx` | Single notification row | S |
| `src/pages/notification-center-page.tsx` | List + mark read / read-all | M |
| `src/pages/notification-prefs-page.tsx` | Per-type channel toggles | M |
| `src/components/profile/sessions-card.tsx` | Session list + revoke | M |
| `src/components/profile/password-card.tsx` | Password change → Keycloak console | S |
| `src/components/profile/avatar-header.tsx` | Picture-claim-aware avatar | S |
| `src/types/notification.ts` | Frontend notification types | S |
| `src/i18n/messages.en.profile.ts` / `messages.it.profile.ts` | Profile + sessions + notifications strings | M ×2 |

### 7.5 Shared Packages — New Files

| Path | Purpose |
| ---- | ------- |
| `packages/sdk/src/notification-api.ts` | `emitNotification` HTTP helper (used by `PluginSDK`) |
| `packages/api-types/src/tenant/notification.ts` | Zod response schemas (ADR-029 pattern) |

### 7.6 Infra — New Files

| Path | Purpose |
| ---- | ------- |
| `infra/prometheus/prometheus.yml` | Scrape config: core-api `:3001/metrics` |
| `infra/grafana/dashboards/plexica-overview.json` | 006-18 base dashboard (HTTP latency, error rate, outbox, SSE conns) |
| `infra/grafana/dashboards/kafka-monitoring.json` | 006-20 dashboard (per-plugin lag, DLQ size, throughput) |
| `infra/grafana/provisioning/dashboards.yml` | Dashboard provider (reads the mounted `dashboards/` dir) |

### 7.7 E2E Specs — New Files (`apps/web/e2e/`)

| Path | Feature | Scenario |
| ---- | ------- | -------- |
| `notification-sse.spec.ts` | 006-01 | Invite existing user → SSE event in UI < 2 s |
| `notification-center.spec.ts` | 006-02 | Open center, unread badge, mark read, read-all |
| `notification-email.spec.ts` | 006-03 | Invite → email in Mailpit; retry + dead-letter path |
| `notification-prefs.spec.ts` | 006-04 | Toggle channels; invite with email off → no email |
| `plugin-notification.spec.ts` | 006-05 | CRM emits on new contact → notification + SSE |
| `i18n-language-switch.spec.ts` | 006-07/08 | Switch EN→IT, no reload, < 500 ms; date format changes |
| `plugin-translations.spec.ts` | 006-09 | CRM plugin EN/IT strings render via same pipeline |
| `tenant-translation-overrides.spec.ts` | 006-10 | Admin overrides key → user sees override |
| `profile-sessions.spec.ts` | 006-13/14 | Sessions listed/revoked; password link → Keycloak console |
| `health-check.spec.ts` | 006-15, **006-16** | `/health` returns all 4 deps, payload shape; **Pino JSON logs carry `requestId`/`tenantId`/`userId` (login + API call → `docker logs core-api` via `e2e/helpers/core-api-logs.ts`)** |
| `e2e/helpers/core-api-logs.ts` | 006-16 | **Log-read helper**: `docker logs core-api` via Node `execSync`; bounded poll (up to 5 s, 250 ms interval) for the matching `requestId` line — async Pino transport requires retry (§10.1) |
| `observability-metrics.spec.ts` | 006-17/18/20 | `/metrics` content-type + key series; Grafana datasources reachable |

> **Rule 4 line-gate strategy for E2E specs**: when a spec exceeds ~180 lines it
> is split into the spec file (scenario flow only) + helper modules under
> `e2e/helpers/` (fixtures, assertions) — e.g. `notification-sse.spec.ts` +
> `helpers/sse-asserts.ts`, `health-check.spec.ts` +
> `helpers/core-api-logs.ts` (006-16). Catalogs are kept under the 200-line gate
> **by domain-splitting** (`messages.it.*`, §7.4) — Rule 4 applies to them like
> any other file; dashboard JSON files are single-purpose data assets.

### 7.8 Modified Files

| Path | Change | Reason |
| ---- | ------ | ------ |
| `services/core-api/src/index.ts` | Register `notificationRoutes` in tenantScope, `notificationEmitRoutes` in eventScope, `observabilityRoutes` on root; **remove the `basicHealthRoutes` registration (superseded, F7)** | New modules |
| `services/core-api/src/bootstrap.ts` | Start/stop notification consumer, email worker, kafka metrics poller | Lifecycle (mirror pattern) |
| `services/core-api/src/modules/health/basic-health-routes.ts` | **Superseded** — `/health` + `/api/v1/health` served by `modules/observability/health.routes.ts` (F7) | 006-15 route ownership |
| `services/core-api/src/modules/admin/services/deletion-step-executor.ts` | **Step registration (F8)**: add `'email_queue_purge'` to `STEP_ORDER` (between `event_data_purge` and `schema_drop`) + a `dispatchStep` case | 006-03 GDPR purge |
| `services/core-api/src/modules/admin/services/deletion-saga-start.service.ts` | **Step-row upsert**: no code change needed — the `email_queue_purge` step row is materialized automatically by the existing `STEP_ORDER` upsert loop (verified in code) | 006-03 GDPR purge |
| `services/core-api/src/modules/admin/services/deletion-step-email-queue-purge.ts` | **New step handler**: `DELETE FROM core.email_queue WHERE tenant_id = $1` (all statuses) — GDPR PII erasure + worker suppression (F8) | 006-03 GDPR purge |
| `services/core-api/src/lib/multi-schema-migrate.ts` | Register `006_notifications/migration.sql` + `006_translation_overrides/migration.sql` in `TENANT_MIGRATION_FILES` | Tenant migrations (§4.4) |
| `services/core-api/src/lib/config.ts` | Env: `NOTIFICATION_*`, `PROMETHEUS_*`, `METRICS_TOKEN?`, `OTEL_TRACING_ENABLED` (default false), `KEYCLOAK_ACCOUNT_URL_PATTERN` | New config |
| `services/core-api/src/lib/rate-limit-config.ts` | New preset `SSE_CONNECT_RATE_LIMIT` (10/min/user). Aggregate `NOTIFICATION_EMIT_RATE_LIMIT` **removed** — ADR-035 defines no aggregate emit limit (F5) | Rate limiting |
| `services/core-api/src/lib/email.ts` | `enqueueEmail` path; invitation email routed through queue | 006-03 retry |
| `services/core-api/src/lib/keycloak-admin-users.ts` | `listUserSessions`, `deleteUserSession`, `syncEmail` | 006-13/11 |
| `services/core-api/src/modules/invitation/service.ts` | `enqueueEvent('plexica.workspace.invite')` on create | 006-01 trigger |
| `services/core-api/src/modules/user-profile/service.ts` | `picture` claim, `keycloakAccountUrl`, email sync | 006-11/12/14 |
| `services/core-api/src/modules/user-profile/routes.ts` | Sessions endpoints | 006-13 |
| `services/core-api/src/modules/user-profile/schema.ts` | `email` optional | 006-11 |
| `services/core-api/src/modules/user-profile/repository.ts` | `updateEmail` | 006-11 |
| `services/core-api/src/middleware/auth-middleware.ts` | Bind `userId` into request-context ASLS | 006-16 |
| `services/core-api/src/middleware/tenant-context.ts` | Bind `tenantId` into request-context ASLS | 006-16 |
| `services/core-api/prisma/schema.prisma` | `EmailQueue` model (core migration `<ts>_email_queue`) | 006-03 |
| `services/core-api/prisma/tenant-schema/notification-models.prisma` | `Notification` model + `event_id` unique index (tenant migration `006_notifications`) | 006-01 |
| `services/core-api/prisma/tenant-schema/core-models.prisma` | `Notification` relation on `UserProfile` | 006-01 |
| `apps/web/src/main.tsx` | Locale-driven `IntlProvider` | 006-07 |
| `apps/web/src/stores/auth-store.ts` | `locale` state + persistence | 006-07 |
| `apps/web/src/i18n/messages.en.ts` | Register new domains (notifications, profile) | 006-06 |
| `apps/web/src/services/profile-api.ts` | Sessions + account URL | 006-13/14 |
| `apps/web/src/pages/profile-page.tsx` | Email field, sessions card, password card | 006-11/13/14 |
| `apps/web/src/components/layout/header.tsx` | Notification bell + language switcher + picture avatar | 006-07/12 |
| `apps/web/src/router-shell-routes.tsx` | `/notifications`, `/notifications/preferences`, translations route | New pages |
| `apps/web/src/mf-host/plugin-loader.tsx` | Load + merge plugin i18n bundles | 006-09 |
| `packages/sdk/src/plugin-sdk.ts` | `emitNotification` method | 006-05 |
| `packages/sdk/src/types.ts` | Notification input types | 006-05 |
| `apps/web/src/types/profile.ts` | `avatarSource`, `keycloakAccountUrl`, new prefs shape | 006-12/04 |
| `apps/web/e2e/user-profile.spec.ts` | Extend avatar-source assertions | 006-12 |
| `apps/web/e2e/ci-runtime-contract.spec.ts` | Additive `/health` payload shape (assertion update per §5.6) | 006-15 contract |
| `apps/web/e2e/helpers/ci-runtime-contract-flow.ts` | Additive `/health` payload shape — replace exact `toEqual` (line 105) with `toMatchObject` + `checks` length ≥ 4 (§5.6, F7) | 006-15 contract |
| `infra/compose/docker-compose.observability.yml` | Add `prometheus` service | 006-17 |
| `eslint.config.js` | `formatjs/no-hardcoded-string` rule for apps/web | 006-06 |

### 7.9 Files to Reference (Read-only)

| Path | Purpose |
| ---- | ------- |
| `.forge/architecture/architecture.md` | §3.2 notifications model, §4.1 endpoints, §5.2 Kafka, §7 monitoring |
| `services/core-api/src/events/outbox-publisher.ts` | Delivery pipeline reused |
| `services/core-api/src/modules/plugin/routes/events.routes.ts` | Plugin emit pattern mirrored |
| `services/core-api/src/modules/admin/services/health-check-*.ts` | Probes reused |

---

## 8. Dependencies

### 8.1 New

| Package | Version | Location | Purpose | ADR |
| ------- | ------- | -------- | ------- | --- |
| `prom-client` | 15.1.3 (exact pin, ADR-036) | `services/core-api` | Prometheus registry + default process metrics | **ADR-036 (Accepted 2026-09-17)** |
| `eslint-plugin-formatjs` | latest | `apps/web` (devDependency) | `no-hardcoded-string` + message key rules (006-06) | DevDep in app — flagged, no core ADR |

### 8.2 Explicitly NOT Added

| Package | Why not |
| ------- | ------- |
| SSE library (`@fastify/sse` / `sse-channel`) | Story E06-S001 decision: manual `reply.raw`; avoids ADR + dependency (Rule 5) |
| Email library | `nodemailer` already present (`lib/email.ts`) |
| react-intl / Intl packages | Already present (`apps/web`) |
| `@opentelemetry/*` | 006-19 deferred to Sprint 7 (`sprint-006.yaml`); `OTEL_TRACING_ENABLED` stub only |
| `@fastify/prometheus` | Not an official plugin; hand-rolled registry in `metrics-registry.ts` keeps cardinality bounded and mirrors existing patterns |

### 8.3 Internal Dependencies

- `lib/kafka-consumer.ts`, `events/dlq-contract.ts`, `events/outbox-repository.ts`
- `lib/tenant-database.ts` (`withTenantDb`), `lib/rate-limit-config.ts`,
  `lib/config.ts`, `lib/logger.ts`, `lib/keycloak-admin-users.ts`
- `modules/audit-log/writer.ts` (notification emit/prefs audit)
- `modules/admin/services/health-check-*` + `lag-metrics.service` (observability)
- `@plexica/api-types` (shared schemas), `@plexica/sdk` (plugin emission),
  `@plexica/ui` (Radix primitives: DropdownMenu, Dialog, Switch, Avatar)

---

## 9. Implementation Phases (Sprint-Aligned)

Phases mirror `sprint-006.yaml` (4 phases, 13 stories, 27 pts). Each phase is
independently mergeable and E2E-testable.

### Phase 1 — Notifications (stories E06-S001…006-05, 11 pts)

> Story IDs: `006-01` = `forge_story_id` **E06-S001** (SSE infrastructure, the
> only story carrying a forge_story_id in `sprint-006.yaml`); features `006-NN`
> are separate from story IDs of the same number. "Story 006-01" always means
> E06-S001; "feature 006-01" means the spec requirement.

**Objective**: full in-app notification pipeline (SSE + center + email +
preferences + plugin emission).

**Pre-requisite — migrations** (two, split core vs tenant — §4.4): core
Prisma migration `<ts>_email_queue` (`db:migrate`) + tenant raw-SQL migration
`006_notifications` registered in `TENANT_MIGRATION_FILES` (`tenant:migrate`).

**Tasks** (story E06-S001 is pre-broken — reused/adapted where applicable):
1. `[M]` Add `notifications` model + `event_id` unique index to tenant schema; register tenant migration `006_notifications`. *(E06-S001 task 1)*
2. `[M]` `connection-manager.ts` — pools, cap 5, heartbeat, cleanup. *(task 2)*
3. `[M]` `sse.ts` + `routes.ts` — `GET /notifications/stream` in tenantScope with
   rate limit; register in `index.ts`. *(task 3)*
4. `[L]` `consumer.ts` + `repository.ts` — subscribe `plexica.workspace.invite`
   + `plexica.notification`; **ordered pipeline per §5.2: cap check (F5) →
   insert-ignore by `event_id` (F6) → `rowCount = 0` redelivery skip → persist
   + SSE push + email enqueue**. *(task 4)*
5. `[M]` `service.ts` + list/read/read-all routes (006-02 center backend).
6. `[M]` `core.email_queue` + `email-queue.service.ts` + worker; reroute
   `sendInvitationEmail` through queue (006-03).
7. `[M]` **F8 GDPR purge**: add `deletion-step-email-queue-purge.ts` to the Spec
   005 deletion saga — `DELETE FROM core.email_queue WHERE tenant_id = $1` (all
   statuses); register it as step `email_queue_purge` in `STEP_ORDER` + the
   `dispatchStep` switch in `deletion-step-executor.ts` (between
   `event_data_purge` and `schema_drop`; the step row is materialized
   automatically by the `STEP_ORDER` upsert loop in
   `deletion-saga-start.service.ts`). GDPR PII erasure + worker suppression —
   rationale in §4.2 (integration test `email-queue-purge.int.test.ts` asserts
   purge on delete).
8. `[M]` Prefs routes + legacy normalization (006-04).
9. `[M]` `emit.routes.ts` + `emit-rate-limit.ts` + SDK `emitNotification` (006-05).
10. `[M]` Frontend: `sse-client.ts`, `use-notifications`, `notification-bell`,
    `notification-center-page`, `notification-prefs-page` + routes.
11. Tests: unit + integration (`__tests__/notification.*`), E2E
    `notification-sse.spec.ts` (E06-S001 task 6), `notification-center.spec.ts`,
    `notification-email.spec.ts`, `notification-prefs.spec.ts`,
    `plugin-notification.spec.ts`.

### Phase 2 — Internationalization (stories 006-06…006-09, 8 pts)

> Story/feature IDs here collide numerically (story `006-06` ≠ feature `006-06`);
> the sprint file's `id` is the story ID, spec IDs are the features. Story
> `006-01` = **E06-S001** (see Phase 1 note); no other story carries a
> forge_story_id.

**Objective**: complete react-intl coverage, EN/IT switch, plugin + tenant
translations.

1. `[L]` Italian catalog (`messages.it.*`, `locales.ts`), key-parity test,
   `eslint-plugin-formatjs` rule (006-06).
2. `[M]` `auth-store.locale` + `use-locale` + `language-switcher` +
   locale-driven `IntlProvider` (006-07).
3. `[M]` `lib/format.ts` + replace hardcoded date/number renderings (006-08).
4. `[M]` Plugin i18n bundles: manifest `i18n.bundles` + `plugin-loader` merge
   under `plugin.{slug}.` prefix (006-09).
5. `[M]` `translation_overrides` table + `GET/PUT /tenant/translations` in
   tenant-settings + admin UI + shell boot merge (006-10).
6. Tests: `i18n-keys.test.ts` (unit), E2E `i18n-language-switch.spec.ts`
   (assert < 500 ms + no reload), `plugin-translations.spec.ts`,
   `tenant-translation-overrides.spec.ts`.

### Phase 3 — User Profile (stories 006-10, 006-11, 4 pts)

> Story `006-10`/`006-11` are sprint story IDs (features `006-11`…`006-14`); see
> the Phase 1/2 disambiguation note.

**Objective**: profile extensions on the existing module.

1. `[M]` `getProfile` — `picture` claim, `keycloakAccountUrl`, `avatarSource`
   (006-12/14).
2. `[M]` `PATCH /profile` email field + `syncEmail` (006-11).
3. `[M]` `GET/DELETE /profile/sessions` via Keycloak Admin API (006-13).
4. `[M]` Frontend: sessions card, password card, avatar-header, profile page
   email field.
5. Tests: unit (`keycloak-admin-users.test.ts`), integration
   (`profile-sessions.int.test.ts` — sessions with real Keycloak + **404
   ownership, F4**), E2E `profile-sessions.spec.ts` + extend
   `user-profile.spec.ts`.

### Phase 4 — Observability (stories 006-12, 006-13, 4 pts)

> Story `006-12`/`006-13` are sprint story IDs (features `006-15`…`006-20`);
> see the Phase 1/2 disambiguation note.

**Objective**: deep health, structured logs, Prometheus + Grafana + Kafka
dashboards. 006-19 deferred to Sprint 7.

1. `[M]` `lib/request-context.ts` + bind in auth/tenant middlewares; assert log
   fields (006-16) — **E2E assertion in `health-check.spec.ts` (login + API call
   → Pino JSON `requestId`/`tenantId`/`userId` in container logs)**.
2. `[M]` `modules/observability/health.*` — deep probe serves **both `/health`
   and `/api/v1/health`** (supersedes `basic-health-routes.ts`, F7); **update
   `ci-runtime-contract.spec.ts` + `ci-runtime-contract-flow.ts`**: replace the
   exact `toEqual` at `ci-runtime-contract-flow.ts:105` with
   `toMatchObject({ status: 200, body: { status: expect.stringMatching(/ok|degraded/),
   version: '2.0.0' } })` + structural check that `body.checks` length ≥ 4
   (§5.6 BREAKING CONTRACT NOTE, 006-15).
3. `[M]` `prom-client` (ADR-036, Accepted) + `metrics-registry` + `http-metrics` +
   `kafka-metrics` + `/metrics` (006-17).
4. `[M]` Prometheus compose service + `infra/prometheus/prometheus.yml` +
   dashboards + provisioning `dashboards.yml` (006-18/20).
5. `[S]` `OTEL_TRACING_ENABLED` config stub (feature-flagged off) — 006-19 stub,
   full OTel Sprint 7.
6. Tests: integration (`health.routes.int.test.ts`, `metrics.routes.int.test.ts`
   with real stack — NFRs < 200 ms / < 100 ms), E2E `health-check.spec.ts`,
   `observability-metrics.spec.ts`.

---

## 10. Testing Strategy

Constitution Rule 1: **every feature has an E2E test**; Rule 2: all suites
blocking; AGENTS.md: real stack, no core-service mocks in E2E/integration.

### 10.1 E2E (Playwright, `apps/web/e2e/`)

| Spec | Feature | NFR asserted |
| ---- | ------- | ------------ |
| `notification-sse.spec.ts` | 006-01 | SSE connect < 1 s, delivery < 2 s |
| `notification-center.spec.ts` | 006-02 | — |
| `notification-email.spec.ts` | 006-03 | Mailpit API poll; retry + dead-letter |
| `notification-prefs.spec.ts` | 006-04 | prefs save < 300 ms (API timing) |
| `plugin-notification.spec.ts` | 006-05 | — |
| `i18n-language-switch.spec.ts` | 006-07/08 | switch < 500 ms, no reload, locale date |
| `plugin-translations.spec.ts` | 006-09 | — |
| `tenant-translation-overrides.spec.ts` | 006-10 | — |
| `profile-sessions.spec.ts` | 006-13/14 | session revoke → forced re-login |
| `health-check.spec.ts` | 006-15, **006-16** | < 200 ms, 4 dependency checks; **Pino JSON logs carry `requestId`/`tenantId`/`userId`** |
| `observability-metrics.spec.ts` | 006-17/18/20 | scrape shape, datasources |

006-06 (no hardcoded strings) has **no UI E2E** — it is enforced by the
`formatjs/no-hardcoded-string` lint rule + key-parity Vitest test (the spec's
E2E column says "started in Phase 1"; the E2E for the *behavior* of i18n is
`i18n-language-switch.spec.ts`).

006-16 (structured logs) IS covered by E2E inside `health-check.spec.ts`: after
login + an authenticated API call, the spec asserts the Pino JSON records carry
`requestId`, `tenantId`, and `userId`. **Log-read mechanism**: the new helper
`e2e/helpers/core-api-logs.ts` runs `docker logs core-api` via Node
`child_process.execSync` (kept in the helper — Rule 4, not inline in the spec)
and polls for the matching `requestId` line with a bounded wait (up to 5 s, 250
ms interval). Because the Pino transport is **async**, log records flush
asynchronously — the helper must retry the read, not single-shot.

### 10.2 Integration (Vitest, real stack — Keycloak, PG, Redis, Kafka, Mailpit)

| File | Focus |
| ---- | ----- |
| `notification.routes.int.test.ts` | Stream 401/isolation/connect, list/read/prefs |
| `notification.consumer.int.test.ts` | Invite → row + SSE < 2 s; emission; **cap breach (F5) — event dropped, `notifications` row count unchanged (cap check precedes insert)**; **redelivery dedupe (F6) — same event twice → one row**; DLQ path |
| `email-queue.service.test.ts` | Retry, backoff, dead-letter (against real SMTP/Mailpit) — **integration (classified here, not §10.3)** |
| `profile-sessions.int.test.ts` | Sessions vs real Keycloak; **DELETE another user's sessionId → 404 (F4)** |
| `email-queue-purge.int.test.ts` | **F8**: tenant deletion saga purges pending `core.email_queue` rows and succeeds |
| `health.routes.int.test.ts` | 4 probes, degraded matrix, < 200 ms |
| `metrics.routes.int.test.ts` | scrape < 100 ms, series presence |

### 10.3 Unit (Vitest)

| File | Focus |
| ---- | ----- |
| `connection-manager.test.ts` | cap 5 eviction, heartbeat, close cleanup, tenant isolation |
| `notification.service.test.ts` | channel decisions, legacy prefs normalization |
| `emit-rate-limit.test.ts` | 10/min boundary, TTL reset |
| `keycloak-admin-users.test.ts` | `listUserSessions`/`deleteUserSession`/`syncEmail` helper contracts (mocked Keycloak HTTP) |
| `request-context.test.ts` | context binding, correlation propagation, no-PII — **unit (classified here, not §10.2)** |
| `metrics-registry.test.ts` | label cardinality bounds (bounded route set) |
| `i18n-keys.test.ts` (apps/web) | EN/IT + plugin key parity, no missing keys |

### 10.4 NFR Verification Summary

| NFR | Test type | Assertion |
| --- | --------- | --------- |
| SSE < 1 s | Integration | `Date.now()` around connect |
| Delivery < 2 s | E2E | invite → visible notification timing |
| Language switch < 500 ms | E2E | performance measurement between click and text swap |
| Health < 200 ms | Integration | handler wall time |
| Prom scrape < 100 ms | Integration | `GET /metrics` wall time |
| Prefs < 300 ms | Integration | PATCH round-trip |
| Log overhead < 5 ms | Unit | `ctxLogger()` write benchmark (pino async) |

---

## 11. Requirement Traceability

| Feature | Plan Section | Backend Files | Frontend Files | E2E / Test |
| ------- | ------------ | ------------- | -------------- | ---------- |
| 006-01 | §4.1, §5.1, §6.1 | `notification/consumer.ts`, `sse.ts`, `connection-manager.ts`; `invitation/service.ts` | `sse-client.ts`, `notification-bell.tsx` | `notification-sse.spec.ts` |
| 006-02 | §5.1, §6.1 | `notification/routes.ts`, `repository.ts` | `notification-center-page.tsx` | `notification-center.spec.ts` |
| 006-03 | §4.1, §5.2, §6.1 | `email-queue.service.ts`, `email-queue-worker.ts`; `lib/email.ts` | — | `notification-email.spec.ts` |
| 006-04 | §4.2, §5.1, §6.1 | `notification/routes.ts` (prefs) | `notification-prefs-page.tsx` | `notification-prefs.spec.ts` |
| 006-05 | §5.1, §5.3, §6.1/6.6 | `notification/emit.routes.ts`, `emit-rate-limit.ts`; `sdk` | `use-notifications.ts` | `plugin-notification.spec.ts` |
| 006-06 | §6.5, §7.4, §8.1 | — | `i18n/*`, eslint rule | `i18n-keys.test.ts` + lint |
| 006-07 | §6.5 | profile `language` (exists) | `use-locale.ts`, `language-switcher.tsx`, `auth-store.ts` | `i18n-language-switch.spec.ts` |
| 006-08 | §6.5 | — | `lib/format.ts` | `i18n-language-switch.spec.ts` |
| 006-09 | §6.5, §7.4 | manifest (Spec 004) | `plugin-loader.tsx` merge | `plugin-translations.spec.ts` |
| 006-10 | §4.1, §5.5, §6.5 | `translation_overrides`; `tenant-settings` routes | translations admin page | `tenant-translation-overrides.spec.ts` |
| 006-11 | §5.4, §6.4 | `user-profile/service.ts`, `schema.ts` | `profile-page.tsx` | extend `user-profile.spec.ts` |
| 006-12 | §5.4, §6.4 | `user-profile/service.ts` (picture) | `avatar-header.tsx` | extend `user-profile.spec.ts` |
| 006-13 | §5.4, §6.4 | `keycloak-admin-users.ts`, `user-profile/routes.ts` (**ownership check before Keycloak call — F4**) | `sessions-card.tsx`, `use-sessions.ts` | `profile-sessions.spec.ts` + `profile-sessions.int.test.ts` (404 for another user's sessionId) |
| 006-14 | §5.4, §6.4 | `keycloakAccountUrl` | `password-card.tsx` | `profile-sessions.spec.ts` |
| 006-15 | §5.6, §6.2, §7.8 | `observability/health.*` (serves `/health` + `/api/v1/health`, supersedes `basic-health-routes.ts` — F7) | — | `health-check.spec.ts` + updated `ci-runtime-contract.spec.ts`/`-flow.ts` |
| 006-16 | §6.3, §9 | `lib/request-context.ts`, middlewares | — | `request-context.test.ts` (unit) + **`health-check.spec.ts` E2E: Pino JSON `requestId`/`tenantId`/`userId` in container logs (F3)** |
| 006-17 | §5.6, §6.2, §8.1 | `observability/metrics.*` | — | `observability-metrics.spec.ts` |
| 006-18 | §7.6 | — | `infra/grafana/dashboards/plexica-overview.json` | `observability-metrics.spec.ts` |
| 006-19 | §3.2 D-13, §9 Phase 4 | config stub only | — | **Deferred Sprint 7** |
| 006-20 | §5.6, §6.2 | `observability/kafka-metrics.ts` | `infra/grafana/dashboards/kafka-monitoring.json` | `observability-metrics.spec.ts` |

### NFR Traceability

| NFR | Target | Where verified |
| --- | ------ | -------------- |
| SSE connection | < 1 s | §10.4 integration |
| Delivery | < 2 s | §10.4 E2E |
| Language switch | < 500 ms | §10.4 E2E |
| Health | < 200 ms | §10.4 integration |
| Prom scrape | < 100 ms | §10.4 integration |
| Prefs save | < 300 ms | §10.4 integration |
| Log overhead | < 5 ms | §10.4 unit |

---

## 12. Sprint Alignment

`sprint-006.yaml` (13 stories, 27 pts, 4 phases) is fully honored. No scope
deviation; 006-19 remains deferred (velocity.md overcommit rationale).

| Sprint story | forge_story_id | Points | Size | Spec features | Plan section | Phase |
| ------------ | -------------- | ------ | ---- | ------------- | ------------ | ----- |
| 006-01 SSE infrastructure | **E06-S001** | 3 | L | 006-01 | §4.1, §5.1, §6.1, §9 P1 | Phase 1 |
| 006-02 Notification center UI | — | 2 | M | 006-02 | §5.1, §6.1, §6.5, §9 P1 | Phase 1 |
| 006-03 Email + retry queue | — | 2 | M | 006-03 | §4.1, §5.2, §6.1, §9 P1 | Phase 1 |
| 006-04 Preferences | — | 2 | M | 006-04 | §4.2, §5.1, §9 P1 | Phase 1 |
| 006-05 Plugin emission | — | 2 | M | 006-05 | §5.1, §6.6, §9 P1 | Phase 1 |
| 006-06 react-intl migration | — | 3 | L | 006-06 | §6.5, §7.4, §8.1, §9 P2 | Phase 2 |
| 006-07 Language switch + formatting | — | 2 | M | 006-07, 006-08 | §6.5, §9 P2 | Phase 2 |
| 006-08 Plugin translations | — | 2 | M | 006-09 | §6.5, §9 P2 | Phase 2 |
| 006-09 Tenant overrides | — | 1 | S | 006-10 | §4.1, §5.5, §9 P2 | Phase 2 |
| 006-10 Profile + avatar | — | 2 | M | 006-11, 006-12 | §5.4, §6.4, §9 P3 | Phase 3 |
| 006-11 Sessions + password | — | 2 | M | 006-13, 006-14 | §5.4, §6.4, §9 P3 | Phase 3 |
| 006-12 Health + structured logs | — | 2 | M | 006-15, 006-16 | §5.6, §6.2/6.3, §9 P4 | Phase 4 |
| 006-13 Observability dashboards | — | 2 | M | 006-17, 006-18, 006-20 | §5.6, §6.2, §7.6, §9 P4 | Phase 4 |
| **Deferred** | — | — | — | 006-19 (OTel) | §3.2 D-13, §9 P4 stub | Sprint 7 |

**Total**: 27 pts across 13 stories + 1 deferred feature — matches the sprint
file exactly.

---

## 13. Constitution Compliance

| Article | Status | Notes |
| ------- | ------ | ----- |
| Rule 1: E2E per feature | **COMPLIANT** | 11 new E2E specs covering every behavioral feature (006-16 covered inside `health-check.spec.ts` — log fields assertion; 006-06 via lint + key-parity test; 006-19 deferred). Real stack, no mocks (AGENTS.md). |
| Rule 2: No merge without green CI | **COMPLIANT** | Unit + integration + E2E blocking; `ci-runtime-contract.spec.ts` **and `ci-runtime-contract-flow.ts`** updated for the additive `/health` payload (F7). |
| Rule 3: One pattern per operation | **COMPLIANT** | TanStack Query for all new data fetching; RHF+Zod forms; Zustand auth store holds locale; one SSE client; one notification prefs schema. |
| Rule 4: No file above 200 lines | **COMPLIANT** | Every new file ≤ ~100 est. lines; notification module decomposed into 14 files; i18n catalogs domain-split; observability split per concern. |
| Rule 5: ADR for significant decisions | **SATISFIED / COMPLIANT** | **ADR-035** (Accepted 2026-09-17) covers the new `notifications` + `email_queue` core entities and the manual-SSE delivery pattern; **ADR-036** (Accepted 2026-09-17) covers the `prom-client` new core dependency. Both implementation gates are cleared — Phase 1 and Phase 4 may start. |
| Rule 6: English commit messages | **COMPLIANT** | All commits for this sprint in English (Italian catalog strings are data, not commit text). |
| Tech Stack | **COMPLIANT** | No SSE lib; `nodemailer`/`react-intl`/`prom-client` (ADR-036 **Accepted**) only. No new infra service beyond Prometheus (compose addition, existing Grafana datasource already references it). |
| Architecture | **COMPLIANT** | Fastify monolith, schema-per-tenant (notifications + translation_overrides in tenant schema), outbox → Kafka → DLQ reuse, Keycloak for sessions/avatar, MF for plugin i18n. Storage vocabulary (ADR-034) respected: only `STORAGE_*`/`storage_*` names in new code. |
| Quality | **COMPLIANT** | Coverage ≥ 80%; all NFRs have measurable tests (§10.4); P95 < 200 ms maintained (deep `/health` is out-of-band, memoized 5 s). |
| Security §1 Tenant isolation | **COMPLIANT** | SSE events and notification rows are tenant-scoped; consumer resolves users within the event's tenant schema; cross-tenant delivery is integration-tested. |
| Security §2 Authentication | **COMPLIANT** | SSE is authenticated (fetch streaming — no token in query string); `/health` + `/metrics` public opt-ins documented; `METRICS_TOKEN` optional guard. |
| Security §3 SQL injection | **COMPLIANT** | All queries via Prisma/parameterized SQL; no string interpolation (ID-001 exception unchanged). |
| Security §4 Input validation | **COMPLIANT** | Zod on every new endpoint (`notification/schema.ts`, prefs, emit, translations, sessions). |
| Security §5 Secrets | **COMPLIANT** | New env vars only in `config.ts`/`.env.example`; no defaults for secrets; `METRICS_TOKEN` optional. |
| Security §6 PII | **COMPLIANT** | Notification titles are i18n keys (no PII); `email_queue.to_address` redacted in logs (existing redact paths extended); invite event payload carries only the target email (tenant-key encrypted, ADR-004); sessions response bounded to IDs/timestamps/IP. |

---

## 14. Risks & Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| At-least-once redelivery → duplicate notification rows (ADR-004) | LOW | `notifications.event_id` UNIQUE index + consumer insert-ignore dedupe (§5.2, F6); integration test publishes the same event twice → single row. |
| SSE connection management at scale | HIGH | Per-tenant pools; cap 5/user (oldest evicted); 20 s heartbeat; cleanup on `close`/abort; `sse_active_connections` gauge for capacity planning. Scaling note: with N core replicas, SSE connections must be pinned — **flag for a future `sticky`-session/Redis pub-sub decision**; single-node dev/CI unaffected. |
| SSE client reconnection storms | MEDIUM | Exponential backoff + jitter in `sse-client.ts`; heartbeat timeout detection distinguishes dead connections from server restarts. |
| Missing i18n keys at runtime | MEDIUM | EN fallback (react-intl `defaultMessage`); CI key-parity test (`en`/`it`/plugin bundles); `formatjs/no-hardcoded-string` lint. |
| Observability overhead on API latency | MEDIUM | Pre-aggregated gauges (30 s interval); histogram buckets bounded; `prom-client` uses `collectDefaultMetrics` at 30 s; OTel deferred + flag off. |
| Email delivery reliability | MEDIUM | `core.email_queue` durable queue; 3 retries 1s/4s/16s; dead-letter log; Mailpit in dev; GDPR purge hook for `email_queue.tenant_id`. |
| Plugin notification spam | LOW | Redis 10/min/plugin/user at emission (429) + 100/min/user consumer cap (drop + counter). |
| `/health` payload change breaks CI contract | MEDIUM | Additive shape (keep `status` + `version`); update `ci-runtime-contract.spec.ts` **and `ci-runtime-contract-flow.ts`** in the same PR (Phase 4, F7). |
| `notificationPrefs` legacy shape | LOW | Reader normalizes flat boolean map; writer persists nested shape; typed at the domain boundary (TD-003 residual-cast pattern). |
| Plugin i18n bundle poisoning | MEDIUM | Bundles validated (JSON schema + size cap) before merge; namespaced under `plugin.{slug}.`; MF shared deps version-locked (ADR-005). |
| Keycloak session API latency | LOW | Sessions endpoint is user-triggered (not on hot path); 503 on Keycloak outage with graceful UI message. |

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Spec | `.forge/specs/006-cross-cutting-features/spec.md` |
| Architecture | `.forge/architecture/architecture.md` |
| Sprint | `.forge/sprints/active/sprint-006.yaml` |
| Velocity scale | `.forge/sprints/velocity.md` |
| Epic | `.forge/epics/epic-06-cross-cutting/epic.md` |
| Story E06-S001 | `.forge/epics/epic-06-cross-cutting/story-E06-S001-sse-notification-infrastructure.md` |
| Tasks | `.forge/specs/006-cross-cutting-features/tasks.md` (to be created by /forge-tasks) |
| Constitution | `.forge/constitution.md` |
| ADR-002/004/010/012/016/023/034 | `.forge/knowledge/adr/` |
| ADR-035 (Accepted), ADR-036 (Accepted) | `.forge/knowledge/adr/` |
| Decision Log | `.forge/knowledge/decision-log.md` |
| Plan 005 (style reference) | `.forge/specs/005-super-admin/plan.md` |