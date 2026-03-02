# Tasks: 007 - Core Services

> Ordered task breakdown with parallelism markers and requirement traceability.
> Created by the `forge-scrum` agent via `/forge-tasks`.
> Updated to incorporate UX design-spec (design-spec.md, 2026-02-28).

| Field        | Value                                                  |
| ------------ | ------------------------------------------------------ |
| Status       | Complete (48/48 complete)                              |
| Author       | forge-scrum                                            |
| Date         | 2026-03-02                                             |
| Spec         | [007-core-services/spec.md](./spec.md)                 |
| Design Spec  | [007-core-services/design-spec.md](./design-spec.md)   |
| User Journey | [007-core-services/user-journey.md](./user-journey.md) |
| Total Tasks  | 48                                                     |
| Total Points | ~87                                                    |

---

## Legend

- `[ ]` / `[x]` — pending / complete
- `[S]` < 30 min · `[M]` 30 min–2 h · `[L]` 2–4 h · `[XL]` 4+ h (split if encountered)
- `[P]` — parallelisable with other `[P]` tasks in the same phase
- `[FR-NNN]` / `[NFR-NNN]` — requirement traceability to spec.md §4–5
- `[UX]` — task derived from design-spec.md or user-journey.md

> **Note on plan.md**: Spec 007 does not yet have a plan.md. Tasks are derived
> directly from spec.md §4–9 and design-spec.md §2–5. Run `/forge-plan` if a
> full architecture plan is needed before implementation begins.

---

## Task Index

| Task ID | Title                                                         | Phase | Pts | Status  |
| ------- | ------------------------------------------------------------- | ----- | --- | ------- |
| T007-01 | Define shared type interfaces (Storage, Notif, Job, Search)   | Ph 1  | 3   | ✅ done |
| T007-02 | Database migration: `jobs` table                              | Ph 1  | 2   | ✅ done |
| T007-03 | Database migration: `notifications` table                     | Ph 1  | 2   | ✅ done |
| T007-04 | Database migration: `search_documents` table                  | Ph 1  | 2   | ✅ done |
| T007-05 | Add new design tokens to design system                        | Ph 1  | 1   | ✅ done |
| T007-06 | Implement StorageService (MinIO adapter)                      | Ph 2  | 5   | ✅ done |
| T007-07 | Implement NotificationService (email + inApp)                 | Ph 2  | 5   | ✅ done |
| T007-08 | Implement JobQueueService (Redis Bull / enqueue/schedule)     | Ph 2  | 5   | ✅ done |
| T007-09 | Implement SearchService (PostgreSQL FTS)                      | Ph 2  | 5   | ✅ done |
| T007-10 | Implement notification template engine                        | Ph 2  | 2   | ✅ done |
| T007-11 | Implement job worker process (with concurrency)               | Ph 2  | 3   | ✅ done |
| T007-12 | Implement tenant bucket provisioning hook                     | Ph 2  | 2   | ✅ done |
| T007-13 | Storage REST endpoints (upload/download/delete/list/sign-url) | Ph 3  | 3   | ✅ done |
| T007-14 | Notification REST endpoints (send/bulk)                       | Ph 3  | 2   | ✅ done |
| T007-15 | Job Queue REST endpoints (enqueue/schedule/cancel/status)     | Ph 3  | 3   | ✅ done |
| T007-16 | Search REST endpoints (index/search/delete/reindex)           | Ph 3  | 3   | ✅ done |
| T007-17 | SSE endpoint: `GET /api/v1/notifications/stream`              | Ph 3  | 3   | ✅ done |
| T007-18 | Register all routes in Fastify app                            | Ph 4  | 1   | ✅ done |
| T007-19 | Wire StorageService into Fastify DI container                 | Ph 4  | 1   | ✅ done |
| T007-20 | Wire NotificationService into Fastify DI container            | Ph 4  | 1   | ✅ done |
| T007-21 | Wire JobQueueService into Fastify DI container                | Ph 4  | 1   | ✅ done |
| T007-22 | Wire SearchService into Fastify DI container                  | Ph 4  | 1   | ✅ done |
| T007-23 | Extend `/health` endpoint with service dependency checks      | Ph 4  | 1   | ✅ done |
| T007-24 | UX: Build `SearchOverlay` component                           | Ph 5  | 5   | ✅ done |
| T007-25 | UX: Build `NotificationBell` component                        | Ph 5  | 5   | ✅ done |
| T007-26 | UX: Build `FileUploadZone` component                          | Ph 5  | 5   | ✅ done |
| T007-27 | UX: Build `FileListItem` component                            | Ph 5  | 2   | ✅ done |
| T007-28 | UX: Build `JobDetailPanel` component                          | Ph 5  | 3   | ✅ done |
| T007-29 | UX: Build `JobStatusBadge` component (extends StatusBadge)    | Ph 5  | 2   | ✅ done |
| T007-30 | UX: Build Job Status Dashboard page                           | Ph 5  | 5   | ✅ done |
| T007-31 | UX: Integrate SearchOverlay into shell Header                 | Ph 6  | 2   | ✅ done |
| T007-32 | UX: Integrate NotificationBell into shell Header              | Ph 6  | 2   | ✅ done |
| T007-33 | UX: Add Jobs page to admin sidebar navigation                 | Ph 6  | 1   | ✅ done |
| T007-34 | UX: SSE client hook `useNotificationStream`                   | Ph 6  | 2   | ✅ done |
| T007-35 | UX: SSE client hook `useJobStatusStream`                      | Ph 6  | 2   | ✅ done |
| T007-36 | Unit tests: StorageService                                    | Ph 7  | 3   | ✅ done |
| T007-37 | Unit tests: NotificationService                               | Ph 7  | 3   | ✅ done |
| T007-38 | Unit tests: JobQueueService                                   | Ph 7  | 3   | ✅ done |
| T007-39 | Unit tests: SearchService                                     | Ph 7  | 3   | ✅ done |
| T007-40 | Integration tests: Storage API endpoints                      | Ph 7  | 3   | ✅ done |
| T007-41 | Integration tests: Notification API endpoints                 | Ph 7  | 2   | ✅ done |
| T007-42 | Integration tests: Job Queue API endpoints                    | Ph 7  | 3   | ✅ done |
| T007-43 | Integration tests: Search API endpoints                       | Ph 7  | 2   | ✅ done |
| T007-44 | Component tests: SearchOverlay + NotificationBell             | Ph 7  | 3   | ✅ done |
| T007-45 | Component tests: FileUploadZone + FileListItem                | Ph 7  | 2   | ✅ done |
| T007-46 | Component tests: Job Dashboard + JobDetailPanel               | Ph 7  | 2   | ✅ done |
| T007-47 | E2E tests: upload file, search, notification flow             | Ph 7  | 3   | ✅ done |
| T007-48 | Polish: OpenAPI docs, error messages, logging                 | Ph 8  | 3   | ✅ done |

---

## Phase Summary

| Phase     | Name                        | Tasks             | Points |
| --------- | --------------------------- | ----------------- | ------ |
| Phase 1   | Foundation & Shared Types   | T007-01 – T007-05 | 10     |
| Phase 2   | Core Service Implementation | T007-06 – T007-12 | 27     |
| Phase 3   | API / Endpoint Layer        | T007-13 – T007-17 | 14     |
| Phase 4   | Integration & DI Wiring     | T007-18 – T007-23 | 6      |
| Phase 5   | UX Components (new)         | T007-24 – T007-30 | 27     |
| Phase 6   | UX Shell Integration (new)  | T007-31 – T007-35 | 9      |
| Phase 7   | Testing                     | T007-36 – T007-47 | 32     |
| Phase 8   | Polish & Docs               | T007-48           | 3      |
| **Total** |                             |                   | **87** |

> **UX phases (5–6) are new** — added as a result of the design-spec.md and
> user-journey.md UX artifacts created 2026-02-28. These phases implement all 4
> screens, 6 new components, and SSE real-time integration specified in the
> design-spec.

---

