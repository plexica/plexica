# Tasks: 006 — Cross-Cutting Features

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by `forge-scrum` via `/forge-tasks`.

| Field   | Value                                                              |
| ------- | ------------------------------------------------------------------ |
| Status  | In Progress — Phases 1-4 done (49/73 tasks), Phases 5-7 pending (24) |
| Author  | forge-scrum                                                        |
| Date    | 2026-09-17                                                         |
| Spec    | `.forge/specs/006-cross-cutting-features/spec.md`                  |
| Plan    | `.forge/specs/006-cross-cutting-features/plan.md`                  |
| ADR     | ADR-035 (Accepted), ADR-036 (Accepted) — implementation gates cleared |
| Sprint  | `.forge/sprints/active/sprint-006.yaml` (13 stories, 27 pts, 4 phases) |

---

## Legend

- `[FR-006-NN]` — Spec 006 feature requirement (traceability; e.g. `006-01` SSE)
- `[NFR-006-N]` — Spec 006 NFR target (1: SSE < 1 s · 2: delivery < 2 s ·
  3: lang switch < 500 ms · 4: health < 200 ms · 5: scrape < 100 ms ·
  6: prefs < 300 ms · 7: log overhead < 5 ms)
- `[P]` — Parallelizable with other `[P]` tasks in the same phase
- Status: `[ ]` pending · `[x]` done · `[-]` skipped
- **Type**: backend | frontend | test | infra | integration
- **Estimated**: S (< 30 min) | M (30 min – 2 h) | L (2 – 4 h)
- **Depends on**: [TASK-IDs] or "none"

> **Scope note (plan §3.2 D-13 / sprint-006.yaml)**: feature 006-19
> (OpenTelemetry tracing) is **deferred to Sprint 7** — only the
> `OTEL_TRACING_ENABLED` config stub lands here (task 6.8). Requirement
> coverage is 19/20 implemented + 1 stub.

---

## Phase 1: Foundation — Migrations, Config, Shared Types

> Cross-phase prerequisites. Unblocks Phase 2 (migrations + rate limit + SDK),
> Phase 4 (config), Phase 6 (prom-client, config). All tasks here are
> independent of each other except where noted — run in parallel.

- [x] **1.1** `[M]` `[FR-006-03]` Core `EmailQueue` Prisma model + migration
  - **File**: `services/core-api/prisma/schema.prisma` (Modify), `services/core-api/prisma/migrations/<ts>_email_queue/migration.sql` (Create)
  - **Type**: backend — data model (new core entity, ADR-035)
  - **Description**: `EmailQueue` model per plan §4.1: `tenant_id` (nullable FK → `core.tenants`, ADR-016 GDPR pattern), `to_address`, `subject`, `html_body`, `email_type`, `status` CHECK IN (`pending`,`sending`,`sent`,`failed`,`dead`), `attempts`, `next_attempt_at`, `last_error` (bounded, no stack/PII), `created_at`, `sent_at`; index `(status, next_attempt_at)` for the worker claim. Core-schema Prisma migration via `db:migrate`.
  - **Spec Reference**: spec 006-03; plan §4.1, §4.4, §7.8
  - **Dependencies**: none
  - **Estimated**: M

- [x] **1.2** `[M]` `[FR-006-01]` Tenant `Notification` Prisma model + relation
  - **File**: `services/core-api/prisma/tenant-schema/notification-models.prisma` (Create), `services/core-api/prisma/tenant-schema/core-models.prisma` (Modify — relation on `UserProfile`)
  - **Type**: backend — data model (new core entity, ADR-035)
  - **Description**: `Notification` model per architecture §3.2 / plan §4.1: `id` UUID PK, `event_id` VARCHAR(255) **UNIQUE** (consumer idempotency), `user_id` FK → `user_profile.user_id`, `type` VARCHAR(63), `title` VARCHAR(255), `body` TEXT?, `metadata` JSONB DEFAULT `'{}'`, `read` BOOLEAN DEFAULT false, `created_at` TIMESTAMPTZ; `@@unique([eventId])`, `@@index([userId, read, createdAt(sort: Desc)])`. Model does **not** exist today — only `notification_prefs` on `user_profile`.
  - **Spec Reference**: spec 006-01; plan §4.1
  - **Dependencies**: none
  - **Estimated**: M

- [x] **1.3** `[M]` `[FR-006-01]` `[FR-006-10]` Tenant raw-SQL migrations + registration
  - **File**: `services/core-api/prisma/tenant-schema/006_notifications/migration.sql` (Create), `services/core-api/prisma/tenant-schema/006_translation_overrides/migration.sql` (Create), `services/core-api/src/lib/multi-schema-migrate.ts` (Modify — register both in `TENANT_MIGRATION_FILES`)
  - **Type**: backend — data model
  - **Description**: Tenant DDL runs as raw SQL registered in `TENANT_MIGRATION_FILES` (per-tenant, `SET LOCAL search_path`) — a single Prisma migration **cannot span core + tenant schemas** (plan §4.4). `006_notifications`: `CREATE TABLE tenant_{slug}.notifications` + `event_id` unique index + `(user_id, read, created_at DESC)` index. `006_translation_overrides`: PK `(key, locale)`. Additive, no backfill. Applied via `migrateAll()` / `tenant:migrate`.
  - **Spec Reference**: spec 006-01, 006-10; plan §4.4, §7.8
  - **Dependencies**: 1.2 (DDL mirrors model)
  - **Estimated**: M

- [x] **1.4** `[S]` `[FR-006-17]` `[P]` Add `prom-client@15.1.3` core dependency
  - **File**: `services/core-api/package.json` (Modify)
  - **Type**: backend — dependency
  - **Description**: New core dependency per **ADR-036 (Accepted 2026-09-17)** — `prom-client` registry + default process metrics. Imported **only** by `metrics-registry.ts` (plan §6.2).
  - **Spec Reference**: spec 006-17; plan §8.1, §3.3
  - **Dependencies**: none
  - **Estimated**: S

- [x] **1.5** `[S]` `[FR-006-06]` `[P]` Add `eslint-plugin-formatjs` devDependency
  - **File**: `apps/web/package.json` (Modify)
  - **Type**: frontend — tooling
  - **Description**: devDependency for the `formatjs/no-hardcoded-string` lint rule (006-06). App-scoped devDep — flagged in plan, no core ADR required.
  - **Spec Reference**: spec 006-06; plan §8.1
  - **Dependencies**: none
  - **Estimated**: S

- [x] **1.6** `[M]` `[FR-006-01]` `[FR-006-03]` `[FR-006-15]` `[FR-006-17]` `[P]` Config env vars + `.env.example`
  - **File**: `services/core-api/src/lib/config.ts` (Modify), `.env.example` (Modify)
  - **Type**: backend — config
  - **Description**: Add `NOTIFICATION_*`, `PROMETHEUS_*`, `METRICS_TOKEN?` (optional `/metrics` auth switch), `OTEL_TRACING_ENABLED` (default **false**), `KEYCLOAK_ACCOUNT_URL_PATTERN` (per-realm account console URL). Zod-validated with safe defaults; no secret defaults (Security §5).
  - **Spec Reference**: spec 006-01/03/15/17; plan §7.8, §13 (Security §5)
  - **Dependencies**: none
  - **Estimated**: M

- [x] **1.7** `[S]` `[FR-006-01]` `[P]` Rate-limit preset `SSE_CONNECT_RATE_LIMIT`
  - **File**: `services/core-api/src/lib/rate-limit-config.ts` (Modify)
  - **Type**: backend — rate limiting (extends ADR-012)
  - **Description**: New preset `SSE_CONNECT_RATE_LIMIT` (10/min/user) applied to SSE connection **establishment** (ADR-035 Decision 1). **Do not** add the `NOTIFICATION_EMIT_RATE_LIMIT` aggregate — ADR-035 removed it; the emission ladder is 10/min/plugin/user (Redis, task 2.9) + 100/min/user consumer cap (task 2.6).
  - **Spec Reference**: spec 006-01 (risk table); plan §6.1, §7.8
  - **Dependencies**: none
  - **Estimated**: S

- [x] **1.8** `[M]` `[FR-006-01]` `[FR-006-02]` `[FR-006-04]` `[FR-006-13]` `[P]` Shared API types package
  - **File**: `packages/api-types/src/tenant/notification.ts` (Create)
  - **Type**: shared package — contracts
  - **Description**: Zod response schemas `NotificationDto`, `NotificationList`, `NotificationPreferences`, `SessionList` — single contract for web + tests (ADR-029 pattern).
  - **Spec Reference**: spec 006-01/02/04/13; plan §6.6, §7.5
  - **Dependencies**: none
  - **Estimated**: M

- [x] **1.9** `[S]` `[FR-006-05]` SDK notification emission
  - **File**: `packages/sdk/src/notification-api.ts` (Create), `packages/sdk/src/plugin-sdk.ts` (Modify — `emitNotification`), `packages/sdk/src/types.ts` (Modify — `EmitNotificationInput`)
  - **Type**: shared package — SDK
  - **Description**: `emitNotification({ userId, type, titleKey, titleParams?, bodyKey?, metadata? })` → `POST /api/v1/notifications/emit` via `PluginHttp` (authenticated with plugin service identity, same as `emitEvent`). Contract per ADR-035 Decision 5.
  - **Spec Reference**: spec 006-05; plan §6.6, §7.5
  - **Dependencies**: 1.8 (shared input/output types)
  - **Estimated**: S

---

## Phase 2: Notifications — Core Implementation (006-01 → 006-05)

> Plan §9 Phase 1 backend core. Ordered foundation → core. `[P]` tasks are
> independent of the schema/consumer and can start as soon as Phase 1 lands.

- [x] **2.1** `[M]` `[FR-006-01]` `[P]` Notification connection manager
  - **File**: `services/core-api/src/modules/notification/connection-manager.ts` (Create)
  - **Type**: backend — SSE core
  - **Description**: `ConnectionManager` — per-tenant connection pools; per-user cap **5** (oldest evicted); heartbeat keepalive (20 s comment); cleanup on `close`/abort; `connect(tenantSlug, userId, res)` → handle; `publish(tenantSlug, userId, dto)` → boolean; `getGauge()` feeds `sse_active_connections` (task 6.6). Independent of schema.
  - **Spec Reference**: spec 006-01 (risk: connection management); plan §6.1
  - **Dependencies**: none
  - **Estimated**: M