## Phase 1: Foundation & Shared Types

**Objective**: Establish type interfaces, database schema, and design tokens
that all downstream tasks depend on. Nothing in Phase 2+ should start until
this is complete.  
**Story Points**: 10  
**Sprint Placement**: Sprint 7, Week 1

---

- [x] **T007-01** `[M]` `[FR-001]` `[FR-004]` `[FR-007]` `[FR-011]` Define shared TypeScript service interfaces
  - **File**: `apps/core-api/src/types/core-services.types.ts`
  - **Type**: Create new file
  - **Description**: Define the four canonical service interfaces from spec.md §7:
    `StorageService`, `NotificationService`, `JobQueueService`, `SearchService`.
    Also define supporting types: `FileInfo`, `UploadOptions`, `Notification`,
    `PushMessage`, `InAppMessage`, `Job`, `JobStatus`, `Indexable`, `SearchQuery`,
    `SearchResult`. Export all types from `src/types/index.ts`.
  - **Spec Reference**: spec.md §7, design-spec.md §4 (component props use these types)
  - **Dependencies**: None
  - **Estimated**: 1 h (M)

- [x] **T007-02** `[S]` `[FR-007]` `[FR-008]` `[FR-009]` `[FR-010]` `[P]` Database migration: `jobs` table
  - **File**: `packages/database/prisma/migrations/YYYYMMDD_create_jobs/migration.sql`
  - **Type**: Create new migration
  - **Description**: Add `jobs` table with columns: `id` (uuid PK), `tenant_id`
    (FK → tenants), `name` (varchar), `plugin_id` (varchar, nullable), `status`
    (`JobStatus` enum: PENDING/QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED/SCHEDULED),
    `payload` (jsonb), `result` (jsonb, nullable), `error` (text, nullable),
    `retries` (int default 0), `max_retries` (int default 3), `cron_expression`
    (varchar, nullable), `scheduled_at` (timestamptz, nullable), `started_at`
    (timestamptz, nullable), `completed_at` (timestamptz, nullable), `created_at`,
    `updated_at`. Index on `(tenant_id, status)` and `(tenant_id, name)`.
    Update Prisma schema; run `pnpm db:generate`.
  - **Spec Reference**: spec.md §4 FR-007 – FR-010, design-spec.md §3 Screen 4
  - **Dependencies**: T007-01
  - **Estimated**: 30 min (S)

- [x] **T007-03** `[S]` `[FR-004]` `[FR-005]` `[FR-006]` `[P]` Database migration: `notifications` table
  - **File**: `packages/database/prisma/migrations/YYYYMMDD_create_notifications/migration.sql`
  - **Type**: Create new migration
  - **Description**: Add `notifications` table: `id` (uuid PK), `tenant_id` (FK),
    `user_id` (varchar — Keycloak user ID), `channel` enum (`EMAIL`/`PUSH`/`IN_APP`),
    `status` enum (`PENDING`/`SENT`/`FAILED`/`READ`), `title` (varchar),
    `body` (text), `metadata` (jsonb, nullable — source resource link, plugin id),
    `read_at` (timestamptz, nullable), `created_at`, `updated_at`. Index on
    `(tenant_id, user_id, status)` for unread count queries.
    Update Prisma schema; run `pnpm db:generate`.
  - **Spec Reference**: spec.md §4 FR-004 – FR-006, design-spec.md §3 Screen 2
  - **Dependencies**: T007-01
  - **Estimated**: 30 min (S)

- [x] **T007-04** `[S]` `[FR-011]` `[FR-012]` `[FR-013]` `[FR-014]` `[P]` Database migration: `search_documents` table
  - **File**: `packages/database/prisma/migrations/YYYYMMDD_create_search_documents/migration.sql`
  - **Type**: Create new migration
  - **Description**: Add `search_documents` table for PostgreSQL FTS (MVP per
    spec.md §10 — Elasticsearch deferred): `id` (uuid PK), `tenant_id` (FK),
    `document_id` (varchar — plugin-assigned ID), `type` (varchar — e.g.
    `crm:contact`), `title` (varchar), `body` (text), `metadata` (jsonb, nullable),
    `search_vector` (tsvector — generated column from title+body),
    `created_at`, `updated_at`. GIN index on `search_vector`. Unique constraint on
    `(tenant_id, type, document_id)`. Update Prisma schema; run `pnpm db:generate`.
  - **Spec Reference**: spec.md §4 FR-011 – FR-014, spec.md §10
  - **Dependencies**: T007-01
  - **Estimated**: 30 min (S)

- [x] **T007-05** `[S]` `[UX]` Add new design tokens to design system
  - **File**: `packages/ui/src/styles/tokens.css` (or equivalent token file)
  - **Type**: Modify existing
  - **Description**: Add the 10 new CSS custom property tokens from design-spec.md
    §5 "New Tokens Introduced": `--notification-dot`, `--notification-dot-size`,
    `--notification-badge-bg`, `--notification-badge-fg`,
    `--search-overlay-width`, `--search-overlay-max-height`,
    `--upload-progress-height`, `--upload-progress-bg`, `--upload-progress-fill`,
    `--job-stat-card-min-width`. Add both light and dark mode values as specified
    in the design token table.
  - **Spec Reference**: design-spec.md §5 "New Tokens Introduced"
  - **Dependencies**: None
  - **Estimated**: 20 min (S)

---

## Phase 2: Core Service Implementation

**Objective**: Implement all four backend services with full business logic,
tenant isolation, retries, and worker processes.  
**Story Points**: 27  
**Sprint Placement**: Sprint 7, Weeks 2–3  
**Prerequisite**: All Phase 1 tasks complete.

---