- [x] **2.2** `[S]` `[FR-006-01]` `[P]` SSE framing helpers
  - **File**: `services/core-api/src/modules/notification/sse.ts` (Create)
  - **Type**: backend — SSE core
  - **Description**: `writeEvent`, `heartbeat`, headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`). Manual SSE on Fastify `reply.raw` — **zero new dependency** (story E06-S001 decision, no SSE ADR).
  - **Spec Reference**: spec 006-01; plan §6.1, §3.2 D-1
  - **Dependencies**: none
  - **Estimated**: S

- [x] **2.3** `[M]` `[FR-006-01]` `[FR-006-02]` `[FR-006-04]` `[FR-006-05]` `[P]` Notification types + Zod schemas
  - **File**: `services/core-api/src/modules/notification/types.ts` (Create), `services/core-api/src/modules/notification/schema.ts` (Create)
  - **Type**: backend — domain types
  - **Description**: `NotificationDto`, `PreferenceMap` (nested `{ defaults:{inApp,email}, types:{ "<type>":{inApp,email} } }` + legacy normalization), `EmitNotificationInput`, `EmailQueueRow`. Zod: list query (`page`, `pageSize`, `filter`), read params, prefs (partial), emit body, translations (Security §4).
  - **Spec Reference**: spec 006-01/02/04/05; plan §6.1
  - **Dependencies**: 1.8 (shared response schemas)
  - **Estimated**: M

- [x] **2.4** `[M]` `[FR-006-02]` `[FR-006-04]` Notification repository
  - **File**: `services/core-api/src/modules/notification/repository.ts` (Create)
  - **Type**: backend — persistence
  - **Description**: notifications CRUD — `list` (page + `filter=unread|all`, `(user_id, read, created_at DESC)` index), `markRead`, `markAllRead`, `insert` with **insert-ignore** (`ON CONFLICT DO NOTHING` — F6, covers both `event_id` and row `id` conflicts); prefs read/write with legacy normalization (`true` → `{inApp:true, email:false}` + **category shape** `invite_received`/`workspace_changes`/`role_changes`, plan D-6, review fix 2). **Column ownership (fix 2 reconciliation)**: the notification module owns `notification_prefs` writes (D-6 nested shape); the user-profile module is read-only (its PATCH schema no longer accepts `notificationPrefs`).
  - **Spec Reference**: spec 006-02/04; plan §6.1, §4.2, §5.2
  - **Dependencies**: 1.2, 2.3
  - **Estimated**: M

- [x] **2.5** `[M]` `[FR-006-01]` `[FR-006-02]` `[FR-006-04]` Notification service
  - **File**: `services/core-api/src/modules/notification/service.ts` (Create)
  - **Type**: backend — orchestration
  - **Description**: `createNotification` (channels decision from prefs → in-app/email/both), `listNotifications`, `markRead`/`markAllRead` (ownership 404 — no enumeration), prefs orchestration. Calls `ConnectionManager.publish` on in-app channel.
  - **Spec Reference**: spec 006-01/02/04; plan §6.1
  - **Dependencies**: 2.1, 2.4
  - **Estimated**: M

- [x] **2.6** `[L]` `[FR-006-01]` `[FR-006-05]` Notification Kafka consumer
  - **File**: `services/core-api/src/modules/notification/consumer.ts` (Create)
  - **Type**: backend — events
  - **Description**: Consumer group `plexica-notification-consumer` subscribing `plexica.workspace.invite` + `plexica.notification`. **Ordered pipeline per plan §5.2 (dedupe-first)**: (1) **insert-ignore (F6)** — `INSERT ... ON CONFLICT (event_id) DO NOTHING` — atomic dedupe **before** the cap check, so an at-least-once redelivery (ADR-004) of an already-processed event never consumes quota; (2) `rowCount = 0` → duplicate redelivery skip, no quota consumption, no delivery; (3) `rowCount = 1` (new row) → **cap check (F5)** — Redis `notification:{tenantId}:{userId}:emit` 100/min/user; breach → **delivery suppressed, row stays persisted** (prevents redelivery quota inflation), increment `notifications_rate_limited_total`, warn (never DLQ); (4) resolve profile → prefs → channels → SSE push + email enqueue. Non-tenant invitee → email-only. Processing failures: retry 3× backoff then DLQ (ADR-016). Email-carried targets (`email` → `user_profile.user_id`) resolved up-front.
  - **Spec Reference**: spec 006-01/05; plan §5.2, §6.1
  - **Dependencies**: 2.1, 2.4, 2.5, 2.7
  - **Estimated**: L
  - **Review fixes**: email enqueue is **event_id-keyed and idempotent** (`core.email_queue.dedupe_key`, `ON CONFLICT DO NOTHING`) — a duplicate redelivery after a crash between step 1 and step 4 re-attempts it (email never permanently lost, fix 5); decrypt failures dead-letter from wire metadata (fix 12); over-length plugin types (>63, `notifications.type` bound) throw → DLQ (fix 9); `titleParams` thread through row metadata → SSE DTO (fix 8).

- [x] **2.7** `[M]` `[FR-006-03]` `[P]` Email queue service
  - **File**: `services/core-api/src/modules/notification/email-queue.service.ts` (Create)
  - **Type**: backend — persistence
  - **Description**: `EmailQueueService.enqueue/claim/settle` on `core.email_queue`. Claim via `UPDATE ... WHERE id ... RETURNING` (SKIP LOCKED, `(status, next_attempt_at)` index); **worker lease (fix 4)**: `claimed_at` + `lease_expires_at` columns stamped on claim, cleared on settle, and the claim re-claims `sending` rows whose lease expired (mirrors `outbox-repository.ts` lease) — a crash between claim and settle orphans nothing; settle to `sent`/`failed`/`dead`; `enqueue` is idempotent (`dedupe_key` = consumer `event_id`, `ON CONFLICT DO NOTHING`); `to_address` redacted in logs (Security §6).
  - **Spec Reference**: spec 006-03; plan §6.1
  - **Dependencies**: 1.1
  - **Estimated**: M

- [x] **2.8** `[M]` `[FR-006-03]` Email queue worker
  - **File**: `services/core-api/src/modules/notification/email-queue-worker.ts` (Create)
  - **Type**: backend — delivery
  - **Description**: Retry worker — claim batch, `nodemailer` send (bounded by a 10s `Promise.race` timeout in `sendMailNow` — a hung SMTP cannot strand a claim, fix 4), **4 attempts = 1 send + 3 retries with 1s/4s/16s backoff** (`NOTIFICATION_EMAIL_MAX_ATTEMPTS = 4`; `next_attempt_at` scheduling), dead-letter logging; `runTick()` → `{sent, failed, dead}`. Mailpit in dev/test.
  - **Spec Reference**: spec 006-03 (risk: email reliability); plan §6.1, §2.3
  - **Dependencies**: 2.7
  - **Estimated**: M

- [x] **2.9** `[S]` `[FR-006-05]` `[P]` Emit rate limiter
  - **File**: `services/core-api/src/modules/notification/emit-rate-limit.ts` (Create)
  - **Type**: backend — rate limiting
  - **Description**: Redis counter `notif-rl:{tenantId}:{pluginSlug}:{userId}` (INCR + EXPIRE 60 s); `assert(tenantId, pluginSlug, userId)` throws 429 `RATE_LIMIT_EXCEEDED` at **10/min/plugin/user** (spec risk: plugin spam).
  - **Spec Reference**: spec 006-05 (risk table); plan §6.1
  - **Dependencies**: 1.6
  - **Estimated**: S

- [x] **2.10** `[S]` `[FR-006-03]` `lib/email.ts` — enqueue path + invitation reroute
  - **File**: `services/core-api/src/lib/email.ts` (Modify)
  - **Type**: backend — delivery
  - **Description**: Refactor into `sendMailNow` (kept for current sync callers during migration) + `enqueueEmail` (new default); `sendInvitationEmail` switches to `enqueueEmail` — invitation email now flows through the durable retry queue (006-03).
  - **Spec Reference**: spec 006-03; plan §6.1, §7.8
  - **Dependencies**: 2.7
  - **Estimated**: S

- [x] **2.11** `[M]` `[FR-006-01]` `[P]` Invitation outbox emission
  - **File**: `services/core-api/src/modules/invitation/service.ts` (Modify)
  - **Type**: backend — events (006-01 trigger)
  - **Description**: `createInvitationService` gains one outbox enqueue **inside the existing `withTenantDb` transaction**: `enqueueEvent(tx, 'plexica.workspace.invite', buildDomainEvent({ type:'workspace.invite', tenantId, producer:{kind:'core',id:'invitation'}, payload:{ workspaceId, workspaceName, inviteeEmail, invitedBy, role }, correlationId }))`. No PII beyond the minimal target email (tenant-key encrypted, ADR-004).
  - **Spec Reference**: spec 006-01; plan §5.3, §7.8
  - **Dependencies**: none
  - **Estimated**: M

- [x] **2.12** `[M]` `[FR-006-03]` `[P]` GDPR email-queue purge step (F8)
  - **File**: `services/core-api/src/modules/admin/services/deletion-step-email-queue-purge.ts` (Create), `services/core-api/src/modules/admin/services/deletion-step-executor.ts` (Modify — add `'email_queue_purge'` to `STEP_ORDER` **between** `event_data_purge` and `schema_drop` + a `dispatchStep` case)
  - **Type**: backend — GDPR (Spec 005 deletion saga extension)
  - **Description**: `DELETE FROM core.email_queue WHERE tenant_id = $1` (all statuses). Rationale (plan §4.2): GDPR right-to-erasure of `to_address`/`html_body` PII **and** preventing the worker from sending mail for a deleted tenant (not FK-ordering — the tombstone row is kept). Step row materialized automatically by the existing `STEP_ORDER` upsert loop — **no** change to `deletion-saga-start.service.ts`. Integration-tested in 3.14.
  - **Spec Reference**: spec 006-03 (GDPR); plan §4.2, §7.8, §9 P1 task 7
  - **Dependencies**: 1.1
  - **Estimated**: M

---

## Phase 3: Notifications — Interface, UI & Tests (006-01 → 006-05)

> Plan §9 Phase 1 routes + frontend + test suite. Depends on Phase 2 core.
> Unit and E2E spec tasks marked `[P]` are mutually independent once their
> backend dependency lands.

- [x] **3.1** `[M]` `[FR-006-01]` `[NFR-006-1]` SSE stream route
  - **File**: `services/core-api/src/modules/notification/routes.ts` (Create)
  - **Type**: backend — endpoint
  - **Description**: `GET /api/v1/notifications/stream` — registered in `tenantScope` (authMiddleware + tenantContextMiddleware + userProfileResolver). Rate limit `SSE_CONNECT_RATE_LIMIT` on **establishment** only (sustained delivery is push-only); `ConnectionManager.connect` on `reply.raw` with SSE headers from 2.2. Errors: 401 / 403 (tenant suspended) / 429.
  - **Spec Reference**: spec 006-01; plan §5.1, §6.1
  - **Dependencies**: 2.1, 2.2, 2.3, 2.5, 1.7
  - **Estimated**: M

- [x] **3.2** `[M]` `[FR-006-02]` `[FR-006-04]` `[NFR-006-6]` Center, preferences & types routes
  - **File**: `services/core-api/src/modules/notification/routes.ts` (Modify)
  - **Type**: backend — endpoints
  - **Description**: `GET /notifications` (paginated, `filter=unread|all`); `PATCH /notifications/:id/read` — 404 if not found **or** not owned (no enumeration); `POST /notifications/read-all` (plan addition) → `{ updated }`; `GET/PATCH /notifications/preferences` (save round-trip < 300 ms); `GET /notifications/types` (core + installed plugin-declared types for the prefs UI).
  - **Spec Reference**: spec 006-02/04; plan §5.1, §6.1
  - **Dependencies**: 2.3, 2.4, 2.5
  - **Estimated**: M

- [x] **3.3** `[M]` `[FR-006-05]` Plugin emission route
  - **File**: `services/core-api/src/modules/notification/emit.routes.ts` (Create)
  - **Type**: backend — endpoint
  - **Description**: `POST /api/v1/notifications/emit` registered in `eventScope` (`pluginEventAuth` + `verifyPluginInstalled`, mirrors `modules/plugin/routes/events.routes.ts`). Generates `notificationId` **at emission**, enqueues `plexica.notification` Kafka event via outbox, returns **`202 { status: "accepted", notificationId }`** — verbatim ADR-035 Decision 5 (no `200 { queued }` alternative). `EmitRateLimiter.assert` → 429.
  - **Spec Reference**: spec 006-05; plan §5.1
  - **Dependencies**: 2.9, 2.3, 2.6
  - **Estimated**: M

- [x] **3.4** `[S]` Module registration + `index.ts` wiring
  - **File**: `services/core-api/src/modules/notification/index.ts` (Create), `services/core-api/src/index.ts` (Modify)
  - **Type**: backend — integration
  - **Description**: Fastify plugin registering tenantScope routes (3.1/3.2) + eventScope emit route (3.3); `index.ts` registers `notificationRoutes` + `notificationEmitRoutes` alongside the existing scopes.
  - **Spec Reference**: plan §6.1, §7.8
  - **Dependencies**: 3.1, 3.2, 3.3
  - **Estimated**: S

- [x] **3.5** `[M]` `[FR-006-01]` `[NFR-006-2]` Frontend SSE client + notifications API
  - **File**: `apps/web/src/services/sse-client.ts` (Create), `apps/web/src/services/notifications-api.ts` (Create)
  - **Type**: frontend — data layer
  - **Description**: Fetch-based streaming (ReadableStream) with the Bearer token — **NOT `EventSource`** (cannot set an Authorization header; query-string tokens leak into logs/proxies — Security §2, plan D-12). Auto-reconnect with exponential backoff + jitter; heartbeat timeout detection; dispatch `notification` events to an in-memory bus consumed by TanStack Query invalidation. `notifications-api`: list/read/read-all/prefs/emit methods.
  - **Spec Reference**: spec 006-01; plan §6.5, §3.2 D-12
  - **Dependencies**: 3.1, 3.4
  - **Estimated**: M

- [x] **3.6** `[M]` `[FR-006-02]` Notification center UI
  - **File**: `apps/web/src/hooks/use-notifications.ts` (Create), `apps/web/src/components/notifications/notification-bell.tsx` (Create), `apps/web/src/components/notifications/notification-item.tsx` (Create), `apps/web/src/pages/notification-center-page.tsx` (Create), `apps/web/src/types/notification.ts` (Create), `apps/web/src/router-shell-routes.tsx` (Modify — `/notifications`)
  - **Type**: frontend — UI
  - **Description**: Header bell (Radix DropdownMenu, unread badge, TanStack Query poll every 30 s + SSE-push invalidation); center page (list, mark read, read-all). TanStack Query only (Rule 3).
  - **Spec Reference**: spec 006-02; plan §6.5
  - **Dependencies**: 3.5
  - **Estimated**: M

- [x] **3.7** `[M]` `[FR-006-04]` Notification preferences UI
  - **File**: `apps/web/src/hooks/use-notification-prefs.ts` (Create), `apps/web/src/pages/notification-prefs-page.tsx` (Create), `apps/web/src/router-shell-routes.tsx` (Modify — `/notifications/preferences`)
  - **Type**: frontend — UI
  - **Description**: Per-type channel toggles (inApp/email) fed by `GET /notifications/types`; save mutation via TanStack Query.
  - **Spec Reference**: spec 006-04; plan §6.5
  - **Dependencies**: 3.5
  - **Estimated**: M

- [x] **3.8** `[M]` `[FR-006-01]` `[FR-006-02]` `[FR-006-05]` Notification i18n strings (EN/IT)
  - **File**: `apps/web/src/i18n/messages.en.notifications.ts` (Create), `apps/web/src/i18n/messages.it.notifications.ts` (Create), `apps/web/src/i18n/messages.en.ts` (Modify — register domain)
  - **Type**: frontend — i18n
  - **Description**: Notification domain strings (bell/center/prefs) + persisted title keys (`notifications.workspace.invite.title`, …) — the same keys stored in `notifications.title` are resolved by the UI.
  - **Spec Reference**: spec 006-01/02/05; plan §7.4
  - **Dependencies**: 3.6, 3.7 (key list)
  - **Estimated**: M

- [x] **3.9** `[S]` `[FR-006-01]` `[FR-006-03]` Bootstrap lifecycle wiring
  - **File**: `services/core-api/src/bootstrap.ts` (Modify)
  - **Type**: backend — integration
  - **Description**: Start/stop notification consumer (2.6), email queue worker (2.8), kafka metrics poller (6.6) — reverse order on teardown, mirroring the documented start/stop pattern in bootstrap.ts.
  - **Note (re-review tracking)**: the bootstrap wiring (`startNotificationConsumer` / `startEmailQueueWorker`) must land **in the same PR as the emit route (3.3)** so the consumer and worker are exercisable end-to-end once the emit endpoint ships. Tracked here, not blocking Phase 2.
  - **Spec Reference**: plan §6.1, §7.8
  - **Dependencies**: 2.6, 2.8
  - **Estimated**: S

- [x] **3.10** `[M]` `[FR-006-01]` `[P]` Unit tests — connection manager
  - **File**: `services/core-api/src/modules/notification/__tests__/connection-manager.test.ts` (Create)
  - **Type**: test — unit
  - **Description**: Cap-5 eviction (oldest closed), heartbeat interval, cleanup on close/abort, tenant isolation (no cross-tenant publish).
  - **Spec Reference**: plan §10.3
  - **Dependencies**: 2.1
  - **Estimated**: M

- [x] **3.11** `[M]` `[FR-006-02]` `[FR-006-04]` `[P]` Unit tests — notification service
  - **File**: `services/core-api/src/modules/notification/__tests__/notification.service.test.ts` (Create)
  - **Type**: test — unit
  - **Description**: Channel decisions (in-app/email/both from prefs), legacy flat-boolean prefs normalization.
  - **Spec Reference**: plan §10.3
  - **Dependencies**: 2.5
  - **Estimated**: M

- [x] **3.12** `[S]` `[FR-006-05]` `[P]` Unit tests — emit rate limiter
  - **File**: `services/core-api/src/modules/notification/__tests__/emit-rate-limit.test.ts` (Create)
  - **Type**: test — unit
  - **Description**: 10/min boundary (10th ok, 11th 429), TTL reset per window.
  - **Spec Reference**: plan §10.3
  - **Dependencies**: 2.9
  - **Estimated**: S

- [x] **3.13** `[L]` `[FR-006-01]` `[FR-006-02]` `[FR-006-04]` `[NFR-006-1]` `[NFR-006-6]` Integration tests — routes + consumer
  - **File**: `services/core-api/src/modules/notification/__tests__/notification.routes.int.test.ts` (Create), `services/core-api/src/modules/notification/__tests__/notification.consumer.int.test.ts` (Create)
  - **Type**: test — integration (real stack: Keycloak RS256, PG, Redis, Kafka)
  - **Description**: Routes: stream connect < 1 s, 401, tenant isolation, list, mark read, prefs < 300 ms. Consumer: invite → row + SSE < 2 s; plugin emission; **cap breach (F5)** — new event over cap → `notifications` row persisted, delivery suppressed, counter incremented (dedupe-first order: cap check after insert, only for new rows); **redelivery dedupe (F6)** — same event published twice → single row, second delivery skipped with no quota consumption; DLQ path.
  - **Spec Reference**: plan §10.2, §10.4
  - **Dependencies**: 3.1, 3.2, 2.6
  - **Estimated**: L

- [x] **3.14** `[L]` `[FR-006-03]` Integration tests — email queue + GDPR purge
  - **File**: `services/core-api/src/modules/notification/__tests__/email-queue.service.test.ts` (Create), `services/core-api/src/__tests__/admin/email-queue-purge.int.test.ts` (Create)
  - **Type**: test — integration (real SMTP/Mailpit)
  - **Description**: Email queue: 1 send + 3 retries (4 attempts) with backoff, dead-letter after attempts, claim idempotency. **F8**: tenant deletion saga with pending `core.email_queue` rows succeeds and purges them.
  - **Spec Reference**: plan §10.2
  - **Dependencies**: 2.8, 2.12
  - **Estimated**: L

- [x] **3.15** `[L]` `[FR-006-01]` `[NFR-006-2]` E2E — `notification-sse.spec.ts`
  - **File**: `apps/web/e2e/notification-sse.spec.ts` (Create), `apps/web/e2e/helpers/sse-asserts.ts` (Create)
  - **Type**: test — E2E (Rule 1)
  - **Description**: Invite an existing tenant user → SSE event delivered to UI < 2 s. Spec + helper split to honor Rule 4 (≤ 180 lines per file).
  - **Spec Reference**: spec 006-01; plan §7.7, §10.1
  - **Dependencies**: 3.6, 3.4
  - **Estimated**: L

- [x] **3.16** `[M]` `[FR-006-02]` `[P]` E2E — `notification-center.spec.ts`
  - **File**: `apps/web/e2e/notification-center.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: Open center, unread badge count, mark read, read-all.
  - **Spec Reference**: spec 006-02; plan §7.7
  - **Dependencies**: 3.6
  - **Estimated**: M

- [x] **3.17** `[M]` `[FR-006-03]` `[P]` E2E — `notification-email.spec.ts`
  - **File**: `apps/web/e2e/notification-email.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: Invite → email arrives in Mailpit (API poll); retry + dead-letter path.
  - **Spec Reference**: spec 006-03; plan §7.7, §10.1
  - **Dependencies**: 2.10, 2.8, 3.4
  - **Estimated**: M

- [x] **3.18** `[M]` `[FR-006-04]` `[NFR-006-6]` `[P]` E2E — `notification-prefs.spec.ts`
  - **File**: `apps/web/e2e/notification-prefs.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: Toggle channels; invite with email off → no email; prefs save < 300 ms (API timing).
  - **Spec Reference**: spec 006-04; plan §7.7, §10.1
  - **Dependencies**: 3.7
  - **Estimated**: M

- [x] **3.19** `[M]` `[FR-006-05]` `[P]` E2E — `plugin-notification.spec.ts`
  - **File**: `apps/web/e2e/plugin-notification.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: CRM plugin emits on new contact → notification row + SSE delivery in UI.
  - **Spec Reference**: spec 006-05; plan §7.7
  - **Dependencies**: 3.3, 3.6
  - **Estimated**: M

---

## Phase 4: Internationalization (006-06 → 006-10)

> Plan §9 Phase 2. Core react-intl is already partially in place
> (`apps/web/src/i18n/`). Ordered: catalogs → switch/formatting → plugin →
> tenant overrides → tests.

- [x] **4.1** `[L]` `[FR-006-06]` Italian catalog + locales registry + lint + key-parity test
  - **File**: `apps/web/src/i18n/messages.it.ts` (Create), `apps/web/src/i18n/messages.it.auth-nav.ts` (Create), `apps/web/src/i18n/messages.it.workspace-users.ts` (Create), `apps/web/src/i18n/messages.it.settings-common.ts` (Create), `apps/web/src/i18n/messages.it.plugins.ts` (Create), `apps/web/src/i18n/locales.ts` (Create), `eslint.config.js` (Modify — `formatjs/no-hardcoded-string` for apps/web), `apps/web/src/i18n/__tests__/i18n-keys.test.ts` (Create)
  - **Type**: frontend — i18n
  - **Description**: Italian catalog **domain-split** (`messages.it.*` — Rule 4); `locales.ts` exports `{ en, it }` + key-parity type; `formatjs/no-hardcoded-string` lint rule (CI flags missing keys — spec risk mitigation); key-parity Vitest test between `en`/`it`/plugin bundles. EN default fallback (`defaultMessage`).
  - **Spec Reference**: spec 006-06; plan §6.5, §7.4, §10.3
  - **Dependencies**: 1.5
  - **Estimated**: L

- [x] **4.2** `[M]` `[FR-006-07]` `[NFR-006-3]` Language switch — store + IntlProvider + switcher
  - **File**: `apps/web/src/stores/auth-store.ts` (Modify — `locale`, persisted), `apps/web/src/main.tsx` (Modify — locale-driven `IntlProvider`), `apps/web/src/hooks/use-locale.ts` (Create — `PATCH /profile` + store sync), `apps/web/src/components/i18n/language-switcher.tsx` (Create — Radix DropdownMenu)
  - **Type**: frontend — i18n
  - **Description**: Zustand auth store holds `locale` (Rule 3 — one store); `IntlProvider` re-renders in place from store — full UI update < 500 ms, **no page reload**. Profile `language` remains the source of truth (synced via `PATCH /profile`).
  - **Spec Reference**: spec 006-07; plan §6.5, §3.2 D-7
  - **Dependencies**: 4.1
  - **Estimated**: M

- [x] **4.3** `[M]` `[FR-006-08]` Locale-aware formatting
  - **File**: `apps/web/src/lib/format.ts` (Create), affected components (Modify)
  - **Type**: frontend — formatting
  - **Description**: `FormattedDate` / `FormattedNumber`, currency via `Intl.NumberFormat` with `userProfile.timezone`; replace hardcoded date/number/currency renderings.
  - **Spec Reference**: spec 006-08; plan §6.5
  - **Dependencies**: 4.2
  - **Estimated**: M

- [x] **4.4** `[M]` `[FR-006-09]` Plugin i18n bundles
  - **File**: `apps/web/src/mf-host/plugin-loader.tsx` (Modify), plugin manifest schema (Modify — `i18n.bundles`)
  - **Type**: frontend — plugin integration
  - **Description**: Read manifest `i18n.bundles`, fetch `i18n/{locale}.json` from the MF remote asset base, merge under `plugin.{slug}.` namespace prefix into the active message set (D-8 — avoids key collisions). Validate bundles (JSON schema + size cap — plugin poisoning risk).
  - **Spec Reference**: spec 006-09; plan §6.5, §3.2 D-8, §14
  - **Dependencies**: 4.1
  - **Estimated**: M

- [x] **4.5** `[M]` `[FR-006-10]` Translation overrides — backend
  - **File**: `services/core-api/src/modules/tenant-settings/` routes + repository (Create/Modify), schema (Modify)
  - **Type**: backend — endpoints
  - **Description**: `GET /api/v1/tenant/translations` (any tenant user — all overrides); `PUT /api/v1/tenant/translations/:key` (`tenant_admin` guard reusing the settings module guard; body `{ locale, value }`; empty `value` **deletes** the row → revert). Backed by `translation_overrides` table (migration in 1.3).
  - **Spec Reference**: spec 006-10; plan §5.5
  - **Dependencies**: 1.3
  - **Estimated**: M

- [x] **4.6** `[M]` `[FR-006-10]` Translation overrides — frontend + shell merge
  - **File**: `apps/web/src/services/translations-api.ts` (Create), `apps/web/src/hooks/use-translations.ts` (Create), translations admin page (Create), `apps/web/src/router-shell-routes.tsx` (Modify), shell boot merge (Modify)
  - **Type**: frontend — UI
  - **Description**: Overrides fetched on shell boot (TanStack Query staleTime 10 min); merged **last** — precedence overrides > plugin > core. Admin settings UI: list + edit + revert.
  - **Spec Reference**: spec 006-10; plan §6.5
  - **Dependencies**: 4.5
  - **Estimated**: M

- [x] **4.7** `[L]` `[FR-006-07]` `[FR-006-08]` `[NFR-006-3]` `[P]` E2E — `i18n-language-switch.spec.ts`
  - **File**: `apps/web/e2e/i18n-language-switch.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: Switch EN→IT: full UI updates, no page reload, < 500 ms (measured); locale-aware date format changes.
  - **Spec Reference**: spec 006-07/08; plan §7.7, §10.1
  - **Dependencies**: 4.2, 4.3
  - **Estimated**: L