- [x] **T007-06** `[L]` `[FR-001]` `[FR-002]` `[FR-003]` `[NFR-001]` `[NFR-002]` `[NFR-007]` `[P]` Implement StorageService
  - **File**: `apps/core-api/src/modules/storage/storage.service.ts`
  - **Type**: Create new file
  - **Description**: Implement `StorageService` class wrapping the MinIO client
    (`packages/lib` or direct `minio` npm package). Methods: `upload`,
    `download`, `delete`, `list`, `getSignedUrl`. **Tenant isolation**: every
    method must scope operations to bucket `tenant-{tenantId}`. Auto-provision
    bucket on first upload if it doesn't exist (call `makeBucket`). Path
    sanitization: reject paths containing `..` or absolute paths (Edge Case #8).
    File size validation: enforce `maxFileSizeMb` from tenant config (Edge Case
    #1). Retry with exponential backoff on MinIO transient errors (max 3,
    Edge Case #2). `getSignedUrl` must use `presignedGetObject` — target <10ms
    P95 (NFR-002). Export a singleton factory `createStorageService(tenantId)`.
    Also create: `apps/core-api/src/modules/storage/storage.types.ts` (re-export
    from core-services.types.ts).
  - **Spec Reference**: spec.md §4 FR-001–FR-003, §5 NFR-001–002, NFR-007, §6 Edge Cases 1–2, 8
  - **Dependencies**: T007-01
  - **Estimated**: 3–4 h (L)

- [x] **T007-07** `[L]` `[FR-004]` `[FR-005]` `[FR-006]` `[NFR-005]` `[P]` Implement NotificationService
  - **File**: `apps/core-api/src/modules/notifications/notification.service.ts`
  - **Type**: Create new file
  - **Description**: Implement `NotificationService` class. Methods: `send`,
    `sendBulk`, `email`, `push`, `inApp`. `inApp` and `email` must persist a
    record in the `notifications` table (T007-03). `email` channel: use
    Nodemailer or configured SMTP (ENV: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
    `SMTP_PASS`). Push channel: placeholder stub returning `Promise<void>` (per
    spec.md §10 — Firebase deferred). `sendBulk`: enqueue each notification as a
    job via `JobQueueService` for async delivery (FR-005). Retry: 3 attempts with
    exponential backoff; mark as `FAILED` for invalid email (Edge Case #3 — no
    retry). Template rendering (FR-006): simple `{{variable}}` substitution via
    `renderTemplate(template: string, data: object): string`. Also create:
    `apps/core-api/src/modules/notifications/notification.repository.ts` for
    DB read/write (unread count, mark-as-read, list recent).
  - **Spec Reference**: spec.md §4 FR-004–FR-006, §5 NFR-005, §6 Edge Cases 3
  - **Dependencies**: T007-01, T007-03
  - **Estimated**: 3–4 h (L)

- [x] **T007-08** `[L]` `[FR-007]` `[FR-008]` `[FR-009]` `[FR-010]` `[NFR-003]` `[NFR-006]` `[P]` Implement JobQueueService
  - **File**: `apps/core-api/src/modules/jobs/job-queue.service.ts`
  - **Type**: Create new file
  - **Description**: Implement `JobQueueService` using Redis (existing `lib/redis.ts`)
    with BullMQ (`bullmq` package). Methods: `enqueue` (returns job ID, <50ms
    P95 per NFR-003), `schedule` (cron — validate expression, reject invalid per
    Edge Case #5), `cancel`, `getStatus`. Every job payload **must include**
    `tenantId` (FR-010). At-least-once delivery via BullMQ's built-in
    acknowledgement (NFR-006). Job failure: retry with exponential backoff; status
    transitions: PENDING → QUEUED → RUNNING → COMPLETED/FAILED. Also create:
    `apps/core-api/src/modules/jobs/job.repository.ts` — persists job lifecycle
    events to the `jobs` table (T007-02) for the admin dashboard. Validate cron
    expressions using `cron-parser` or `cronstrue` package.
  - **Spec Reference**: spec.md §4 FR-007–FR-010, §5 NFR-003, NFR-006, §6 Edge Cases 4–5
  - **Dependencies**: T007-01, T007-02
  - **Estimated**: 3–4 h (L)

- [x] **T007-09** `[L]` `[FR-011]` `[FR-012]` `[FR-013]` `[FR-014]` `[NFR-004]` `[NFR-008]` `[P]` Implement SearchService
  - **File**: `apps/core-api/src/modules/search/search.service.ts`
  - **Type**: Create new file
  - **Description**: Implement `SearchService` using PostgreSQL FTS (spec.md §10
    — Elasticsearch deferred to Phase 3). Methods: `index` (upsert into
    `search_documents`, update `search_vector`), `search` (use
    `ts_rank` + `to_tsquery`, **always** scope with `WHERE tenant_id = $1`
    for FR-012 isolation), `delete`, `reindex` (enqueue background job via
    `JobQueueService`, return jobId per Edge Case #6 — spec.md §6 #6). `search`
    supports `type` filter (FR-014). `reindex` returns `202 Accepted` with job
    ID. Target <100ms P95 for ≤10K docs (NFR-004). Document IDs scoped by
    `(tenant_id, type, document_id)` to prevent collision (Edge Case #7).
  - **Spec Reference**: spec.md §4 FR-011–FR-014, §5 NFR-004, NFR-008, §6 Edge Cases 6–7
  - **Dependencies**: T007-01, T007-04, T007-08
  - **Estimated**: 3–4 h (L)

- [x] **T007-10** `[M]` `[FR-006]` Implement notification template engine
  - **File**: `apps/core-api/src/modules/notifications/notification-template.ts`
  - **Type**: Create new file
  - **Description**: Implement `renderTemplate(template: string, data: Record<string, unknown>): string`.
    Replace `{{variableName}}` tokens with values from `data`. Handle missing
    keys gracefully (leave placeholder or empty string). Export type
    `NotificationTemplate` with fields: `subject`, `body`, `htmlBody`. Provide
    3 built-in templates as constants: `NEW_LEAD_ASSIGNED`, `DEAL_STATUS_CHANGED`,
    `REPORT_READY` — matching the user-journey.md notification examples.
  - **Spec Reference**: spec.md §4 FR-006, user-journey.md Journey 4
  - **Dependencies**: T007-07
  - **Estimated**: 45 min (M)

- [x] **T007-11** `[M]` `[FR-008]` `[NFR-006]` Implement job worker process
  - **File**: `apps/core-api/src/modules/jobs/job-worker.ts`
  - **Type**: Create new file
  - **Description**: Implement the BullMQ `Worker` that processes jobs from the
    queue. Worker reads `QUEUE_CONCURRENCY` env var (default: 5). On job receipt:
    validate `tenantId` is present (FR-010), dispatch to registered job handlers
    by `job.name`. Provide a `JobHandlerRegistry` with `register(name, handler)`
    and `dispatch(job)`. Handle worker crash/restart: BullMQ's `lockDuration`
    ensures jobs return to queue (Edge Case #4). Log job lifecycle events with
    Pino (Art. 6.3): `info` on start/complete, `error` on failure with full
    context (jobId, tenantId, error). Start the worker in `apps/core-api/src/index.ts`.
  - **Spec Reference**: spec.md §4 FR-008, §5 NFR-006, §6 Edge Case 4, Art. 6.3
  - **Dependencies**: T007-08
  - **Estimated**: 1.5 h (M)

- [x] **T007-12** `[S]` `[FR-002]` Implement tenant bucket provisioning hook
  - **File**: `apps/core-api/src/modules/storage/bucket-provisioner.ts`
  - **Type**: Create new file
  - **Description**: Implement `provisionTenantBucket(tenantId: string): Promise<void>`.
    Calls MinIO `makeBucket` for `tenant-{tenantId}` if it doesn't already exist
    (idempotent). Apply bucket policy: private access only (no public URLs).
    Hook this function into the tenant creation lifecycle — call from the tenant
    service's `onCreate` handler. Ensure that bucket creation failure is logged
    but does not block tenant creation (non-blocking).
  - **Spec Reference**: spec.md §4 FR-002
  - **Dependencies**: T007-06
  - **Estimated**: 30 min (S)

---

## Phase 3: API / Endpoint Layer

**Objective**: Expose all four services as versioned REST endpoints per
spec.md §8. Use Fastify route plugins.  
**Story Points**: 14  
**Sprint Placement**: Sprint 7, Week 3  
**Prerequisite**: All Phase 2 tasks complete.

---

- [x] **T007-13** `[M]` `[FR-001]` `[FR-002]` `[FR-003]` `[P]` Storage REST endpoints
  - **File**: `apps/core-api/src/modules/storage/storage.routes.ts`
  - **Type**: Create new file
  - **Description**: Register Fastify routes per spec.md §8:
    - `POST /api/v1/storage/upload` — multipart form upload; pipe to
      `StorageService.upload()`; return `FileInfo`; enforce max file size (413 on
      oversize). Include `Content-Type: multipart/form-data` schema validation.
    - `GET /api/v1/storage/download/:path` — stream file from MinIO; set
      `Content-Disposition` header.
    - `DELETE /api/v1/storage/:path` — delegate to `StorageService.delete()`.
    - `GET /api/v1/storage/list` — accepts `?prefix=` query param.
    - `GET /api/v1/storage/signed-url/:path` — accepts `?expiresIn=` (default 3600).
      All routes: Bearer auth (middleware `auth.ts`), tenant context injected via
      `tenant-context.ts` middleware. Validate `:path` param for path traversal
      (sanitize `..`). Standard error response format per Art. 6.2.
  - **Spec Reference**: spec.md §8, §6 Edge Cases 1–2, 8, Art. 6.2
  - **Dependencies**: T007-06
  - **Estimated**: 1.5 h (M)

- [x] **T007-14** `[M]` `[FR-004]` `[FR-005]` `[FR-006]` `[P]` Notification REST endpoints
  - **File**: `apps/core-api/src/modules/notifications/notification.routes.ts`
  - **Type**: Create new file
  - **Description**: Register Fastify routes per spec.md §8:
    - `POST /api/v1/notifications` — body: `Notification`. Calls `NotificationService.send()`.
    - `POST /api/v1/notifications/bulk` — body: `Notification[]`. Calls `sendBulk()`.
    - `GET /api/v1/notifications` (additional — required by UX) — list recent
      in-app notifications for the authenticated user; supports `?limit=10&unread=true`.
      Used by `NotificationBell` component (design-spec.md §4).
    - `PATCH /api/v1/notifications/:id/read` (additional — required by UX) — marks
      a notification as read; decrements unread count. Used by `NotificationBell`
      on click (design-spec.md §3 Screen 2).
    - `POST /api/v1/notifications/mark-all-read` (additional — required by UX) —
      marks all notifications for user as read. Used by "Mark all as read" button.
      All routes: Bearer auth, tenant context. Standard error format.
  - **Spec Reference**: spec.md §8, design-spec.md §3 Screen 2 "Interactive Elements"
  - **Dependencies**: T007-07
  - **Estimated**: 1.5 h (M)

- [x] **T007-15** `[M]` `[FR-007]` `[FR-008]` `[FR-009]` `[P]` Job Queue REST endpoints
  - **File**: `apps/core-api/src/modules/jobs/jobs.routes.ts`
  - **Type**: Create new file
  - **Description**: Register Fastify routes per spec.md §8:
    - `POST /api/v1/jobs` — body: `Job`. Calls `JobQueueService.enqueue()`. Returns `{ jobId }`.
    - `POST /api/v1/jobs/schedule` — body: `{ job, cronExpression }`. Validates cron;
      returns `{ jobId }`.
    - `GET /api/v1/jobs/:id/status` — returns `JobStatus` object.
    - `DELETE /api/v1/jobs/:id` — calls `JobQueueService.cancel()`.
    - `GET /api/v1/jobs` (additional — required by UX) — paginated list of jobs
      for the tenant; supports `?status=`, `?plugin=`, `?page=`, `?limit=50`.
      Used by Job Status Dashboard (design-spec.md §3 Screen 4).
    - `POST /api/v1/jobs/:id/retry` (additional — required by UX) — re-enqueues
      a failed job. Used by "Retry Now" button in `JobDetailPanel`.
    - `PATCH /api/v1/jobs/:id/schedule/disable` (additional — required by UX) —
      disables the cron schedule for a recurring job. Used by "Disable Schedule" button.
      All routes: Bearer auth with `internal` scope check for write routes. Standard error format.
  - **Spec Reference**: spec.md §8, design-spec.md §3 Screen 4 "Interactive Elements"
  - **Dependencies**: T007-08
  - **Estimated**: 1.5 h (M)

- [x] **T007-16** `[M]` `[FR-011]` `[FR-012]` `[FR-013]` `[FR-014]` `[P]` Search REST endpoints
  - **File**: `apps/core-api/src/modules/search/search.routes.ts`
  - **Type**: Create new file
  - **Description**: Register Fastify routes per spec.md §8:
    - `POST /api/v1/search` — body: `SearchQuery` (fields: `q`, `type?`, `limit?`).
      Returns `SearchResult[]` grouped by type. Tenant context auto-scoped via
      middleware. Used by `SearchOverlay` (design-spec.md §3 Screen 1).
    - `POST /api/v1/search/index` — body: `Indexable`. Calls `SearchService.index()`.
    - `DELETE /api/v1/search/:id` — calls `SearchService.delete()`.
    - `POST /api/v1/search/reindex` — body: `{ type: string }`. Enqueues background
      reindex job; returns `{ jobId }` with HTTP 202 Accepted.
      All routes: Bearer auth; internal routes require `internal` scope.
      Zod schema validation on all bodies (Art. 5.3).
  - **Spec Reference**: spec.md §8, §6 Edge Cases 6–7, design-spec.md §3 Screen 1
  - **Dependencies**: T007-09
  - **Estimated**: 1.5 h (M)

- [x] **T007-17** `[M]` `[FR-004]` `[FR-005]` `[UX]` SSE endpoint: `GET /api/v1/notifications/stream`
  - **File**: `apps/core-api/src/modules/notifications/notification-stream.routes.ts`
  - **Type**: Create new file
  - **Description**: Implement Server-Sent Events endpoint per ADR-023 (decision-log.md).
    Set `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
    `Connection: keep-alive`. Fastify `connectionTimeout: 0` on this route.
    On connect: subscribe to Redis pub/sub channel `notifications:{tenantId}:{userId}`.
    On new in-app notification: publish SSE event `{ type: "notification", data: {...} }`.
    On disconnect: unsubscribe Redis channel. Ping every 30s to keep connection alive.
    Include 5-minute replay window on reconnect via Redis sorted set (per ADR-023).
    Also extend SSE to emit `{ type: "job_status", data: { jobId, status } }` when
    a job status changes — required by `useJobStatusStream` hook (design-spec.md §3
    Screen 4 real-time updates).
  - **Spec Reference**: design-spec.md §3 Screen 2 + Screen 4 (real-time updates),
    decision-log.md ADR-023
  - **Dependencies**: T007-07, T007-08
  - **Estimated**: 2 h (M)

---

## Phase 4: Integration & DI Wiring

**Objective**: Wire all services into the Fastify DI container, register routes,
and extend the health check endpoint.  
**Story Points**: 6  
**Sprint Placement**: Sprint 7, Week 3 (after Phase 3)

---

- [x] **T007-18** `[S]` `[FR-001]` `[FR-004]` `[FR-007]` `[FR-011]` Register all routes in Fastify app
  - **File**: `apps/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Description**: Register the four new route plugins (storage, notifications,
    jobs, search) and the SSE stream route. Use Fastify's `app.register()` with
    the `/api/v1` prefix. Ensure routes are registered after auth and
    tenant-context middleware. Import order: storage → notifications → jobs →
    search → notifications/stream.
  - **Spec Reference**: spec.md §8
  - **Dependencies**: T007-13, T007-14, T007-15, T007-16, T007-17
  - **Estimated**: 20 min (S)

- [x] **T007-19** `[S]` `[FR-001]` `[P]` Wire StorageService into Fastify DI container
  - **File**: `apps/core-api/src/index.ts` (or dedicated DI setup file)
  - **Type**: Modify existing
  - **Description**: Register `StorageService` as a Fastify decorator or plugin.
    Initialise with MinIO config from environment (`MINIO_ENDPOINT`, `MINIO_PORT`,
    `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_USE_SSL`). Make accessible
    in route handlers via `fastify.storageService` or request-level factory.
  - **Spec Reference**: spec.md §4 FR-001–FR-003, Art. 3.3
  - **Dependencies**: T007-06, T007-18
  - **Estimated**: 20 min (S)

- [x] **T007-20** `[S]` `[FR-004]` `[P]` Wire NotificationService into Fastify DI container
  - **File**: `apps/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Description**: Register `NotificationService` with SMTP config from env.
    Inject `JobQueueService` dependency for async `sendBulk`. Register as Fastify
    decorator. Also set up Redis pub/sub publisher instance used by the SSE endpoint.
  - **Spec Reference**: spec.md §4 FR-004–FR-006
  - **Dependencies**: T007-07, T007-18
  - **Estimated**: 20 min (S)

- [x] **T007-21** `[S]` `[FR-007]` `[P]` Wire JobQueueService into Fastify DI container
  - **File**: `apps/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Description**: Register `JobQueueService` with Redis config (reuse
    `lib/redis.ts` connection). Register as Fastify decorator. Start job worker
    (`job-worker.ts`) on app startup. Register a built-in job handler for
    `notifications.send-bulk` (to process sendBulk jobs from NotificationService).
  - **Spec Reference**: spec.md §4 FR-007–FR-010
  - **Dependencies**: T007-08, T007-11, T007-18
  - **Estimated**: 20 min (S)

- [x] **T007-22** `[S]` `[FR-011]` `[P]` Wire SearchService into Fastify DI container
  - **File**: `apps/core-api/src/index.ts`
  - **Type**: Modify existing
  - **Description**: Register `SearchService` using existing Prisma client.
    Register as Fastify decorator. Register a built-in job handler for
    `search.reindex` (processes `POST /api/v1/search/reindex` background jobs).
  - **Spec Reference**: spec.md §4 FR-011–FR-014
  - **Dependencies**: T007-09, T007-18
  - **Estimated**: 20 min (S)

- [x] **T007-23** `[S]` `[NFR-001]` `[NFR-004]` `[NFR-005]` Extend `/health` endpoint with service dependency checks
  - **File**: `apps/core-api/src/index.ts` (health route handler)
  - **Type**: Modify existing
  - **Description**: Extend the existing `GET /health` endpoint to include
    service-level dependency checks per Art. 9.1: add `minio` (ping MinIO
    endpoint), `job_queue` (check Redis connection and BullMQ queue depth),
    `search` (simple `SELECT 1` to verify `search_documents` table accessible).
    Notifications health: check SMTP reachability (or skip if SMTP not configured).
    Return format: `{ status: "ok"|"degraded"|"down", services: { minio, job_queue, search, notifications } }`.
  - **Spec Reference**: spec.md §12 Art. 9, Art. 9.1
  - **Dependencies**: T007-19, T007-20, T007-21, T007-22
  - **Estimated**: 25 min (S)

---

## Phase 5: UX Components

**Objective**: Implement all 6 new UI components from design-spec.md §4:
`SearchOverlay`, `NotificationBell`, `FileUploadZone`, `FileListItem`,
`JobDetailPanel`, `JobStatusBadge`. And the `JobStatusDashboard` page.

> **All components go in `packages/ui/src/components/`** — following the
> existing pattern (see `packages/ui/src/components/StatusBadge/`, `DataTable/`, etc.).
> All components must meet WCAG 2.1 AA (Art. 1.3) per design-spec.md §6.

**Story Points**: 27  
**Sprint Placement**: Sprint 8, Weeks 1–2  
**Prerequisite**: Phase 1 complete (tokens); Phases 2–4 can be in progress.

---

- [x] **T007-24** `[L]` `[FR-011]` `[FR-013]` `[FR-014]` `[UX]` `[P]` Build `SearchOverlay` component
  - **File**: `packages/ui/src/components/SearchOverlay/SearchOverlay.tsx`
  - **Type**: Create new file (+ `SearchOverlay.stories.tsx`, `index.ts`)
  - **Description**: Implement per design-spec.md §4 Component: `SearchOverlay`.
    Props: `onSearch`, `onSelect`, `onClose`, `placeholder`, `recentSearches`.
    **States**: idle (recent searches), loading (skeleton rows), results
    (grouped by type with count badges), no-results (EmptyState), error (Alert).
    **Keyboard**: `/` opens overlay (document-level listener, skip if input
    focused), `↑↓` navigate via `aria-activedescendant`, `Enter` selects,
    `Esc` closes with focus restore.
    **Responsive**: 640px wide desktop, full-screen on mobile (<768px).
    **A11y**: `role="dialog"`, `aria-label="Search"`, combobox + listbox ARIA
    pattern per design-spec.md §3 Screen 1 Accessibility section. Focus trap
    when open.
    **Debounce**: call `onSearch` after 300ms using `useCallback` + `setTimeout`.
    Reuse: `EmptyState`, `Skeleton`, `Alert`, `Spinner` from `@plexica/ui`.
  - **Spec Reference**: design-spec.md §3 Screen 1, §4 Component `SearchOverlay`
  - **Dependencies**: T007-05
  - **Estimated**: 3–4 h (L)

- [x] **T007-25** `[L]` `[FR-004]` `[FR-005]` `[UX]` `[P]` Build `NotificationBell` component
  - **File**: `packages/ui/src/components/NotificationBell/NotificationBell.tsx`
  - **Type**: Create new file (+ `NotificationBell.stories.tsx`, `index.ts`)
  - **Description**: Implement per design-spec.md §4 Component: `NotificationBell`.
    Props: `unreadCount`, `notifications`, `onNotificationClick`, `onMarkAllRead`,
    `maxVisible` (default 10).
    **Variants**: default (with badge when unread > 0), quiet (no badge).
    **States**: closed, open-loading (Skeleton rows), open-with-notifications,
    open-empty (EmptyState), pulse (new notification arrived), error (Alert + Retry).
    **Real-time**: accept `newNotification` prop or `onStream` callback — when
    called, increment badge, pulse animation (2s, `--transition-fast`), prepend
    to list if dropdown open, fire `aria-live="polite"` announcement.
    **Responsive**: 360px dropdown desktop, full-width mobile (343px).
    **A11y**: `role="menu"`, `aria-haspopup="true"`, `aria-expanded`,
    notification rows as `role="menuitem"`. Badge is `aria-hidden="true"` (count
    in button's aria-label). Per design-spec.md §3 Screen 2 Accessibility.
    **Keyboard**: `Enter/Space` toggle, `↑↓` navigate, `Esc` close + focus
    return to bell button.
    Reuse: `EmptyState`, `Skeleton`, `Alert`, `Badge` from `@plexica/ui`.
  - **Spec Reference**: design-spec.md §3 Screen 2, §4 Component `NotificationBell`
  - **Dependencies**: T007-05
  - **Estimated**: 3–4 h (L)

- [x] **T007-26** `[L]` `[FR-001]` `[FR-002]` `[FR-003]` `[UX]` `[P]` Build `FileUploadZone` component
  - **File**: `packages/ui/src/components/FileUploadZone/FileUploadZone.tsx`
  - **Type**: Create new file (+ `FileUploadZone.stories.tsx`, `index.ts`)
  - **Description**: Implement per design-spec.md §4 Component: `FileUploadZone`.
    Props: `onUpload`, `onCancel`, `onRetry`, `maxSize`, `accept`, `multiple`
    (default false).
    **States**: default, drag-hover (dashed border highlight), uploading (Progress
    bar with %, file size, ETA, Cancel button), success (green checkmark, 3s
    then fades), error-validation (Warning + size limit), error-api (Red +
    Retry button), empty (EmptyState).
    **Upload progress**: use `XMLHttpRequest` `progress` event to update `aria-valuenow`.
    **Client-side validation**: check `file.size > maxSize` before upload; show
    error immediately (role="alert").
    **Drag & drop**: `onDragOver`, `onDrop` handlers on the drop zone div.
    **A11y**: `role="progressbar"` with `aria-valuenow/min/max`, `role="alert"` for
    errors, descriptive `aria-label` on all buttons (Cancel, Retry, Attach File).
    Per design-spec.md §3 Screen 3 Accessibility.
    Reuse: `Progress`, `EmptyState`, `Alert` from `@plexica/ui`.
  - **Spec Reference**: design-spec.md §3 Screen 3, §4 Component `FileUploadZone`
  - **Dependencies**: T007-05
  - **Estimated**: 3–4 h (L)

- [x] **T007-27** `[M]` `[FR-001]` `[FR-003]` `[UX]` `[P]` Build `FileListItem` component
  - **File**: `packages/ui/src/components/FileListItem/FileListItem.tsx`
  - **Type**: Create new file (+ `FileListItem.stories.tsx`, `index.ts`)
  - **Description**: Implement per design-spec.md §4 Component: `FileListItem`.
    Props: `file` (FileInfo), `onDownload`, `onDelete`.
    **Variants**: default (table row — desktop), compact (stacked card — mobile).
    **States**: default, hover (background highlight), downloading (Spinner on
    download button, `aria-busy="true"`).
    Show: file type icon (derive from MIME/extension), name, size (human-readable),
    upload date, Download (↓) and Delete (🗑) action buttons.
    Delete: trigger `onDelete`, which should open a confirmation Dialog in the
    parent — `FileListItem` itself just calls the callback.
    **A11y**: `aria-label="Download {filename}"` on download button,
    `aria-label="Delete {filename}"` on delete button. Per design-spec.md §4.
    Reuse: `Tooltip`, `Spinner` from `@plexica/ui`.
  - **Spec Reference**: design-spec.md §3 Screen 3, §4 Component `FileListItem`
  - **Dependencies**: T007-05
  - **Estimated**: 1.5 h (M)

- [x] **T007-28** `[M]` `[FR-007]` `[FR-008]` `[FR-009]` `[FR-010]` `[UX]` `[P]` Build `JobDetailPanel` component
  - **File**: `packages/ui/src/components/JobDetailPanel/JobDetailPanel.tsx`
  - **Type**: Create new file (+ `JobDetailPanel.stories.tsx`, `index.ts`)
  - **Description**: Implement per design-spec.md §4 Component: `JobDetailPanel`.
    Props: `job` (JobDetails), `onRetry`, `onDisableSchedule`, `expanded` (boolean).
    **States**: collapsed (summary row only), expanded (detail panel slides in
    with `--transition-normal` animation), retrying (Spinner on "Retry Now"
    button, `aria-busy="true"`, status badge changes to Queued on success).
    Detail panel shows: Job ID, Plugin, Tenant, Schedule (cron + human-readable),
    Started/Failed timestamps, Duration, Retries (N/max), Error message.
    Actions: "Retry Now" (only visible for FAILED jobs), "Disable Schedule"
    (only visible for SCHEDULED/recurring jobs — opens confirmation Dialog).
    **A11y**: `aria-expanded`, `aria-controls="job-detail-{id}"`,
    `role="region"`, `aria-label="Details for {job.name}"`. Per design-spec.md §4.
    Reuse: `Badge`, `Tooltip`, `Dialog`, `Spinner` from `@plexica/ui`.
  - **Spec Reference**: design-spec.md §3 Screen 4, §4 Component `JobDetailPanel`
  - **Dependencies**: T007-29
  - **Estimated**: 2 h (M)

- [x] **T007-29** `[S]` `[FR-007]` `[UX]` `[P]` Build `JobStatusBadge` component
  - **File**: `packages/ui/src/components/JobStatusBadge/JobStatusBadge.tsx`
  - **Type**: Create new file (+ `index.ts`)
  - **Description**: Extend existing `StatusBadge` component. Accept prop `status`
    typed as `JobStatus` enum (PENDING/QUEUED/RUNNING/COMPLETED/FAILED/CANCELLED/SCHEDULED).
    Map to design-spec.md §4 variant table: token, icon, and label for each status.
    Icons: use existing Lucide React icon set already in use.
    **A11y**: always render text label alongside color + icon (never color alone).
    Icon `aria-hidden="true"`. Per design-spec.md §4.
  - **Spec Reference**: design-spec.md §4 Component `JobStatusBadge`
  - **Dependencies**: T007-05, T007-01
  - **Estimated**: 25 min (S)

- [x] **T007-30** `[L]` `[FR-007]` `[FR-008]` `[FR-009]` `[FR-010]` `[UX]` Build Job Status Dashboard page
  - **File**: `apps/web/src/pages/admin.jobs.tsx`
  - **Type**: Create new file
  - **Description**: Implement the Job Status Dashboard screen per design-spec.md
    §3 Screen 4. Route: `/admin/jobs`.
    **Layout**: 4 summary stat cards (Running/Queued/Failed/Completed-today) as
    `StatCard` components + job table as `DataTable`. Cards are clickable —
    clicking filters the table by that status.
    **Tab bar**: All / Running / Queued / Failed / Scheduled — using `Tabs`
    component.
    **Filters**: name filter input (debounced 300ms), plugin filter `Select`.
    **Table columns**: Name (expandable via `JobDetailPanel`), Plugin, Status
    (`JobStatusBadge`), Started + Duration. Expandable row detail with
    `JobDetailPanel`.
    **Pagination**: 50 jobs per page using `Pagination` component.
    **Real-time**: connect `useJobStatusStream` hook — update stat card counters
    and table row status badges in real-time without page reload.
    **Empty state**: `EmptyState` with job queue icon.
    **Permissions**: route protected by `admin:jobs:read` role; show 403 page
    per user-journey.md Journey 3 Edge Case B.
    **Responsive**: 4-col stat cards → 2×2 → 3+1 per design-spec.md §3 Screen 4
    Responsive Notes.
    Reuse: `DataTable`, `Tabs`, `StatCard`, `Pagination`, `Input`, `Select`,
    `EmptyState`, `Skeleton`, `Alert`, `Toast` from `@plexica/ui`.
  - **Spec Reference**: design-spec.md §3 Screen 4, user-journey.md Journey 3
  - **Dependencies**: T007-28, T007-29, T007-35
  - **Estimated**: 3–4 h (L)

---

## Phase 6: UX Shell Integration

**Objective**: Integrate the new UX components into the shell header and admin
sidebar. Wire up SSE client hooks for real-time updates.  
**Story Points**: 9  
**Sprint Placement**: Sprint 8, Weeks 2–3  
**Prerequisite**: Phase 5 components built; Phases 3–4 API available.

---

- [x] **T007-31** `[M]` `[FR-011]` `[FR-013]` `[FR-014]` `[UX]` Integrate `SearchOverlay` into shell Header
  - **File**: `apps/web/src/components/shell/Header.tsx` (or equivalent shell header)
  - **Type**: Modify existing
  - **Description**: Add search bar to the shell header per design-spec.md §3
    Screen 1 header wireframe. On desktop (≥768px): show text input `SearchOverlay`
    trigger (300px wide). On mobile (<768px): show icon-only 🔍 button that opens
    full-screen overlay.
    Wire `onSearch` to `GET /api/v1/search` (via `packages/api-client`).
    Wire `onSelect` to TanStack Router navigation.
    Handle `/` keyboard shortcut at document level (skip when input focused).
    Persist `recentSearches` in `localStorage` (last 5 searches).
  - **Spec Reference**: design-spec.md §3 Screen 1, §1 "Design Decisions Summary"
  - **Dependencies**: T007-24
  - **Estimated**: 1.5 h (M)

- [x] **T007-32** `[M]` `[FR-004]` `[FR-005]` `[UX]` Integrate `NotificationBell` into shell Header
  - **File**: `apps/web/src/components/shell/Header.tsx`
  - **Type**: Modify existing
  - **Description**: Add `NotificationBell` component to the shell header next to
    the language selector (per header wireframe in design-spec.md all screens).
    On mount: fetch initial notifications from `GET /api/v1/notifications?limit=10`.
    Connect `useNotificationStream` SSE hook for real-time badge updates.
    Wire `onNotificationClick` to: call `PATCH /api/v1/notifications/:id/read`,
    navigate to source resource (using `metadata.link` from notification payload).
    Wire `onMarkAllRead` to `POST /api/v1/notifications/mark-all-read`.
  - **Spec Reference**: design-spec.md §3 Screen 2, design-spec.md §1 "Header density"
  - **Dependencies**: T007-25, T007-34
  - **Estimated**: 1.5 h (M)

- [x] **T007-33** `[S]` `[FR-007]` `[UX]` Add Jobs page to admin sidebar navigation
  - **File**: `apps/web/src/components/shell/Sidebar.tsx` (or equivalent nav config)
  - **Type**: Modify existing
  - **Description**: Add "Jobs" link to the admin sidebar navigation under the
    Admin section, per the sidebar wireframe in design-spec.md §3 Screen 4.
    Icon: a queue/list icon from Lucide React. Route: `/admin/jobs`.
    Show only for users with `admin:jobs:read` permission (conditionally render).
    Add TanStack Router route definition for `/admin/jobs` pointing to
    `admin.jobs.tsx` (T007-30).
  - **Spec Reference**: design-spec.md §3 Screen 4 (sidebar wireframe)
  - **Dependencies**: T007-30
  - **Estimated**: 20 min (S)

- [x] **T007-34** `[M]` `[FR-004]` `[FR-005]` `[UX]` `[P]` SSE client hook: `useNotificationStream`
  - **File**: `apps/web/src/hooks/useNotificationStream.ts`
  - **Type**: Create new file
  - **Description**: React hook that connects to `GET /api/v1/notifications/stream`
    via the browser `EventSource` API. Handles: connection open, incoming
    `notification` events (parse JSON, call `onNotification` callback),
    connection error (retry with exponential backoff, fallback to 30s polling
    per design-spec.md §1 "Real-time updates"), connection close on unmount
    (cleanup `EventSource`). Returns `{ isConnected, error }`.
    Per ADR-023 (decision-log.md): SSE for real-time delivery, zero new deps.
  - **Spec Reference**: design-spec.md §1, §3 Screen 2 "Real-time update" state,
    decision-log.md ADR-023
  - **Dependencies**: T007-17
  - **Estimated**: 1 h (M)

- [x] **T007-35** `[M]` `[FR-007]` `[FR-008]` `[UX]` `[P]` SSE client hook: `useJobStatusStream`
  - **File**: `apps/web/src/hooks/useJobStatusStream.ts`
  - **Type**: Create new file
  - **Description**: React hook that listens to `job_status` events from the
    SSE stream (same endpoint `GET /api/v1/notifications/stream` — multiplexed).
    On `job_status` event: parse `{ jobId, status }`, call `onJobStatusChange`
    callback. Used by `JobStatusDashboard` to update stat card counters and table
    row badges without polling. Provides same error handling and fallback as
    `useNotificationStream` (T007-34). Returns `{ isConnected, lastEvent }`.
  - **Spec Reference**: design-spec.md §3 Screen 4 "Real-time update" state
  - **Dependencies**: T007-17
  - **Estimated**: 1 h (M)

---

## Phase 7: Testing

**Objective**: Achieve ≥80% overall coverage (Art. 4.1). Unit tests for all
service methods, integration tests for all API endpoints, component tests for
all 6 new UX components, E2E tests for the 4 core user journeys.  
**Story Points**: 32  
**Sprint Placement**: Sprint 8, Weeks 3–4  
**Prerequisite**: Phases 2–6 complete.

---

- [x] **T007-36** `[M]` `[NFR-001]` `[NFR-002]` `[NFR-007]` `[P]` Unit tests: StorageService
  - **File**: `apps/core-api/src/__tests__/unit/storage/storage.service.test.ts`
  - **Type**: Create new file
  - **Description**: Test all methods with mocked MinIO client. Cover: upload
    success, download success, delete success, list success, getSignedUrl <10ms
    (NFR-002 benchmark), file-too-large error (Edge Case #1), path traversal
    rejection (Edge Case #8), MinIO transient error → retry → final success
    (Edge Case #2), tenant bucket isolation (cross-tenant access impossible NFR-007).
    Mock MinIO with `vi.fn()`. Minimum 85% branch coverage.
  - **Spec Reference**: spec.md §4 FR-001–003, §5 NFR-001–002, NFR-007, §6 Edges 1–2, 8
  - **Dependencies**: T007-06
  - **Estimated**: 1.5 h (M)

- [x] **T007-37** `[M]` `[NFR-005]` `[P]` Unit tests: NotificationService
  - **File**: `apps/core-api/src/__tests__/unit/notifications/notification.service.test.ts`
  - **Type**: Create new file
  - **Description**: Test with mocked Nodemailer and mocked `JobQueueService`.
    Cover: `send` email, `inApp` persists to DB, `sendBulk` enqueues jobs,
    `push` stub returns void, invalid email → FAILED status (no retry Edge Case #3),
    template rendering (`{{variable}}` substitution FR-006), retry on transient
    SMTP error (max 3). Mock Prisma with `vi.fn()`. Minimum 85% branch coverage.
  - **Spec Reference**: spec.md §4 FR-004–006, §5 NFR-005, §6 Edge Case 3
  - **Dependencies**: T007-07, T007-10
  - **Estimated**: 1.5 h (M)

- [x] **T007-38** `[M]` `[NFR-003]` `[NFR-006]` `[P]` Unit tests: JobQueueService
  - **File**: `apps/core-api/src/__tests__/unit/jobs/job-queue.service.test.ts`
  - **Type**: Create new file
  - **Description**: Test with mocked BullMQ and mocked Prisma (job repository).
    Cover: enqueue returns jobId in <50ms (NFR-003), schedule valid cron success,
    invalid cron → validation error (Edge Case #5), cancel sets status CANCELLED,
    getStatus returns correct enum, `tenantId` included in every job payload
    (FR-010), job failure triggers retry (NFR-006), worker crash returns job to
    queue (Edge Case #4). Minimum 85% branch coverage.
  - **Spec Reference**: spec.md §4 FR-007–010, §5 NFR-003, NFR-006, §6 Edges 4–5
  - **Dependencies**: T007-08, T007-11
  - **Estimated**: 1.5 h (M)

- [x] **T007-39** `[M]` `[NFR-004]` `[NFR-008]` `[P]` Unit tests: SearchService
  - **File**: `apps/core-api/src/__tests__/unit/search/search.service.test.ts`
  - **Type**: Create new file
  - **Description**: Test with mocked Prisma `$queryRaw`. Cover: index upserts
    document, search always scopes to `tenant_id` (FR-012), search returns
    ranked results (FR-013), type filter applied (FR-014), delete removes document,
    reindex enqueues job + returns jobId (Edge Case #6), document ID collision
    prevented by `(tenant_id, type, document_id)` uniqueness (Edge Case #7).
    Minimum 85% branch coverage.
  - **Spec Reference**: spec.md §4 FR-011–014, §5 NFR-004, NFR-008, §6 Edges 6–7
  - **Dependencies**: T007-09
  - **Estimated**: 1.5 h (M)

- [x] **T007-40** `[L]` `[FR-001]` `[FR-002]` `[FR-003]` `[P]` Integration tests: Storage API endpoints
  - **File**: `apps/core-api/src/__tests__/integration/storage/storage.routes.test.ts`
  - **Type**: Create new file
  - **Description**: Use `buildTestApp()` + real MinIO test instance (from
    `test-infrastructure/docker-compose.yml`). Cover: upload file → stored in
    `tenant-{id}` bucket, download by same tenant → success, download by
    different tenant → 403, delete removes file, list returns correct files,
    signed URL valid for requested duration, file too large → 413 (Edge Case #1),
    path traversal attempt → 400 (Edge Case #8).
  - **Spec Reference**: spec.md §4 FR-001–003, §6 Edges 1, 8
  - **Dependencies**: T007-13, T007-19
  - **Estimated**: 2–3 h (L)

- [x] **T007-41** `[M]` `[FR-004]` `[FR-005]` `[P]` Integration tests: Notification API endpoints
  - **File**: `apps/core-api/src/__tests__/integration/notifications/notification.routes.test.ts`
  - **Type**: Create new file
  - **Description**: Use `buildTestApp()` + real PostgreSQL. Cover: `POST /notifications`
    creates DB record, `GET /notifications` returns user's notifications scoped
    to tenant, `PATCH /:id/read` marks as read + unread count decrements,
    `POST /mark-all-read` sets all to read, `POST /bulk` enqueues jobs, invalid
    auth → 401, cross-tenant isolation → user B cannot see user A's notifications.
  - **Spec Reference**: spec.md §4 FR-004–006
  - **Dependencies**: T007-14, T007-20
  - **Estimated**: 1.5 h (M)

- [x] **T007-42** `[L]` `[FR-007]` `[FR-008]` `[FR-009]` `[P]` Integration tests: Job Queue API endpoints
  - **File**: `apps/core-api/src/__tests__/integration/jobs/jobs.routes.test.ts`
  - **Type**: Create new file
  - **Description**: Use `buildTestApp()` + real Redis. Cover: enqueue → job ID
    returned, schedule with valid cron → success, schedule with invalid cron →
    400, getStatus returns correct status, cancel changes status, `GET /jobs`
    returns paginated list filtered by status/plugin, `POST /:id/retry` re-queues
    failed job, `PATCH /:id/schedule/disable` disables recurring job, tenant
    isolation — tenant B cannot see tenant A's jobs.
  - **Spec Reference**: spec.md §4 FR-007–010
  - **Dependencies**: T007-15, T007-21
  - **Estimated**: 2–3 h (L)

- [x] **T007-43** `[M]` `[FR-011]` `[FR-012]` `[FR-014]` `[P]` Integration tests: Search API endpoints
  - **File**: `apps/core-api/src/__tests__/integration/search/search.routes.test.ts`
  - **Type**: Create new file
  - **Description**: Use `buildTestApp()` + real PostgreSQL. Cover: index document
    → searchable, search by query returns ranked results, search with type filter
    returns only matching type, delete removes from index, reindex → 202 with
    jobId, search results scoped to tenant (tenant A results not returned to
    tenant B), 10K document query meets <100ms (NFR-004 sanity test).
  - **Spec Reference**: spec.md §4 FR-011–014, §5 NFR-004
  - **Dependencies**: T007-16, T007-22
  - **Estimated**: 1.5 h (M)

- [x] **T007-44** `[M]` `[UX]` `[P]` Component tests: `SearchOverlay` + `NotificationBell`
  - **File**: `apps/web/src/test/SearchOverlay.test.tsx`, `NotificationBell.test.tsx`
  - **Type**: Create new files
  - **Description**: Use Vitest + React Testing Library. `SearchOverlay` tests:
    opens on `/` keypress, debounces input (300ms), shows skeleton while loading,
    groups results by type, keyboard nav (`↑↓` changes `aria-activedescendant`),
    `Esc` closes + focus returns, WCAG contrast check (axe-core). `NotificationBell`
    tests: renders badge with count, opens dropdown on click, marks notification
    as read on click, "Mark all as read" clears badge, pulse animation on new
    notification, `Esc` closes dropdown. ≥80% component branch coverage.
  - **Spec Reference**: design-spec.md §3 Screen 1–2, §6 Accessibility Summary
  - **Dependencies**: T007-24, T007-25
  - **Estimated**: 1.5 h (M)

- [x] **T007-45** `[M]` `[UX]` `[P]` Component tests: `FileUploadZone` + `FileListItem`
  - **File**: `apps/web/src/test/FileUploadZone.test.tsx`, `FileListItem.test.tsx`
  - **Type**: Create new files
  - **Description**: `FileUploadZone` tests: shows progress bar on upload, calls
    `onUpload` with selected file, client-side validation triggers error for
    oversized file before upload, drag-and-drop triggers upload, Cancel button
    calls `onCancel`, Retry button calls `onRetry`, ARIA `progressbar` updates
    `aria-valuenow`. `FileListItem` tests: renders file metadata, Download button
    calls `onDownload`, Delete button calls `onDelete`, shows Spinner when
    downloading. ≥80% branch coverage.
  - **Spec Reference**: design-spec.md §3 Screen 3, §4 Components
  - **Dependencies**: T007-26, T007-27
  - **Estimated**: 1.5 h (M)

- [x] **T007-46** `[M]` `[UX]` `[P]` Component tests: Job Dashboard + `JobDetailPanel`
  - **File**: `apps/web/src/test/admin.jobs.test.tsx`, `JobDetailPanel.test.tsx`
  - **Type**: Create new files
  - **Description**: Dashboard tests: renders 4 stat cards, clicking a card
    filters table, tab bar changes status filter, name filter input debounces,
    pagination navigates pages, real-time update increments stat card counter.
    `JobDetailPanel` tests: collapsed by default, expands on click (aria-expanded
    changes), shows job details (ID, schedule, error), Retry button calls
    `onRetry`, Disable Schedule button opens confirmation Dialog. ≥80% coverage.
  - **Spec Reference**: design-spec.md §3 Screen 4, §4 Components
  - **Dependencies**: T007-30, T007-28
  - **Estimated**: 1.5 h (M)

- [x] **T007-47** `[L]` `[UX]` E2E tests: upload file, search, notification flow
  - **File**: `apps/web/tests/e2e/core-services.spec.ts`
  - **Type**: Create new file
  - **Description**: Playwright E2E tests covering user-journey.md Journeys 1–4:
    Journey 1 (Search): Dana types "john" → sees grouped results → clicks contact
    → navigates to detail page.
    Journey 2 (Upload): Dana uploads contract.pdf → progress bar shows → success
    state → file appears in list → download works.
    Journey 3 (Jobs): Marco opens `/admin/jobs` → sees job table → expands failed
    job → clicks Retry → status changes to Queued.
    Journey 4 (Notifications): Bell icon shows badge → click opens dropdown →
    notification click navigates + marks as read → badge decrements.
    Also: permission test — non-admin navigating to `/admin/jobs` sees 403.
    Use test tenant + seeded test data. Minimum 4 passing E2E scenarios.
  - **Spec Reference**: user-journey.md Journeys 1–4, spec.md §3 US-001–US-004
  - **Dependencies**: T007-31, T007-32, T007-33
  - **Estimated**: 3–4 h (L)

---

## Phase 8: Polish & Documentation

**Objective**: OpenAPI docs for all endpoints, structured error logging, API
error message review.  
**Story Points**: 3  
**Sprint Placement**: Sprint 8, Week 4 (after testing complete)

---

- [x] **T007-48** `[M]` `[FR-001]` `[FR-004]` `[FR-007]` `[FR-011]` Polish: OpenAPI docs, error messages, logging
  - **Files**:
    - `apps/core-api/src/modules/storage/storage.routes.ts`
    - `apps/core-api/src/modules/notifications/notification.routes.ts`
    - `apps/core-api/src/modules/jobs/jobs.routes.ts`
    - `apps/core-api/src/modules/search/search.routes.ts`
  - **Type**: Modify existing
  - **Description**: Add Fastify schema documentation (`description`, `tags`,
    `response` schemas with OpenAPI annotations) to all routes defined in Phases 3.
    Verify all error responses match the standard format from Art. 6.2:
    `{ error: { code, message, details? } }`. Review all error codes for clarity
    and actionability (Art. 1.3). Ensure all service methods log with the required
    Pino fields: `timestamp`, `level`, `message`, `requestId`, `userId`, `tenantId`
    (Art. 6.3). Confirm no PII (email addresses, file contents) appear in logs
    (Art. 5.2). Add OpenAPI `tags` grouping: `storage`, `notifications`, `jobs`,
    `search`. Run `pnpm lint` and fix any issues.
  - **Spec Reference**: spec.md §12 Art. 6.2, Art. 6.3, Art. 5.2
  - **Dependencies**: T007-36 – T007-47
  - **Estimated**: 1.5 h (M)

---

## Summary

| Metric                | Value                                    |
| --------------------- | ---------------------------------------- |
| Total tasks           | 48                                       |
| Total phases          | 8                                        |
| Parallelizable tasks  | 28 (tasks marked `[P]`)                  |
| UX-derived tasks      | 17 (marked `[UX]` — from design-spec.md) |
| Backend service tasks | 23 (Phases 1–4 + 7 backend tests)        |
| Estimated effort      | ~87 story points / ~130–160 hours total  |
| FRs covered           | 14/14 (FR-001 – FR-014) ✅               |
| NFRs covered          | 8/8 (NFR-001 – NFR-008) ✅               |
| **Progress**          | **48/48 complete** ✅ All tasks done     |

---

## Cross-References

| Document                   | Path                                                     |
| -------------------------- | -------------------------------------------------------- |
| Spec                       | `.forge/specs/007-core-services/spec.md`                 |
| Design Spec (UX)           | `.forge/specs/007-core-services/design-spec.md`          |
| User Journeys              | `.forge/specs/007-core-services/user-journey.md`         |
| Constitution               | `.forge/constitution.md`                                 |
| Decision Log (ADR-023 SSE) | `.forge/knowledge/decision-log.md`                       |
| Architecture               | `.forge/architecture/architecture.md`                    |
| Design System Tokens       | `.forge/ux/design-system.md`                             |
| Spec 010 (Frontend)        | `.forge/specs/010-frontend-production-readiness/spec.md` |
| Spec 005 (Shell)           | `.forge/specs/005-frontend-architecture/spec.md`         |