- [x] **4.8** `[M]` `[FR-006-09]` `[P]` E2E — `plugin-translations.spec.ts`
  - **File**: `apps/web/e2e/plugin-translations.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: CRM plugin EN/IT strings render through the same react-intl pipeline (SDK-registered bundles).
  - **Spec Reference**: spec 006-09; plan §7.7
  - **Dependencies**: 4.4
  - **Estimated**: M

- [x] **4.9** `[M]` `[FR-006-10]` `[P]` E2E — `tenant-translation-overrides.spec.ts`
  - **File**: `apps/web/e2e/tenant-translation-overrides.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: Tenant admin overrides a key → regular user sees the override; revert restores default.
  - **Spec Reference**: spec 006-10; plan §7.7
  - **Dependencies**: 4.6
  - **Estimated**: M

---

## Phase 5: User Profile (006-11 → 006-14)

> Plan §9 Phase 3. Extends the existing `modules/user-profile/` module.
> Ordered: Keycloak helpers → service/routes → frontend → tests.

- [ ] **5.1** `[M]` `[FR-006-13]` `[P]` Keycloak Admin helpers
  - **File**: `services/core-api/src/lib/keycloak-admin-users.ts` (Modify)
  - **Type**: backend — Keycloak integration
  - **Description**: `listUserSessions(realm, userId)`, `deleteUserSession(realm, sessionId)`, `syncEmail(realm, userId, email)` via the Keycloak Admin API. (`terminateUserSessions` already exists — do not duplicate.)
  - **Spec Reference**: spec 006-13; plan §6.4, §7.8
  - **Dependencies**: none
  - **Estimated**: M

- [ ] **5.2** `[M]` `[FR-006-11]` `[FR-006-12]` `[FR-006-14]` Profile service extensions
  - **File**: `services/core-api/src/modules/user-profile/service.ts` (Modify), `services/core-api/src/modules/user-profile/repository.ts` (Modify — `updateEmail`), `services/core-api/src/modules/user-profile/schema.ts` (Modify — optional `email`)
  - **Type**: backend — service
  - **Description**: `getProfile` merges the Keycloak JWT `picture` claim → `avatarUrl` + `avatarSource: "keycloak"|"upload"` (picture wins — 006-12); adds `keycloakAccountUrl` from `KEYCLOAK_ACCOUNT_URL_PATTERN` (006-14); `updateProfile` accepts optional `email` → `syncEmail` to Keycloak **first**, and `user_profile.email` local write **only after Keycloak returns success** — a rejected/failed Keycloak sync must NOT update the local email (no divergence); error surfaced on failure.
  - **Spec Reference**: spec 006-11/12/14; plan §5.4, §6.4
  - **Dependencies**: 5.1, 1.6
  - **Estimated**: M

- [ ] **5.3** `[M]` `[FR-006-13]` Session routes — ownership-first (F4)
  - **File**: `services/core-api/src/modules/user-profile/routes.ts` (Modify)
  - **Type**: backend — endpoints
  - **Description**: `GET /api/v1/profile/sessions` (Keycloak `listUserSessions`); `DELETE /api/v1/profile/sessions/:sessionId` — **ownership check FIRST**: fetch caller's sessions, `sessionId ∉ caller.sessions` → **404 `NOT_FOUND`** (not found **or** not owned — no enumeration, mirrors notification `:id/read`), only then call Keycloak `DELETE /admin/realms/{realm}/sessions/{sessionId}`. Self-termination allowed (forces re-login) → `200 { revoked: true }`. 503 on Keycloak unreachable.
  - **Spec Reference**: spec 006-13; plan §5.4, §6.4
  - **Dependencies**: 5.1, 5.2
  - **Estimated**: M

- [ ] **5.4** `[M]` `[FR-006-11]` `[FR-006-12]` `[FR-006-13]` `[FR-006-14]` Frontend profile extensions
  - **File**: `apps/web/src/pages/profile-page.tsx` (Modify — email field, sessions card, password card), `apps/web/src/components/profile/sessions-card.tsx` (Create), `apps/web/src/components/profile/password-card.tsx` (Create), `apps/web/src/components/profile/avatar-header.tsx` (Create), `apps/web/src/hooks/use-sessions.ts` (Create), `apps/web/src/services/profile-api.ts` (Modify — sessions + account URL), `apps/web/src/types/profile.ts` (Modify — `avatarSource`, `keycloakAccountUrl`, new prefs shape), `apps/web/src/components/layout/header.tsx` (Modify — picture avatar + switcher slots), `apps/web/src/i18n/messages.en.profile.ts` / `messages.it.profile.ts` (Create)
  - **Type**: frontend — UI
  - **Description**: Sessions list + revoke buttons (TanStack Query); password change button → `keycloakAccountUrl` (006-14); avatar prefers `avatarSource: 'keycloak'`.
  - **Spec Reference**: spec 006-11/12/13/14; plan §6.5
  - **Dependencies**: 5.2, 5.3, 4.1
  - **Estimated**: M

- [ ] **5.5** `[M]` `[FR-006-13]` Unit tests — Keycloak admin helpers
  - **File**: `services/core-api/src/__tests__/unit/keycloak-admin-users.test.ts` (Create — actual location; vitest discovers only `src/__tests__/**`, not `src/lib/__tests__/`)
  - **Type**: test — unit (mocked Keycloak Admin HTTP)
  - **Description**: `listUserSessions` / `deleteUserSession` / `syncEmail` helper contracts — URL building, error mapping.
  - **Spec Reference**: plan §10.3
  - **Dependencies**: 5.1
  - **Estimated**: M

- [ ] **5.6** `[L]` `[FR-006-13]` Integration test — profile sessions
  - **File**: `services/core-api/src/__tests__/user-profile/profile-sessions.int.test.ts` (Create — actual location; vitest discovers only `src/__tests__/**`, not `modules/user-profile/__tests__/`)
  - **Type**: test — integration (real Keycloak)
  - **Description**: Sessions list/revoke against real Keycloak; **DELETE another user's sessionId → 404** (F4 ownership).
  - **Spec Reference**: plan §10.2
  - **Dependencies**: 5.3
  - **Estimated**: L

- [ ] **5.7** `[M]` `[FR-006-13]` `[FR-006-14]` `[P]` E2E — `profile-sessions.spec.ts`
  - **File**: `apps/web/e2e/profile-sessions.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: Sessions listed/revoked; revoke → forced re-login; password link → Keycloak account console.
  - **Spec Reference**: spec 006-13/14; plan §7.7
  - **Dependencies**: 5.4
  - **Estimated**: M

- [ ] **5.8** `[M]` `[FR-006-12]` `[P]` Extend `user-profile.spec.ts` — avatar source
  - **File**: `apps/web/e2e/user-profile.spec.ts` (Modify)
  - **Type**: test — E2E
  - **Description**: Avatar displayed from Keycloak `picture` claim (`avatarSource: 'keycloak'`) in header and profile.
  - **Spec Reference**: spec 006-12; plan §7.8
  - **Dependencies**: 5.4
  - **Estimated**: M

---

## Phase 6: Observability (006-15 → 006-20)

> Plan §9 Phase 4. 006-19 is deferred to Sprint 7 (stub only, task 6.8).
> Ordered: request-context → health → metrics → infra → tests.

- [ ] **6.1** `[M]` `[FR-006-16]` `[P]` Request-context + `ctxLogger()`
  - **File**: `services/core-api/src/lib/request-context.ts` (Create)
  - **Type**: backend — logging
  - **Description**: AsyncLocalStorage `RequestContext { requestId, correlationId, tenantId, userId }`; `ctxLogger()` returns `logger.child({ requestId, correlationId, tenantId, userId })` — Pino async transport keeps overhead < 5 ms. UUIDs + tenant slug only, no PII (Security §6).
  - **Spec Reference**: spec 006-16; plan §6.3
  - **Dependencies**: none
  - **Estimated**: M

- [ ] **6.2** `[S]` `[FR-006-16]` Bind context in middlewares + root onRequest
  - **File**: `services/core-api/src/middleware/auth-middleware.ts` (Modify — bind `userId`), `services/core-api/src/middleware/tenant-context.ts` (Modify — bind `tenantId`), root app setup (Modify — onRequest seeds `requestId` via Fastify `genReqId` + `correlationId` from `X-Correlation-Id` or generated UUIDv4)
  - **Type**: backend — middleware
  - **Description**: 2-line additions to both middlewares; root `onRequest` hook seeds request/correlation IDs (006-16).
  - **Spec Reference**: spec 006-16; plan §6.3, §7.8
  - **Dependencies**: 6.1
  - **Estimated**: S

- [ ] **6.3** `[M]` `[FR-006-15]` `[P]` Health probe orchestrator
  - **File**: `services/core-api/src/modules/observability/health-check.ts` (Create)
  - **Type**: backend — observability
  - **Description**: Parallel probes with **150 ms timeouts**: PostgreSQL (`SELECT 1`), Redis (`PING`), Keycloak (realm `.well-known/openid-configuration`), Kafka/Redpanda (producer `metadata`); Redis-backed memoization (5 s). **Reuses** Spec 005 admin probe services — no duplication. Status: `ok` / `degraded` / `down`.
  - **Spec Reference**: spec 006-15; plan §6.2, §5.6
  - **Dependencies**: none (admin probes exist from Spec 005)
  - **Estimated**: M

- [ ] **6.4** `[M]` `[FR-006-15]` `[NFR-006-4]` Health routes — supersede basic health (F7)
  - **File**: `services/core-api/src/modules/observability/health.routes.ts` (Create), `services/core-api/src/modules/observability/index.ts` (Create), `services/core-api/src/index.ts` (Modify — replace `basicHealthRoutes` registration with `observabilityRoutes`), `services/core-api/src/modules/health/basic-health-routes.ts` (Delete — superseded)
  - **Type**: backend — endpoint + route ownership
  - **Description**: Deep probe serves **both** `GET /health` **and** `GET /api/v1/health` (the twin the CI runtime contract probes) with the same **additive** payload `{ status, version, checks: [{name,status,latencyMs}] }` — `status`/`version` kept (contract). HTTP 200 for ok/degraded, 503 for down. Registered on the root instance (opt-in public, exempt from rate limit). No PII, no connection strings.
  - **Spec Reference**: spec 006-15; plan §5.6, §6.2
  - **Dependencies**: 6.3
  - **Estimated**: M

- [ ] **6.5** `[M]` `[FR-006-17]` `[P]` Metrics registry + HTTP metrics hooks
  - **File**: `services/core-api/src/modules/observability/metrics-registry.ts` (Create — **sole** `prom-client` importer), `services/core-api/src/modules/observability/http-metrics.ts` (Create — onRequest/onResponse hooks)
  - **Type**: backend — metrics
  - **Description**: Typed registry with bounded label cardinality: `http_request_duration_seconds` histogram (method, route, status) + `http_requests_total` counter + default process metrics (30 s). Hook wiring on the Fastify instance.
  - **Spec Reference**: spec 006-17; plan §6.2
  - **Dependencies**: 1.4
  - **Estimated**: M

- [ ] **6.6** `[M]` `[FR-006-17]` `[FR-006-20]` Metrics route + Kafka metrics poller
  - **File**: `services/core-api/src/modules/observability/metrics.routes.ts` (Create — `GET /metrics`), `services/core-api/src/modules/observability/kafka-metrics.ts` (Create — 30 s poller)
  - **Type**: backend — metrics
  - **Description**: `kafka-metrics.ts` wraps the existing lag service + `getOutboxMetrics` and refreshes gauges on a **30 s interval** (scrape only serializes — NFR < 100 ms): `kafka_consumer_lag`, `kafka_dlq_size`, `outbox_pending_events`, `sse_active_connections` (from 2.1 `getGauge`), `notifications_emitted_total`, `notifications_rate_limited_total`, `email_queue_depth`, `email_queue_dead_total`. `/metrics` optional `METRICS_TOKEN` auth guard; open by default.
  - **Spec Reference**: spec 006-17/20; plan §5.6, §6.2
  - **Dependencies**: 6.5, 2.1, 2.7
  - **Estimated**: M

- [ ] **6.7** `[M]` `[FR-006-18]` `[FR-006-20]` Infra — Prometheus service + Grafana dashboards
  - **File**: `infra/compose/docker-compose.observability.yml` (Modify — add `prometheus` service), `infra/prometheus/prometheus.yml` (Create — scrape core-api `:3001/metrics`), `infra/grafana/dashboards/plexica-overview.json` (Create — 006-18), `infra/grafana/dashboards/kafka-monitoring.json` (Create — 006-20), `infra/grafana/provisioning/dashboards.yml` (Create — provider reads mounted `dashboards/`)
  - **Type**: infra
  - **Description**: Prometheus service added to compose (Grafana datasource `prometheus.yml` already provisioned in Spec 005); base dashboard (HTTP latency, error rate, outbox, SSE conns) + Kafka dashboard (per-plugin lag, DLQ size, throughput).
  - **Spec Reference**: spec 006-18/20; plan §7.6, §5.6
  - **Dependencies**: 6.6
  - **Estimated**: M

- [ ] **6.8** `[S]` `[FR-006-19]` OTel config stub (deferred to Sprint 7)
  - **File**: `services/core-api/src/lib/config.ts` (Modify — read `OTEL_TRACING_ENABLED`, default false)
  - **Type**: backend — config stub
  - **Description**: Feature-flagged no-op stub only — **no** `@opentelemetry/*` dependencies now. Full tracing lands in Sprint 7 (plan D-13).
  - **Spec Reference**: spec 006-19; plan §3.2 D-13, §9 P4 task 5
  - **Dependencies**: 1.6
  - **Estimated**: S

- [ ] **6.9** `[M]` `[FR-006-15]` CI runtime contract update — **same PR as 6.4**
  - **File**: `apps/web/e2e/ci-runtime-contract.spec.ts` (Modify), `apps/web/e2e/helpers/ci-runtime-contract-flow.ts` (Modify)
  - **Type**: test — E2E contract (Rule 2)
  - **Description**: Replace the exact `toEqual` at `ci-runtime-contract-flow.ts:105` with `toMatchObject({ status: 200, body: { status: expect.stringMatching(/ok|degraded/), version: '2.0.0' } })` + structural check `body.checks` is an array of length **≥ 4**. Must land in the **same PR** as 6.4 (§5.6 BREAKING CONTRACT NOTE — deterministic tests, Rule 6).
  - **Spec Reference**: spec 006-15; plan §5.6, §9 P4 task 2
  - **Dependencies**: 6.4
  - **Estimated**: M

- [ ] **6.10** `[M]` `[FR-006-16]` `[FR-006-17]` `[NFR-006-7]` Unit tests — request context + metrics registry
  - **File**: `services/core-api/src/__tests__/request-context.test.ts` (Create), `services/core-api/src/modules/observability/__tests__/metrics-registry.test.ts` (Create)
  - **Type**: test — unit
  - **Description**: Request-context: binding, correlation propagation, no-PII, `ctxLogger()` write overhead < 5 ms (benchmark). Metrics registry: label cardinality bounds (bounded route set).
  - **Spec Reference**: plan §10.3, §10.4
  - **Dependencies**: 6.1, 6.5
  - **Estimated**: M

- [ ] **6.11** `[L]` `[FR-006-15]` `[FR-006-17]` `[NFR-006-4]` `[NFR-006-5]` Integration tests — health + metrics routes
  - **File**: `services/core-api/src/modules/observability/__tests__/health.routes.int.test.ts` (Create), `services/core-api/src/modules/observability/__tests__/metrics.routes.int.test.ts` (Create)
  - **Type**: test — integration (real stack)
  - **Description**: Health: 4 probes ok, degraded matrix (one dep down → `degraded`), wall time < 200 ms. Metrics: scrape < 100 ms, histogram labels + gauge values present.
  - **Spec Reference**: plan §10.2, §10.4
  - **Dependencies**: 6.4, 6.6
  - **Estimated**: L

- [ ] **6.12** `[L]` `[FR-006-15]` `[FR-006-16]` E2E — `health-check.spec.ts` (+ 006-16 log assertions)
  - **File**: `apps/web/e2e/health-check.spec.ts` (Create), `apps/web/e2e/helpers/core-api-logs.ts` (Create)
  - **Type**: test — E2E
  - **Description**: `/health` returns all 4 dependencies + payload shape, < 200 ms. **006-16**: after login + authenticated API call, assert Pino JSON records carry `requestId`/`tenantId`/`userId` — helper runs `docker logs core-api` via `execSync`, bounded poll (≤ 5 s, 250 ms interval) because the Pino transport is async.
  - **Spec Reference**: spec 006-15/16; plan §7.7, §10.1
  - **Dependencies**: 6.4, 6.2
  - **Estimated**: L

- [ ] **6.13** `[M]` `[FR-006-17]` `[FR-006-18]` `[FR-006-20]` E2E — `observability-metrics.spec.ts`
  - **File**: `apps/web/e2e/observability-metrics.spec.ts` (Create)
  - **Type**: test — E2E
  - **Description**: `/metrics` content-type + key series present; Grafana datasources reachable (Prometheus).
  - **Spec Reference**: spec 006-17/18/20; plan §7.7
  - **Dependencies**: 6.6, 6.7
  - **Estimated**: M

---

## Phase 7: Integration & Polish

> Final verification across all four capability groups.

- [ ] **7.1** `[M]` `[ALL]` Full test suite + green CI
  - **Command**: `pnpm test` (unit) + integration + `pnpm e2e` (Playwright) per workspace
  - **Expected**: All suites pass — no mocks of core services, no skip flags (Rule 2).
  - **Dependencies**: all previous phases
  - **Estimated**: M

- [ ] **7.2** `[ALL]` Run `/forge-review` adversarial review
  - **Command**: `/forge-review .forge/specs/006-cross-cutting-features/`
  - **Expected**: Address all HIGH severity findings across the 7 dimensions (incl. test-spec coherence, UX).
  - **Dependencies**: 7.1
  - **Estimated**: M

- [ ] **7.3** `[S]` Documentation + `.env.example` final review
  - **Description**: Verify `.env.example` matches `config.ts` additions (1.6); confirm ADR-034 vocabulary (only `STORAGE_*`/`storage_*` names in new code); update architecture docs where user-facing behavior changed.
  - **Dependencies**: all previous phases
  - **Estimated**: S

---

## Summary

| Metric                       | Value |
| ---------------------------- | ----- |
| Total tasks                  | 73    |
| Completed                    | 49/73 — Phases 1-4 (notifications 006-01..006-05 + i18n 006-06..006-09) |
| Total phases                 | 7     |
| Parallelizable tasks         | 28    |
| Requirements covered         | 19/20 FRs (006-19 stubbed, Sprint 7) + 7/7 NFRs |
| Estimated total effort       | ~95–115 h (≈ 12–14 dev-days) |

### By phase

| Phase | Tasks | Parallel | Effort (midpoint) | Status |
| ----- | ----- | -------- | ----------------- | ------ |
| 1 — Foundation | 9  | 5 | ~8 h | Done (PR #178, 2026-09-17) |
| 2 — Notifications core | 12 | 7 | ~14 h | Done (PR #180, 2026-09-21) |
| 3 — Notifications interface/UI/tests | 19 | 7 | ~26 h | Done (PR #195, 2026-09-22) |
| 4 — Internationalization | 9  | 3 | ~15 h | Done (PR #196, 2026-09-23) |
| 5 — User Profile | 8  | 3 | ~12 h | Pending |
| 6 — Observability | 13 | 3 | ~18 h | Pending |
| 7 — Integration & Polish | 3  | 0 | ~3 h | Pending |

### By size

| Size | Count |
| ---- | ----- |
| S    | 13 |
| M    | 50 |
| L    | 9  |
| XL   | 0  |
| ALL (meta, 7.2) | 1 |

---

## Cross-References

| Document | Path |
| -------- | ---- |
| Spec     | `.forge/specs/006-cross-cutting-features/spec.md` |
| Plan     | `.forge/specs/006-cross-cutting-features/plan.md` |
| Architecture | `.forge/architecture/architecture.md` |
| Sprint   | `.forge/sprints/active/sprint-006.yaml` |
| Epic     | `.forge/epics/epic-06-cross-cutting/epic.md` |
| Story E06-S001 | `.forge/epics/epic-06-cross-cutting/story-E06-S001-sse-notification-infrastructure.md` |
| Constitution | `.forge/constitution.md` |
| ADRs     | `.forge/knowledge/adr/` (ADR-035, ADR-036 Accepted) |
