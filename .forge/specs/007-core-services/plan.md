# Plan: 007 - Core Services

> Technical implementation plan for the Plexica shared core services: Storage,
> Notifications, Job Queue, and Search. Covers backend services, REST APIs,
> SSE real-time delivery, six new UX components, and the Job Status Dashboard.
>
> Created by the `forge-architect` agent via `/forge-plan`.

| Field   | Value                                                                     |
| ------- | ------------------------------------------------------------------------- |
| Status  | Draft                                                                     |
| Author  | forge-architect                                                           |
| Date    | 2026-03-02                                                                |
| Track   | Feature                                                                   |
| Spec    | [007-core-services/spec.md](./spec.md)                                    |
| Design  | [007-core-services/design-spec.md](./design-spec.md)                      |
| Journey | [007-core-services/user-journey.md](./user-journey.md)                    |
| Tasks   | [007-core-services/tasks.md](./tasks.md) (48 tasks, 87 pts)               |
| ADR     | [ADR-023 SSE](../../knowledge/adr/adr-023-sse-real-time-notifications.md) |

---

## 1. Overview

### 1.1 Executive Summary

This plan implements four foundational core services that the Plexica shell and
all plugins consume through standardized TypeScript interfaces:

1. **Storage Service** — MinIO/S3-compatible file management with tenant-isolated
   buckets, signed URLs, and path traversal protection.
2. **Notification Service** — Email (SMTP/Nodemailer), push (stub for MVP), and
   in-app notifications with template rendering and async delivery via the Job
   Queue.
3. **Job Queue Service** — BullMQ-based async and scheduled (cron) task execution
   with tenant-scoped payloads, at-least-once delivery, and an admin dashboard.
4. **Search Service** — PostgreSQL full-text search (FTS) for MVP with
   tenant-scoped indexing, relevance ranking, and type filtering. Elasticsearch
   migration deferred.

The plan also covers:

- **SSE real-time delivery** per ADR-023 — notification badge updates, job status
  counters, and dropdown live inserts via `EventSource` + Redis pub/sub.
- **Six new UX components** — `SearchOverlay`, `NotificationBell`,
  `FileUploadZone`, `FileListItem`, `JobDetailPanel`, `JobStatusBadge`.
- **Job Status Dashboard** — admin-only page at `/admin/jobs` with stat cards,
  filterable DataTable, and real-time SSE-driven updates.

### 1.2 Current State Analysis

**What exists:**

| Component             | Location                                         | Status           |
| --------------------- | ------------------------------------------------ | ---------------- |
| Prisma ORM            | `packages/database/`                             | ✅ Active        |
| Redis client          | `apps/core-api/src/lib/redis.ts`                 | ✅ Active        |
| Fastify app           | `apps/core-api/src/index.ts`                     | ✅ Active        |
| Auth middleware       | `apps/core-api/src/middleware/auth.ts`           | ✅ Active        |
| Tenant context MW     | `apps/core-api/src/middleware/tenant-context.ts` | ✅ Active        |
| Health endpoint       | `apps/core-api/src/index.ts`                     | ✅ Basic         |
| `@plexica/ui` library | `packages/ui/src/components/`                    | ✅ 16 components |
| Shell Header          | `apps/web/src/components/shell/Header.tsx`       | ✅ Active        |
| Shell Sidebar         | `apps/web/src/components/shell/Sidebar.tsx`      | ✅ Active        |
| MinIO infrastructure  | `test-infrastructure/docker-compose.yml`         | ✅ Running       |

**What doesn't exist (gaps this plan fills):**

| Gap                              | Plan Section | Task IDs         |
| -------------------------------- | ------------ | ---------------- |
| Storage service + tenant buckets | §4.1, §3.1   | T007-06, T007-12 |
| Notification service + templates | §4.2, §3.2   | T007-07, T007-10 |
| Job queue + worker + cron        | §4.3, §3.3   | T007-08, T007-11 |
| Search service (FTS)             | §4.4, §3.4   | T007-09          |
| SSE real-time endpoint           | §6           | T007-17          |
| Notification REST API            | §3.2         | T007-14          |
| Job REST API                     | §3.3         | T007-15          |
| Search REST API                  | §3.4         | T007-16          |
| Storage REST API                 | §3.1         | T007-13          |
| 6 new UX components              | §7           | T007-24–T007-29  |
| Job Status Dashboard page        | §7.7         | T007-30          |
| SSE client hooks                 | §7.8, §7.9   | T007-34, T007-35 |
| Design tokens (10 new)           | §7.10        | T007-05          |

### 1.3 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser (React SPA)                           │
│                                                                         │
│  ┌──────────┐ ┌───────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ Search   │ │ Notification  │ │ FileUpload   │ │ Job Status       │  │
│  │ Overlay  │ │ Bell          │ │ Zone         │ │ Dashboard        │  │
│  └────┬─────┘ └──────┬────────┘ └──────┬───────┘ └──────┬───────────┘  │
│       │              │                  │                │              │
│       │              │ EventSource      │                │              │
│       │              │ (SSE)            │                │              │
└───────┼──────────────┼──────────────────┼────────────────┼──────────────┘
        │              │                  │                │
        ▼              ▼                  ▼                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Fastify (core-api) /api/v1/                        │
│                                                                         │
│  ┌──────────────┐ ┌─────────────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ search.*     │ │ notifications.* │ │ storage.*│ │ jobs.*         │  │
│  │  routes.ts   │ │  routes.ts      │ │ routes.ts│ │  routes.ts     │  │
│  └──────┬───────┘ └──────┬──────────┘ └────┬─────┘ └──────┬─────────┘  │
│         │                │                  │              │            │
│  ┌──────▼───────┐ ┌──────▼──────────┐ ┌────▼─────┐ ┌──────▼─────────┐ │
│  │ SearchService│ │ Notification    │ │ Storage  │ │ JobQueue       │ │
│  │  (PG FTS)   │ │ Service         │ │ Service  │ │ Service        │ │
│  └──────┬───────┘ └──────┬──────────┘ └────┬─────┘ └──────┬─────────┘ │
│         │                │                  │              │            │
│  ┌──────▼───┐  ┌─────────▼────┐  ┌─────────▼───┐  ┌──────▼─────────┐ │
│  │ Prisma   │  │ Nodemailer   │  │ MinIO Client│  │ BullMQ         │ │
│  │ $queryRaw│  │ (SMTP)       │  │ (S3)       │  │ (Queue+Worker) │ │
│  └──────┬───┘  └──────────────┘  └──────┬──────┘  └──────┬─────────┘ │
│         │                                │                │            │
│  ┌──────▼───────────────────────────┐ ┌──▼────────────────▼──────────┐ │
│  │         PostgreSQL 15+           │ │         Redis (ioredis)      │ │
│  │  search_documents (tsvector)     │ │  BullMQ queues               │ │
│  │  notifications                   │ │  SSE pub/sub channels        │ │
│  │  jobs                            │ │  5-min replay sorted set     │ │
│  └──────────────────────────────────┘ └──────────────────────────────┘ │
│         │                                        │                     │
│         │                                ┌───────▼───────────────┐     │
│         │                                │ SSE Handler           │     │
│         │                                │ notifications/stream  │     │
│         │                                │ Redis SUBSCRIBE       │     │
│         │                                │ notifications:{t}:{u} │     │
│         │                                └───────────────────────┘     │
│         │                                                              │
│  ┌──────▼──────┐                                                       │
│  │ MinIO       │                                                       │
│  │ Buckets:    │                                                       │
│  │ tenant-{id} │                                                       │
│  └─────────────┘                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

### 2.1 New Tables

All tables are created in the tenant schema and enforce `tenant_id` foreign key
for row-level isolation (Art. 5.2, FR-002/FR-010/FR-012).

#### `jobs`

| Column            | Type                | Constraints                     | Notes                                       |
| ----------------- | ------------------- | ------------------------------- | ------------------------------------------- |
| `id`              | `uuid`              | PK, default `gen_random_uuid()` | Unique job identifier                       |
| `tenant_id`       | `varchar(255)`      | FK → `tenants.id`, NOT NULL     | Tenant isolation (FR-010)                   |
| `name`            | `varchar(255)`      | NOT NULL                        | Job name (e.g., `crm.export-contacts`)      |
| `plugin_id`       | `varchar(255)`      | NULLABLE                        | Source plugin ID (nullable for core jobs)   |
| `status`          | `job_status` (enum) | NOT NULL, default `PENDING`     | See enum below                              |
| `payload`         | `jsonb`             | NOT NULL, default `{}`          | Job input data                              |
| `result`          | `jsonb`             | NULLABLE                        | Job output / result data                    |
| `error`           | `text`              | NULLABLE                        | Error message on failure                    |
| `retries`         | `integer`           | NOT NULL, default `0`           | Current retry count                         |
| `max_retries`     | `integer`           | NOT NULL, default `3`           | Maximum retry attempts                      |
| `cron_expression` | `varchar(100)`      | NULLABLE                        | Cron expression for recurring jobs (FR-009) |
| `scheduled_at`    | `timestamptz`       | NULLABLE                        | Next scheduled execution time               |
| `started_at`      | `timestamptz`       | NULLABLE                        | Job execution start time                    |
| `completed_at`    | `timestamptz`       | NULLABLE                        | Job execution completion time               |
| `created_at`      | `timestamptz`       | NOT NULL, default `now()`       | Record creation timestamp                   |
| `updated_at`      | `timestamptz`       | NOT NULL, default `now()`       | Record last update timestamp                |

**Enum `job_status`:**

```sql
CREATE TYPE job_status AS ENUM (
  'PENDING', 'QUEUED', 'RUNNING', 'COMPLETED',
  'FAILED', 'CANCELLED', 'SCHEDULED'
);
```

#### `notifications`

| Column       | Type                          | Constraints                     | Notes                                       |
| ------------ | ----------------------------- | ------------------------------- | ------------------------------------------- |
| `id`         | `uuid`                        | PK, default `gen_random_uuid()` | Unique notification ID                      |
| `tenant_id`  | `varchar(255)`                | FK → `tenants.id`, NOT NULL     | Tenant isolation                            |
| `user_id`    | `varchar(255)`                | NOT NULL                        | Keycloak user ID (target user)              |
| `channel`    | `notification_channel` (enum) | NOT NULL                        | EMAIL / PUSH / IN_APP                       |
| `status`     | `notification_status` (enum)  | NOT NULL, default `PENDING`     | PENDING / SENT / FAILED / READ              |
| `title`      | `varchar(500)`                | NOT NULL                        | Notification title                          |
| `body`       | `text`                        | NOT NULL                        | Notification body text                      |
| `metadata`   | `jsonb`                       | NULLABLE                        | Source resource link, plugin ID, extra data |
| `read_at`    | `timestamptz`                 | NULLABLE                        | Timestamp when marked as read               |
| `created_at` | `timestamptz`                 | NOT NULL, default `now()`       | Record creation timestamp                   |
| `updated_at` | `timestamptz`                 | NOT NULL, default `now()`       | Record last update timestamp                |

**Enum `notification_channel`:**

```sql
CREATE TYPE notification_channel AS ENUM ('EMAIL', 'PUSH', 'IN_APP');
```

**Enum `notification_status`:**

```sql
CREATE TYPE notification_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');
```

#### `search_documents`

| Column          | Type           | Constraints                     | Notes                                           |
| --------------- | -------------- | ------------------------------- | ----------------------------------------------- |
| `id`            | `uuid`         | PK, default `gen_random_uuid()` | Internal row ID                                 |
| `tenant_id`     | `varchar(255)` | FK → `tenants.id`, NOT NULL     | Tenant isolation (FR-012)                       |
| `document_id`   | `varchar(255)` | NOT NULL                        | Plugin-assigned document ID                     |
| `type`          | `varchar(100)` | NOT NULL                        | Resource type (e.g., `crm:contact`, `crm:deal`) |
| `title`         | `varchar(500)` | NOT NULL                        | Document title (searchable)                     |
| `body`          | `text`         | NOT NULL, default `''`          | Document body content (searchable)              |
| `metadata`      | `jsonb`        | NULLABLE                        | Extra data returned in search results           |
| `search_vector` | `tsvector`     | GENERATED from `title` + `body` | PostgreSQL full-text search vector              |
| `created_at`    | `timestamptz`  | NOT NULL, default `now()`       | Record creation timestamp                       |
| `updated_at`    | `timestamptz`  | NOT NULL, default `now()`       | Record last update timestamp                    |

### 2.2 Modified Tables

No existing tables are modified. All three tables are net-new additions.

### 2.3 Indexes

| Table              | Index Name                              | Columns                                       | Type             |
| ------------------ | --------------------------------------- | --------------------------------------------- | ---------------- |
| `jobs`             | `idx_jobs_tenant_status`                | `(tenant_id, status)`                         | B-TREE           |
| `jobs`             | `idx_jobs_tenant_name`                  | `(tenant_id, name)`                           | B-TREE           |
| `jobs`             | `idx_jobs_scheduled_at`                 | `(scheduled_at)` WHERE `status = 'SCHEDULED'` | B-TREE (partial) |
| `notifications`    | `idx_notifications_tenant_user_status`  | `(tenant_id, user_id, status)`                | B-TREE           |
| `notifications`    | `idx_notifications_tenant_user_created` | `(tenant_id, user_id, created_at DESC)`       | B-TREE           |
| `search_documents` | `idx_search_documents_vector`           | `(search_vector)`                             | GIN              |
| `search_documents` | `uq_search_documents_tenant_type_doc`   | `(tenant_id, type, document_id)`              | UNIQUE           |
| `search_documents` | `idx_search_documents_tenant_type`      | `(tenant_id, type)`                           | B-TREE           |

### 2.4 Prisma Schema Additions

```prisma
// packages/database/prisma/schema.prisma — additions

enum JobStatus {
  PENDING
  QUEUED
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
  SCHEDULED
}

enum NotificationChannel {
  EMAIL
  PUSH
  IN_APP
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
  READ
}

model Job {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String    @map("tenant_id") @db.VarChar(255)
  name           String    @db.VarChar(255)
  pluginId       String?   @map("plugin_id") @db.VarChar(255)
  status         JobStatus @default(PENDING)
  payload        Json      @default("{}")
  result         Json?
  error          String?   @db.Text
  retries        Int       @default(0)
  maxRetries     Int       @default(3) @map("max_retries")
  cronExpression String?   @map("cron_expression") @db.VarChar(100)
  scheduledAt    DateTime? @map("scheduled_at") @db.Timestamptz
  startedAt      DateTime? @map("started_at") @db.Timestamptz
  completedAt    DateTime? @map("completed_at") @db.Timestamptz
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, status], map: "idx_jobs_tenant_status")
  @@index([tenantId, name], map: "idx_jobs_tenant_name")
  @@map("jobs")
}

model Notification {
  id        String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String             @map("tenant_id") @db.VarChar(255)
  userId    String             @map("user_id") @db.VarChar(255)
  channel   NotificationChannel
  status    NotificationStatus @default(PENDING)
  title     String             @db.VarChar(500)
  body      String             @db.Text
  metadata  Json?
  readAt    DateTime?          @map("read_at") @db.Timestamptz
  createdAt DateTime           @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime           @updatedAt @map("updated_at") @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId, userId, status], map: "idx_notifications_tenant_user_status")
  @@index([tenantId, userId, createdAt(sort: Desc)], map: "idx_notifications_tenant_user_created")
  @@map("notifications")
}

model SearchDocument {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.VarChar(255)
  documentId   String   @map("document_id") @db.VarChar(255)
  type         String   @db.VarChar(100)
  title        String   @db.VarChar(500)
  body         String   @default("") @db.Text
  metadata     Json?
  // search_vector is a generated column — created via raw migration SQL
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, type, documentId], map: "uq_search_documents_tenant_type_doc")
  @@index([tenantId, type], map: "idx_search_documents_tenant_type")
  @@map("search_documents")
}
```

### 2.5 Migrations

Three migrations created in order:

1. **`YYYYMMDD_001_create_jobs`** (T007-02)
   - Create `job_status` enum
   - Create `jobs` table with all columns
   - Create `idx_jobs_tenant_status`, `idx_jobs_tenant_name` indexes
   - Create partial index on `scheduled_at` for SCHEDULED jobs

2. **`YYYYMMDD_002_create_notifications`** (T007-03)
   - Create `notification_channel`, `notification_status` enums
   - Create `notifications` table with all columns
   - Create `idx_notifications_tenant_user_status`, `idx_notifications_tenant_user_created` indexes

3. **`YYYYMMDD_003_create_search_documents`** (T007-04)
   - Create `search_documents` table with all columns
   - Add generated column `search_vector` via raw SQL:
     ```sql
     ALTER TABLE search_documents
     ADD COLUMN search_vector tsvector
     GENERATED ALWAYS AS (
       setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
       setweight(to_tsvector('english', coalesce(body, '')), 'B')
     ) STORED;
     ```
   - Create GIN index on `search_vector`
   - Create unique constraint `uq_search_documents_tenant_type_doc`
   - Create `idx_search_documents_tenant_type` index

All migrations are backward-compatible (additive only — no DROP or ALTER of
existing tables). Per Art. 9.1.

---

## 3. API Endpoints

All endpoints under `/api/v1/`, require Bearer authentication (Art. 5.1),
and use the standard error format per Art. 6.2:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {}
  }
}
```

### 3.1 Storage Endpoints

#### POST `/api/v1/storage/upload`

- **Description**: Upload a file to the tenant's MinIO bucket.
- **Auth**: Bearer (any authenticated user with `storage:write`)
- **Content-Type**: `multipart/form-data`
- **Request**: Form fields: `file` (binary), `path` (string — destination path)
- **Response (201)**:
  ```json
  {
    "name": "contract-v2.pdf",
    "path": "attachments/deals/contract-v2.pdf",
    "size": 2621440,
    "contentType": "application/pdf",
    "bucket": "tenant-acme-corp",
    "uploadedAt": "2026-03-02T10:15:00Z"
  }
  ```
- **Error Responses**:

  | Status | Code                  | When                                             |
  | ------ | --------------------- | ------------------------------------------------ |
  | 400    | `INVALID_PATH`        | Path contains `..` or is absolute (Edge Case #8) |
  | 401    | `UNAUTHORIZED`        | Missing or invalid Bearer token                  |
  | 413    | `FILE_TOO_LARGE`      | File exceeds tenant limit (Edge Case #1)         |
  | 503    | `STORAGE_UNAVAILABLE` | MinIO unreachable after 3 retries (Edge Case #2) |

- **Task**: T007-13
- **FR**: FR-001, FR-002

#### GET `/api/v1/storage/download/:path`

- **Description**: Download a file from the tenant's bucket. Streams response.
- **Auth**: Bearer (`storage:read`)
- **Response (200)**: Binary stream with `Content-Disposition: attachment; filename="..."` header
- **Error Responses**:

  | Status | Code             | When                          |
  | ------ | ---------------- | ----------------------------- |
  | 400    | `INVALID_PATH`   | Path traversal attempt        |
  | 401    | `UNAUTHORIZED`   | Missing or invalid token      |
  | 404    | `FILE_NOT_FOUND` | File does not exist in bucket |

- **Task**: T007-13
- **FR**: FR-001

#### DELETE `/api/v1/storage/:path`

- **Description**: Delete a file from the tenant's bucket.
- **Auth**: Bearer (`storage:delete`)
- **Response (204)**: No content
- **Error Responses**:

  | Status | Code             | When                     |
  | ------ | ---------------- | ------------------------ |
  | 400    | `INVALID_PATH`   | Path traversal attempt   |
  | 401    | `UNAUTHORIZED`   | Missing or invalid token |
  | 404    | `FILE_NOT_FOUND` | File does not exist      |

- **Task**: T007-13
- **FR**: FR-001

#### GET `/api/v1/storage/list`

- **Description**: List files in the tenant's bucket by prefix.
- **Auth**: Bearer (`storage:read`)
- **Query**: `?prefix=attachments/deals/` (optional)
- **Response (200)**:
  ```json
  {
    "files": [
      {
        "name": "contract-v2.pdf",
        "path": "attachments/deals/contract-v2.pdf",
        "size": 2621440,
        "contentType": "application/pdf",
        "lastModified": "2026-03-02T10:15:00Z"
      }
    ]
  }
  ```
- **Task**: T007-13
- **FR**: FR-001

#### GET `/api/v1/storage/signed-url/:path`

- **Description**: Generate a pre-signed download URL. Target < 10ms P95 (NFR-002).
- **Auth**: Bearer (`storage:read`)
- **Query**: `?expiresIn=3600` (seconds, default 3600)
- **Response (200)**:
  ```json
  {
    "url": "https://minio.plexica.io/tenant-acme-corp/attachments/...",
    "expiresAt": "2026-03-02T11:15:00Z"
  }
  ```
- **Task**: T007-13
- **FR**: FR-001, FR-003

### 3.2 Notification Endpoints

#### POST `/api/v1/notifications`

- **Description**: Send a single notification (email, push, or in-app).
- **Auth**: Bearer (`notifications:write`)
- **Request**:
  ```json
  {
    "userId": "user-123",
    "channel": "IN_APP",
    "title": "Deal moved to Closed Won",
    "body": "The deal 'Acme Enterprise' has been moved to Closed Won.",
    "metadata": {
      "link": "/crm/deals/deal-456",
      "plugin": "crm"
    }
  }
  ```
- **Response (201)**:
  ```json
  {
    "id": "notif-789",
    "status": "PENDING"
  }
  ```
- **Error Responses**:

  | Status | Code               | When                         |
  | ------ | ------------------ | ---------------------------- |
  | 400    | `INVALID_CHANNEL`  | Unknown notification channel |
  | 400    | `VALIDATION_ERROR` | Missing required fields      |
  | 401    | `UNAUTHORIZED`     | Missing or invalid token     |

- **Task**: T007-14
- **FR**: FR-004

#### POST `/api/v1/notifications/bulk`

- **Description**: Send bulk notifications asynchronously via job queue.
- **Auth**: Bearer (`notifications:write`)
- **Request**:
  ```json
  {
    "notifications": [
      {
        "userId": "user-123",
        "channel": "IN_APP",
        "title": "New lead assigned",
        "body": "Sarah Connor has been assigned to you."
      },
      {
        "userId": "user-456",
        "channel": "EMAIL",
        "title": "Weekly Report",
        "body": "Your weekly sales report is ready.",
        "template": "REPORT_READY",
        "templateData": { "reportUrl": "/reports/weekly-2026-03-01" }
      }
    ]
  }
  ```
- **Response (202)**:
  ```json
  {
    "jobId": "job-bulk-001",
    "count": 2,
    "status": "QUEUED"
  }
  ```
- **Task**: T007-14
- **FR**: FR-004, FR-005

#### GET `/api/v1/notifications`

- **Description**: List recent in-app notifications for the authenticated user.
  Used by `NotificationBell` component.
- **Auth**: Bearer (any authenticated user)
- **Query**: `?limit=10&unread=true`
- **Response (200)**:
  ```json
  {
    "notifications": [
      {
        "id": "notif-789",
        "title": "Deal moved to Closed Won",
        "body": "The deal 'Acme Enterprise' has been moved to Closed Won.",
        "channel": "IN_APP",
        "status": "SENT",
        "metadata": { "link": "/crm/deals/deal-456", "plugin": "crm" },
        "createdAt": "2026-03-02T10:15:00Z",
        "readAt": null
      }
    ],
    "unreadCount": 3
  }
  ```
- **Task**: T007-14
- **FR**: FR-004, FR-005

#### PATCH `/api/v1/notifications/:id/read`

- **Description**: Mark a notification as read. Decrements unread count.
- **Auth**: Bearer (owner of notification)
- **Response (200)**:
  ```json
  {
    "id": "notif-789",
    "status": "READ",
    "readAt": "2026-03-02T10:20:00Z"
  }
  ```
- **Error Responses**:

  | Status | Code                     | When                                                  |
  | ------ | ------------------------ | ----------------------------------------------------- |
  | 404    | `NOTIFICATION_NOT_FOUND` | Notification doesn't exist or belongs to another user |

- **Task**: T007-14
- **FR**: FR-005

#### POST `/api/v1/notifications/mark-all-read`

- **Description**: Mark all in-app notifications as read for the authenticated user.
- **Auth**: Bearer (any authenticated user)
- **Response (200)**:
  ```json
  {
    "markedCount": 3
  }
  ```
- **Task**: T007-14
- **FR**: FR-005

### 3.3 Job Queue Endpoints

#### POST `/api/v1/jobs`

- **Description**: Enqueue a new background job. Target < 50ms P95 (NFR-003).
- **Auth**: Bearer (`jobs:write`, internal scope)
- **Request**:
  ```json
  {
    "name": "crm.export-contacts",
    "pluginId": "crm-v2",
    "payload": { "format": "csv", "filters": { "status": "active" } },
    "maxRetries": 3
  }
  ```
- **Response (201)**:
  ```json
  {
    "jobId": "job-abc-123",
    "status": "QUEUED"
  }
  ```
- **Task**: T007-15
- **FR**: FR-007

#### POST `/api/v1/jobs/schedule`

- **Description**: Schedule a recurring job with a cron expression.
- **Auth**: Bearer (`jobs:write`, internal scope)
- **Request**:
  ```json
  {
    "name": "crm.daily-digest",
    "pluginId": "crm-v2",
    "cronExpression": "0 0 * * *",
    "payload": { "type": "daily-summary" },
    "maxRetries": 3
  }
  ```
- **Response (201)**:
  ```json
  {
    "jobId": "job-sch-456",
    "status": "SCHEDULED",
    "nextRunAt": "2026-03-03T00:00:00Z"
  }
  ```
- **Error Responses**:

  | Status | Code           | When                                   |
  | ------ | -------------- | -------------------------------------- |
  | 400    | `INVALID_CRON` | Invalid cron expression (Edge Case #5) |

- **Task**: T007-15
- **FR**: FR-007, FR-009

#### GET `/api/v1/jobs/:id/status`

- **Description**: Get the current status of a job.
- **Auth**: Bearer (`jobs:read`, internal scope)
- **Response (200)**:
  ```json
  {
    "id": "job-abc-123",
    "name": "crm.export-contacts",
    "status": "RUNNING",
    "retries": 0,
    "maxRetries": 3,
    "startedAt": "2026-03-02T10:15:00Z",
    "completedAt": null,
    "error": null
  }
  ```
- **Task**: T007-15
- **FR**: FR-007

#### DELETE `/api/v1/jobs/:id`

- **Description**: Cancel a queued or scheduled job.
- **Auth**: Bearer (`jobs:write`, internal scope)
- **Response (200)**:
  ```json
  {
    "id": "job-abc-123",
    "status": "CANCELLED"
  }
  ```
- **Error Responses**:

  | Status | Code                  | When                                |
  | ------ | --------------------- | ----------------------------------- |
  | 400    | `JOB_NOT_CANCELLABLE` | Job is already RUNNING or COMPLETED |
  | 404    | `JOB_NOT_FOUND`       | Job does not exist                  |

- **Task**: T007-15
- **FR**: FR-007

#### GET `/api/v1/jobs`

- **Description**: Paginated list of jobs for the tenant. Used by Job Dashboard.
- **Auth**: Bearer (`admin:jobs:read`)
- **Query**: `?status=FAILED&plugin=crm&page=1&limit=50`
- **Response (200)**:
  ```json
  {
    "jobs": [
      {
        "id": "job-abc-123",
        "name": "crm.export-contacts",
        "pluginId": "crm-v2",
        "status": "FAILED",
        "retries": 3,
        "maxRetries": 3,
        "error": "Timeout after 30 seconds",
        "startedAt": "2026-03-02T03:47:12Z",
        "completedAt": "2026-03-02T03:47:42Z",
        "createdAt": "2026-03-02T03:47:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
  ```
- **Task**: T007-15
- **FR**: FR-007, FR-008

#### POST `/api/v1/jobs/:id/retry`

- **Description**: Re-enqueue a failed job. Resets retries to 0.
- **Auth**: Bearer (`admin:jobs:write`)
- **Response (200)**:
  ```json
  {
    "id": "job-abc-123",
    "status": "QUEUED"
  }
  ```
- **Error Responses**:

  | Status | Code                | When                        |
  | ------ | ------------------- | --------------------------- |
  | 400    | `JOB_NOT_RETRYABLE` | Job is not in FAILED status |

- **Task**: T007-15
- **FR**: FR-007

#### PATCH `/api/v1/jobs/:id/schedule/disable`

- **Description**: Disable a recurring job's cron schedule.
- **Auth**: Bearer (`admin:jobs:write`)
- **Response (200)**:
  ```json
  {
    "id": "job-sch-456",
    "status": "CANCELLED",
    "cronExpression": null
  }
  ```
- **Task**: T007-15
- **FR**: FR-009

### 3.4 Search Endpoints

#### POST `/api/v1/search`

- **Description**: Full-text search across indexed documents. Scoped to tenant.
  Target < 100ms P95 for ≤10K documents (NFR-004).
- **Auth**: Bearer (any authenticated user)
- **Request**:
  ```json
  {
    "q": "john",
    "type": "crm:contact",
    "limit": 20
  }
  ```
- **Response (200)**:
  ```json
  {
    "results": [
      {
        "documentId": "contact-123",
        "type": "crm:contact",
        "title": "John Smith",
        "body": "Acme Sales representative...",
        "metadata": { "email": "john.smith@acme.com", "link": "/crm/contacts/123" },
        "relevance": 0.95
      }
    ],
    "total": 6,
    "groups": {
      "crm:contact": 3,
      "crm:deal": 1,
      "storage:file": 2
    }
  }
  ```
- **Task**: T007-16
- **FR**: FR-011, FR-013, FR-014

#### POST `/api/v1/search/index`

- **Description**: Index or upsert a document into the search index.
- **Auth**: Bearer (`search:write`, internal scope)
- **Request**:
  ```json
  {
    "documentId": "contact-123",
    "type": "crm:contact",
    "title": "John Smith",
    "body": "Acme Sales representative. john.smith@acme.com",
    "metadata": { "email": "john.smith@acme.com", "link": "/crm/contacts/123" }
  }
  ```
- **Response (201)**:
  ```json
  {
    "id": "doc-uuid-001",
    "indexed": true
  }
  ```
- **Task**: T007-16
- **FR**: FR-011

#### DELETE `/api/v1/search/:id`

- **Description**: Remove a document from the search index.
- **Auth**: Bearer (`search:write`, internal scope)
- **Response (204)**: No content
- **Task**: T007-16
- **FR**: FR-011

#### POST `/api/v1/search/reindex`

- **Description**: Trigger a background reindex of all documents of a given type.
  Returns immediately with a job ID (async via Job Queue).
- **Auth**: Bearer (`search:write`, internal scope)
- **Request**:
  ```json
  {
    "type": "crm:contact"
  }
  ```
- **Response (202)**:
  ```json
  {
    "jobId": "job-reindex-001",
    "status": "QUEUED",
    "message": "Reindex job enqueued for type crm:contact"
  }
  ```
- **Task**: T007-16
- **FR**: FR-011 (Edge Case #6)

### 3.5 SSE Endpoint

#### GET `/api/v1/notifications/stream`

- **Description**: Server-Sent Events endpoint for real-time notification and
  job status updates. Per ADR-023.
- **Auth**: Bearer (any authenticated user)
- **Headers**:
  - Response: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  - Request: `Last-Event-ID` (optional — for 5-minute replay on reconnect)
- **Event Types**:

  ```
  event: notification
  id: evt-001
  data: {"id":"notif-789","type":"deal_update","title":"Deal moved","unreadCount":4,"timestamp":"2026-03-02T10:15:00Z"}

  event: job_status
  id: evt-002
  data: {"jobId":"job-abc","name":"crm.export","status":"FAILED","tenantId":"acme-corp"}

  event: ping
  data: {}
  ```

- **Behavior**:
  - On connect: subscribe to Redis channel `notifications:{tenantId}:{userId}`
  - Ping every 30s to keep connection alive through proxies
  - On reconnect with `Last-Event-ID`: replay missed events from Redis sorted set (5-minute window)
  - On disconnect: unsubscribe Redis channel, clean up subscriber
  - Fastify: `connectionTimeout: 0` for this route
  - Nginx: `proxy_read_timeout 65s`
- **Task**: T007-17
- **ADR**: ADR-023

---

## 4. Component Design (Backend Services)

### 4.1 StorageService

- **Purpose**: Tenant-isolated file storage via MinIO/S3.
- **Location**: `apps/core-api/src/modules/storage/storage.service.ts`
- **Responsibilities**:
  - Upload/download/delete/list files scoped to `tenant-{tenantId}` bucket
  - Generate pre-signed URLs (< 10ms P95)
  - Path sanitization (reject `..`, absolute paths)
  - File size validation against tenant config
  - Retry with exponential backoff (3 attempts) on MinIO transient errors
  - Auto-provision bucket on first upload
- **Dependencies**: MinIO client (`minio` npm package — already approved in Art. 2.1)
- **Key Methods**:

  | Method         | Parameters                          | Returns               | Description                                    |
  | -------------- | ----------------------------------- | --------------------- | ---------------------------------------------- |
  | `upload`       | `file: Buffer, path: string, opts?` | `Promise<FileInfo>`   | Upload to tenant bucket with path sanitization |
  | `download`     | `path: string`                      | `Promise<Buffer>`     | Download file from tenant bucket               |
  | `delete`       | `path: string`                      | `Promise<void>`       | Delete file from tenant bucket                 |
  | `list`         | `prefix: string`                    | `Promise<FileInfo[]>` | List files by prefix in tenant bucket          |
  | `getSignedUrl` | `path: string, expiresIn: number`   | `Promise<string>`     | Pre-signed URL via `presignedGetObject`        |

- **Key Query Patterns**:

  ```typescript
  // Tenant isolation — every method scopes to tenant bucket
  const bucket = `tenant-${tenantId}`;

  // Path sanitization — reject traversal attempts
  if (path.includes('..') || path.startsWith('/')) {
    throw new StorageError('INVALID_PATH', 'Path must be relative and cannot contain ..');
  }

  // Retry with exponential backoff
  async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (attempt === maxRetries - 1) throw err;
        await sleep(Math.pow(2, attempt) * 100);
      }
    }
  }
  ```

- **Task**: T007-06
- **FR**: FR-001, FR-002, FR-003
- **NFR**: NFR-001, NFR-002, NFR-007

### 4.2 NotificationService

- **Purpose**: Multi-channel notification delivery with template support.
- **Location**: `apps/core-api/src/modules/notifications/notification.service.ts`
- **Responsibilities**:
  - Send individual notifications (email, push, in-app)
  - Bulk notifications via job queue (async)
  - Template rendering (`{{variable}}` substitution)
  - Persist in-app notifications to DB
  - Publish SSE events via Redis pub/sub after DB insert
  - Retry email delivery (3 attempts, exponential backoff)
  - No retry for invalid email addresses (Edge Case #3)
- **Dependencies**: Nodemailer (SMTP), Prisma, JobQueueService, Redis pub/sub
- **Key Methods**:

  | Method     | Parameters                                   | Returns           | Description                            |
  | ---------- | -------------------------------------------- | ----------------- | -------------------------------------- |
  | `send`     | `notification: Notification`                 | `Promise<void>`   | Route to appropriate channel handler   |
  | `sendBulk` | `notifications: Notification[]`              | `Promise<string>` | Enqueue as bulk job, return job ID     |
  | `email`    | `to: string, template: string, data: object` | `Promise<void>`   | Send email via SMTP with template      |
  | `push`     | `userId: string, message: PushMessage`       | `Promise<void>`   | Stub — placeholder for Firebase (MVP)  |
  | `inApp`    | `userId: string, message: InAppMessage`      | `Promise<void>`   | Insert DB record + PUBLISH Redis event |

- **Key Query Patterns**:

  ```typescript
  // In-app notification: insert + publish SSE
  async inApp(userId: string, message: InAppMessage): Promise<void> {
    const notification = await this.db.notification.create({
      data: {
        tenantId: this.tenantId,
        userId,
        channel: 'IN_APP',
        status: 'SENT',
        title: message.title,
        body: message.body,
        metadata: message.metadata,
      },
    });

    // Publish to Redis for SSE delivery (ADR-023)
    await this.redis.publish(
      `notifications:${this.tenantId}:${userId}`,
      JSON.stringify({
        type: 'notification',
        data: { id: notification.id, ...message, unreadCount: await this.getUnreadCount(userId) },
      })
    );
  }
  ```

- **Task**: T007-07
- **FR**: FR-004, FR-005, FR-006
- **NFR**: NFR-005

### 4.3 JobQueueService

- **Purpose**: Async and scheduled task execution with tenant context.
- **Location**: `apps/core-api/src/modules/jobs/job-queue.service.ts`
- **Responsibilities**:
  - Enqueue jobs to BullMQ queue (< 50ms P95)
  - Schedule recurring jobs via cron expressions
  - Cancel queued/scheduled jobs
  - Track job lifecycle in PostgreSQL `jobs` table
  - Validate cron expressions (reject invalid — Edge Case #5)
  - Ensure `tenantId` in every job payload (FR-010)
  - At-least-once delivery via BullMQ acknowledgement (NFR-006)
- **Dependencies**: BullMQ, Redis (ioredis), Prisma, `cron-parser`
- **Key Methods**:

  | Method      | Parameters                         | Returns              | Description                             |
  | ----------- | ---------------------------------- | -------------------- | --------------------------------------- |
  | `enqueue`   | `job: Job`                         | `Promise<string>`    | Add job to BullMQ queue, return job ID  |
  | `schedule`  | `job: Job, cronExpression: string` | `Promise<string>`    | Schedule recurring job with cron        |
  | `cancel`    | `jobId: string`                    | `Promise<void>`      | Remove job from queue, update DB status |
  | `getStatus` | `jobId: string`                    | `Promise<JobStatus>` | Return current job status from DB       |

- **Key Patterns**:

  ```typescript
  // Cron validation using cron-parser
  import { parseExpression } from 'cron-parser';

  function validateCron(expression: string): void {
    try {
      parseExpression(expression);
    } catch {
      throw new JobError('INVALID_CRON', `Invalid cron expression: ${expression}`);
    }
  }

  // Tenant context enforcement
  async enqueue(job: Job): Promise<string> {
    if (!job.tenantId) {
      throw new JobError('MISSING_TENANT', 'tenantId is required for all jobs');
    }
    // ... BullMQ add + DB insert
  }
  ```

- **Task**: T007-08
- **FR**: FR-007, FR-008, FR-009, FR-010
- **NFR**: NFR-003, NFR-006

### 4.4 SearchService

- **Purpose**: Full-text search using PostgreSQL FTS with tenant isolation.
- **Location**: `apps/core-api/src/modules/search/search.service.ts`
- **Responsibilities**:
  - Index documents (upsert with `ON CONFLICT` on unique constraint)
  - Full-text search with `ts_rank` + `to_tsquery` and tenant scoping
  - Type filtering (FR-014)
  - Delete documents from index
  - Reindex by type (enqueue background job)
  - Target < 100ms P95 for ≤10K documents (NFR-004)
- **Dependencies**: Prisma (`$queryRaw`), JobQueueService
- **Key Methods**:

  | Method    | Parameters            | Returns                 | Description                              |
  | --------- | --------------------- | ----------------------- | ---------------------------------------- |
  | `index`   | `document: Indexable` | `Promise<void>`         | Upsert document into search_documents    |
  | `search`  | `query: SearchQuery`  | `Promise<SearchResult>` | FTS query with ranking and type grouping |
  | `delete`  | `documentId: string`  | `Promise<void>`         | Remove document from index               |
  | `reindex` | `type: string`        | `Promise<string>`       | Enqueue reindex job, return job ID       |

- **Key Query Patterns**:

  ```sql
  -- Search query (always scoped to tenant)
  SELECT
    document_id, type, title, body, metadata,
    ts_rank(search_vector, to_tsquery('english', $2)) AS relevance
  FROM search_documents
  WHERE tenant_id = $1
    AND search_vector @@ to_tsquery('english', $2)
    AND ($3::varchar IS NULL OR type = $3)
  ORDER BY relevance DESC
  LIMIT $4;

  -- Upsert on conflict
  INSERT INTO search_documents (tenant_id, document_id, type, title, body, metadata)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (tenant_id, type, document_id)
  DO UPDATE SET title = $4, body = $5, metadata = $6, updated_at = now();
  ```

- **Task**: T007-09
- **FR**: FR-011, FR-012, FR-013, FR-014
- **NFR**: NFR-004, NFR-008

### 4.5 NotificationTemplateEngine

- **Purpose**: Simple `{{variable}}` template rendering for notification content.
- **Location**: `apps/core-api/src/modules/notifications/notification-template.ts`
- **Key Method**:

  | Method           | Parameters                                        | Returns  | Description                        |
  | ---------------- | ------------------------------------------------- | -------- | ---------------------------------- |
  | `renderTemplate` | `template: string, data: Record<string, unknown>` | `string` | Replace `{{key}}` with data values |

- **Built-in Templates**:
  - `NEW_LEAD_ASSIGNED` — "New lead {{leadName}} assigned to you"
  - `DEAL_STATUS_CHANGED` — "Deal '{{dealName}}' moved to {{newStage}}"
  - `REPORT_READY` — "Your {{reportType}} report is ready to download"
- **Task**: T007-10
- **FR**: FR-006

### 4.6 JobWorker

- **Purpose**: BullMQ worker that processes jobs from the queue.
- **Location**: `apps/core-api/src/modules/jobs/job-worker.ts`
- **Responsibilities**:
  - Start BullMQ `Worker` with configurable concurrency (`QUEUE_CONCURRENCY`, default 5)
  - Validate `tenantId` on every job before dispatch
  - Dispatch to registered job handlers via `JobHandlerRegistry`
  - Update `jobs` DB table on status transitions
  - Log lifecycle events with Pino (Art. 6.3)
  - Handle crash/restart via BullMQ `lockDuration` (Edge Case #4)
  - Publish `job_status` SSE events on state transitions
- **Task**: T007-11
- **FR**: FR-008
- **NFR**: NFR-006

### 4.7 BucketProvisioner

- **Purpose**: Auto-provision MinIO bucket for new tenants.
- **Location**: `apps/core-api/src/modules/storage/bucket-provisioner.ts`
- **Key Method**:

  | Method                  | Parameters         | Returns         | Description                              |
  | ----------------------- | ------------------ | --------------- | ---------------------------------------- |
  | `provisionTenantBucket` | `tenantId: string` | `Promise<void>` | Create `tenant-{id}` bucket (idempotent) |

- **Behavior**: Called from tenant creation lifecycle. Failure is logged but
  does not block tenant creation (non-blocking, fire-and-forget).
- **Task**: T007-12
- **FR**: FR-002

### 4.8 Notification Repository

- **Purpose**: Data access layer for notification DB operations.
- **Location**: `apps/core-api/src/modules/notifications/notification.repository.ts`
- **Key Methods**:

  | Method           | Parameters                    | Returns                   | Description                       |
  | ---------------- | ----------------------------- | ------------------------- | --------------------------------- |
  | `create`         | `data: CreateNotificationDto` | `Promise<Notification>`   | Insert notification record        |
  | `findForUser`    | `userId, tenantId, opts`      | `Promise<Notification[]>` | List user's notifications         |
  | `getUnreadCount` | `userId, tenantId`            | `Promise<number>`         | Count unread in-app notifications |
  | `markAsRead`     | `id, userId, tenantId`        | `Promise<Notification>`   | Set status=READ, readAt=now()     |
  | `markAllAsRead`  | `userId, tenantId`            | `Promise<number>`         | Bulk mark-as-read, return count   |

- **Task**: T007-07
- **FR**: FR-004, FR-005

### 4.9 Job Repository

- **Purpose**: Data access layer for job DB operations.
- **Location**: `apps/core-api/src/modules/jobs/job.repository.ts`
- **Key Methods**:

  | Method         | Parameters                    | Returns                  | Description                            |
  | -------------- | ----------------------------- | ------------------------ | -------------------------------------- |
  | `create`       | `data: CreateJobDto`          | `Promise<Job>`           | Insert job record                      |
  | `updateStatus` | `id, status, error?, result?` | `Promise<Job>`           | Update job status + timestamps         |
  | `findByTenant` | `tenantId, filters, page`     | `Promise<PaginatedJobs>` | Paginated list for dashboard           |
  | `getStats`     | `tenantId`                    | `Promise<JobStats>`      | Running/Queued/Failed/Completed counts |
  | `findById`     | `id, tenantId`                | `Promise<Job>`           | Get single job with tenant check       |

- **Task**: T007-08
- **FR**: FR-007, FR-008

---

## 5. File Map

> All paths relative to project root.

### Files to Create

| Path                                                                                     | Purpose                                     | Task    | Est. Size |
| ---------------------------------------------------------------------------------------- | ------------------------------------------- | ------- | --------- |
| `apps/core-api/src/types/core-services.types.ts`                                         | Shared TypeScript interfaces for 4 services | T007-01 | M         |
| `packages/database/prisma/migrations/YYYYMMDD_001_create_jobs/migration.sql`             | Jobs table + enum + indexes                 | T007-02 | S         |
| `packages/database/prisma/migrations/YYYYMMDD_002_create_notifications/migration.sql`    | Notifications table + enums + indexes       | T007-03 | S         |
| `packages/database/prisma/migrations/YYYYMMDD_003_create_search_documents/migration.sql` | Search docs table + tsvector + GIN          | T007-04 | S         |
| `apps/core-api/src/modules/storage/storage.service.ts`                                   | StorageService (MinIO adapter)              | T007-06 | L         |
| `apps/core-api/src/modules/storage/storage.types.ts`                                     | Storage-specific type re-exports            | T007-06 | S         |
| `apps/core-api/src/modules/storage/storage.routes.ts`                                    | Storage REST endpoints                      | T007-13 | M         |
| `apps/core-api/src/modules/storage/bucket-provisioner.ts`                                | Tenant bucket auto-provisioning             | T007-12 | S         |
| `apps/core-api/src/modules/notifications/notification.service.ts`                        | NotificationService (email, push, inApp)    | T007-07 | L         |
| `apps/core-api/src/modules/notifications/notification.repository.ts`                     | Notification data access layer              | T007-07 | M         |
| `apps/core-api/src/modules/notifications/notification-template.ts`                       | Template engine + built-in templates        | T007-10 | S         |
| `apps/core-api/src/modules/notifications/notification.routes.ts`                         | Notification REST endpoints                 | T007-14 | M         |
| `apps/core-api/src/modules/notifications/notification-stream.routes.ts`                  | SSE endpoint per ADR-023                    | T007-17 | M         |
| `apps/core-api/src/modules/jobs/job-queue.service.ts`                                    | JobQueueService (BullMQ adapter)            | T007-08 | L         |
| `apps/core-api/src/modules/jobs/job.repository.ts`                                       | Job data access layer                       | T007-08 | M         |
| `apps/core-api/src/modules/jobs/job-worker.ts`                                           | BullMQ Worker + JobHandlerRegistry          | T007-11 | M         |
| `apps/core-api/src/modules/jobs/jobs.routes.ts`                                          | Job Queue REST endpoints                    | T007-15 | M         |
| `apps/core-api/src/modules/search/search.service.ts`                                     | SearchService (PostgreSQL FTS)              | T007-09 | L         |
| `apps/core-api/src/modules/search/search.routes.ts`                                      | Search REST endpoints                       | T007-16 | M         |
| `packages/ui/src/components/SearchOverlay/SearchOverlay.tsx`                             | Search overlay component                    | T007-24 | L         |
| `packages/ui/src/components/SearchOverlay/SearchOverlay.stories.tsx`                     | Storybook stories for SearchOverlay         | T007-24 | M         |
| `packages/ui/src/components/SearchOverlay/index.ts`                                      | Barrel export                               | T007-24 | S         |
| `packages/ui/src/components/NotificationBell/NotificationBell.tsx`                       | Notification bell + dropdown                | T007-25 | L         |
| `packages/ui/src/components/NotificationBell/NotificationBell.stories.tsx`               | Storybook stories                           | T007-25 | M         |
| `packages/ui/src/components/NotificationBell/index.ts`                                   | Barrel export                               | T007-25 | S         |
| `packages/ui/src/components/FileUploadZone/FileUploadZone.tsx`                           | File upload with drag-and-drop              | T007-26 | L         |
| `packages/ui/src/components/FileUploadZone/FileUploadZone.stories.tsx`                   | Storybook stories                           | T007-26 | M         |
| `packages/ui/src/components/FileUploadZone/index.ts`                                     | Barrel export                               | T007-26 | S         |
| `packages/ui/src/components/FileListItem/FileListItem.tsx`                               | File list row component                     | T007-27 | M         |
| `packages/ui/src/components/FileListItem/FileListItem.stories.tsx`                       | Storybook stories                           | T007-27 | S         |
| `packages/ui/src/components/FileListItem/index.ts`                                       | Barrel export                               | T007-27 | S         |
| `packages/ui/src/components/JobDetailPanel/JobDetailPanel.tsx`                           | Expandable job detail panel                 | T007-28 | M         |
| `packages/ui/src/components/JobDetailPanel/JobDetailPanel.stories.tsx`                   | Storybook stories                           | T007-28 | M         |
| `packages/ui/src/components/JobDetailPanel/index.ts`                                     | Barrel export                               | T007-28 | S         |
| `packages/ui/src/components/JobStatusBadge/JobStatusBadge.tsx`                           | Job status badge (extends StatusBadge)      | T007-29 | S         |
| `packages/ui/src/components/JobStatusBadge/index.ts`                                     | Barrel export                               | T007-29 | S         |
| `apps/web/src/pages/admin.jobs.tsx`                                                      | Job Status Dashboard page                   | T007-30 | L         |
| `apps/web/src/hooks/useNotificationStream.ts`                                            | SSE client hook for notifications           | T007-34 | M         |
| `apps/web/src/hooks/useJobStatusStream.ts`                                               | SSE client hook for job status              | T007-35 | M         |
| `apps/core-api/src/__tests__/unit/storage/storage.service.test.ts`                       | Unit tests: StorageService                  | T007-36 | M         |
| `apps/core-api/src/__tests__/unit/notifications/notification.service.test.ts`            | Unit tests: NotificationService             | T007-37 | M         |
| `apps/core-api/src/__tests__/unit/jobs/job-queue.service.test.ts`                        | Unit tests: JobQueueService                 | T007-38 | M         |
| `apps/core-api/src/__tests__/unit/search/search.service.test.ts`                         | Unit tests: SearchService                   | T007-39 | M         |
| `apps/core-api/src/__tests__/integration/storage/storage.routes.test.ts`                 | Integration tests: Storage API              | T007-40 | L         |
| `apps/core-api/src/__tests__/integration/notifications/notification.routes.test.ts`      | Integration tests: Notification API         | T007-41 | M         |
| `apps/core-api/src/__tests__/integration/jobs/jobs.routes.test.ts`                       | Integration tests: Job Queue API            | T007-42 | L         |
| `apps/core-api/src/__tests__/integration/search/search.routes.test.ts`                   | Integration tests: Search API               | T007-43 | M         |
| `apps/web/src/test/SearchOverlay.test.tsx`                                               | Component tests: SearchOverlay              | T007-44 | M         |
| `apps/web/src/test/NotificationBell.test.tsx`                                            | Component tests: NotificationBell           | T007-44 | M         |
| `apps/web/src/test/FileUploadZone.test.tsx`                                              | Component tests: FileUploadZone             | T007-45 | M         |
| `apps/web/src/test/FileListItem.test.tsx`                                                | Component tests: FileListItem               | T007-45 | S         |
| `apps/web/src/test/admin.jobs.test.tsx`                                                  | Component tests: Job Dashboard              | T007-46 | M         |
| `apps/web/src/test/JobDetailPanel.test.tsx`                                              | Component tests: JobDetailPanel             | T007-46 | M         |
| `apps/web/src/test/e2e/core-services.e2e.test.ts`                                        | E2E tests: 4 user journeys                  | T007-47 | L         |

### Files to Modify

| Path                                                             | Change Description                                           | Task             | Est. Effort |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ---------------- | ----------- |
| `packages/database/prisma/schema.prisma`                         | Add 3 models, 3 enums (see §2.4)                             | T007-02–04       | M           |
| `apps/core-api/src/types/index.ts`                               | Re-export core-services.types.ts                             | T007-01          | S           |
| `apps/core-api/src/index.ts`                                     | Register 5 route plugins, 4 service decorators, worker start | T007-18–22       | M           |
| `apps/core-api/src/index.ts` (health)                            | Extend `/health` with MinIO, Redis, search checks            | T007-23          | S           |
| `packages/ui/src/styles/tokens.css`                              | Add 10 new design tokens (§7.10)                             | T007-05          | S           |
| `apps/web/src/components/shell/Header.tsx`                       | Add SearchOverlay trigger + NotificationBell                 | T007-31, T007-32 | M           |
| `apps/web/src/components/shell/Sidebar.tsx`                      | Add "Jobs" admin navigation link                             | T007-33          | S           |
| `apps/core-api/src/modules/storage/storage.routes.ts`            | Add OpenAPI schemas (polish)                                 | T007-48          | S           |
| `apps/core-api/src/modules/notifications/notification.routes.ts` | Add OpenAPI schemas (polish)                                 | T007-48          | S           |
| `apps/core-api/src/modules/jobs/jobs.routes.ts`                  | Add OpenAPI schemas (polish)                                 | T007-48          | S           |
| `apps/core-api/src/modules/search/search.routes.ts`              | Add OpenAPI schemas (polish)                                 | T007-48          | S           |

### Files to Delete

None.

### Files to Reference (Read-only)

| Path                                                          | Purpose                                      |
| ------------------------------------------------------------- | -------------------------------------------- |
| `.forge/constitution.md`                                      | Validate all decisions against constitution  |
| `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md` | SSE architecture reference                   |
| `apps/core-api/src/middleware/auth.ts`                        | Authentication middleware integration        |
| `apps/core-api/src/middleware/tenant-context.ts`              | Tenant context extraction pattern            |
| `apps/core-api/src/lib/redis.ts`                              | Existing Redis connection configuration      |
| `test-infrastructure/docker-compose.yml`                      | MinIO, Redis, PostgreSQL test infrastructure |
| `packages/ui/src/components/StatusBadge/`                     | Base component to extend for JobStatusBadge  |

---

## 6. SSE Architecture (ADR-023)

### 6.1 Server-Side Implementation

Per ADR-023, the SSE endpoint lives at `GET /api/v1/notifications/stream` and
is implemented in `notification-stream.routes.ts`.

```
┌──────────────────────────────────────────────────────────────┐
│                     SSE Connection Lifecycle                   │
│                                                                │
│  1. Client opens EventSource(url, { headers: { Auth }})       │
│  2. Fastify validates JWT → extracts userId, tenantId         │
│  3. Create Redis subscriber → SUBSCRIBE notifications:{t}:{u} │
│  4. Set response headers:                                      │
│     Content-Type: text/event-stream                            │
│     Cache-Control: no-cache                                    │
│     Connection: keep-alive                                     │
│  5. If Last-Event-ID present → replay from Redis sorted set   │
│  6. On Redis message → write SSE event to response stream     │
│  7. Ping every 30s → write ": ping\n\n"                       │
│  8. On client disconnect → UNSUBSCRIBE, clean up              │
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Redis Channel Convention

```
notifications:{tenantId}:{userId}
```

- **Published by**: `NotificationService.inApp()` after DB insert
- **Published by**: `JobWorker` on job status transitions (QUEUED → RUNNING → COMPLETED/FAILED)
- **Subscribed by**: SSE handler per connected user

### 6.3 Event Format

```
event: notification
id: evt-{uuid}
data: {"id":"notif-123","type":"deal_update","title":"Deal moved","plugin":"crm","unreadCount":3,"timestamp":"2026-02-28T10:15:00Z"}

event: job_status
id: evt-{uuid}
data: {"jobId":"job-abc","name":"crm.export-contacts","status":"FAILED","tenantId":"acme-corp"}

event: ping
data: {}
```

### 6.4 Replay Window

On reconnect, `EventSource` sends `Last-Event-ID` header. The server checks a
Redis sorted set (`sse:replay:{tenantId}:{userId}`) keyed by event ID with score
= timestamp. Events older than 5 minutes are trimmed. On replay:

```typescript
// Replay missed events
const lastId = request.headers['last-event-id'];
if (lastId) {
  const missedEvents = await redis.zrangebyscore(
    `sse:replay:${tenantId}:${userId}`,
    '-inf',
    '+inf'
  );
  for (const event of missedEvents) {
    const parsed = JSON.parse(event);
    if (parsed.id > lastId) {
      reply.raw.write(
        `event: ${parsed.type}\nid: ${parsed.id}\ndata: ${JSON.stringify(parsed.data)}\n\n`
      );
    }
  }
}
```

### 6.5 Fastify Configuration

```typescript
// connectionTimeout: 0 for SSE routes only
fastify.register(
  async (instance) => {
    instance.server.connectionTimeout = 0;
    instance.register(notificationStreamRoutes);
  },
  { prefix: '/api/v1' }
);
```

### 6.6 Infrastructure Requirements

- **Nginx**: `proxy_read_timeout 65s` (> 2× ping interval)
- **Redis**: Existing Redis instance. SSE adds ~1 subscriber per connected user.
  At 1000 concurrent users, Redis handles 1000 subscribers + 30s pings trivially.
- **HTTP/2**: Production deployment should use HTTP/2 to avoid 6-connection limit.

---

## 7. UX Component Architecture

### 7.1 SearchOverlay

- **Location**: `packages/ui/src/components/SearchOverlay/SearchOverlay.tsx`
- **Props**: `onSearch`, `onSelect`, `onClose`, `placeholder`, `recentSearches`
- **ARIA Pattern**: `dialog` + `combobox` + `listbox`
- **States**: idle → loading → results / no-results / error
- **Keyboard**: `/` opens, `Esc` closes, `↑↓` navigate, `Enter` selects
- **Responsive**: 640px desktop → full-screen mobile (<768px)
- **Design tokens**: `--search-overlay-width`, `--search-overlay-max-height`
- **Reuses**: `EmptyState`, `Skeleton`, `Alert`, `Spinner`, `Input`
- **Task**: T007-24

### 7.2 NotificationBell

- **Location**: `packages/ui/src/components/NotificationBell/NotificationBell.tsx`
- **Props**: `unreadCount`, `notifications`, `onNotificationClick`, `onMarkAllRead`, `maxVisible`
- **ARIA Pattern**: `button` + `menu` + `menuitem`
- **States**: closed → open-loading → open-with-notifications / open-empty / pulse / error
- **Real-time**: SSE-driven badge increment + pulse animation (2s, `--transition-fast`)
- **Responsive**: 360px dropdown desktop → full-width mobile (343px)
- **Design tokens**: `--notification-dot`, `--notification-dot-size`, `--notification-badge-bg`, `--notification-badge-fg`
- **Reuses**: `EmptyState`, `Skeleton`, `Alert`, `Badge`
- **Task**: T007-25

### 7.3 FileUploadZone

- **Location**: `packages/ui/src/components/FileUploadZone/FileUploadZone.tsx`
- **Props**: `onUpload`, `onCancel`, `onRetry`, `maxSize`, `accept`, `multiple`
- **ARIA Pattern**: `button` + `progressbar` + `alert`
- **States**: default → drag-hover → uploading → success / error-validation / error-api
- **Upload progress**: `XMLHttpRequest` `progress` event → `aria-valuenow`
- **Client-side validation**: Check `file.size > maxSize` before upload
- **Design tokens**: `--upload-progress-height`, `--upload-progress-bg`, `--upload-progress-fill`
- **Reuses**: `Progress`, `EmptyState`, `Alert`
- **Task**: T007-26

### 7.4 FileListItem

- **Location**: `packages/ui/src/components/FileListItem/FileListItem.tsx`
- **Props**: `file` (FileInfo), `onDownload`, `onDelete`
- **Variants**: default (table row) / compact (mobile card)
- **States**: default → hover → downloading
- **Reuses**: `Tooltip`, `Spinner`
- **Task**: T007-27

### 7.5 JobDetailPanel

- **Location**: `packages/ui/src/components/JobDetailPanel/JobDetailPanel.tsx`
- **Props**: `job`, `onRetry`, `onDisableSchedule`, `expanded`
- **ARIA**: `aria-expanded`, `aria-controls`, `role="region"`
- **States**: collapsed → expanded → retrying
- **Actions**: "Retry Now" (FAILED only), "Disable Schedule" (SCHEDULED only)
- **Reuses**: `Badge`, `Tooltip`, `Dialog`, `Spinner`
- **Task**: T007-28

### 7.6 JobStatusBadge

- **Location**: `packages/ui/src/components/JobStatusBadge/JobStatusBadge.tsx`
- **Extends**: `StatusBadge` from `@plexica/ui`
- **Props**: `status: JobStatus`
- **Mapping**: PENDING → Circle/grey, QUEUED → Clock/blue, RUNNING → Play/green,
  COMPLETED → CheckCircle/green, FAILED → XCircle/red, CANCELLED → Ban/grey,
  SCHEDULED → Clock/blue
- **A11y**: Text label always shown (never color-only)
- **Task**: T007-29

### 7.7 Job Status Dashboard Page

- **Location**: `apps/web/src/pages/admin.jobs.tsx`
- **Route**: `/admin/jobs` (protected by `admin:jobs:read`)
- **Layout**:
  - 4 `StatCard` components (Running / Queued / Failed / Completed today) — clickable, filter table
  - `Tabs` component (All / Running / Queued / Failed / Scheduled)
  - Filter: name `Input` (debounced 300ms) + plugin `Select`
  - `DataTable` with columns: Name, Plugin, Status (`JobStatusBadge`), Started/Duration
  - Expandable rows via `JobDetailPanel`
  - `Pagination` (50 per page)
- **Real-time**: `useJobStatusStream` hook updates stat cards + table badges live
- **Empty state**: `EmptyState` with queue icon
- **Permission guard**: Show 403 for non-admin users
- **Responsive**: 4-col → 2×2 → 3+1 stat cards; table → card list on mobile
- **Task**: T007-30

### 7.8 SSE Client Hook: `useNotificationStream`

- **Location**: `apps/web/src/hooks/useNotificationStream.ts`
- **API**: `GET /api/v1/notifications/stream` via `EventSource`
- **Returns**: `{ isConnected, error }`
- **Callbacks**: `onNotification(notification)`, `onError(error)`
- **Reconnect**: Browser `EventSource` auto-reconnect + fallback to 30s polling
- **Cleanup**: Close `EventSource` on unmount
- **Task**: T007-34

### 7.9 SSE Client Hook: `useJobStatusStream`

- **Location**: `apps/web/src/hooks/useJobStatusStream.ts`
- **API**: Same SSE endpoint (multiplexed), filter `event: job_status`
- **Returns**: `{ isConnected, lastEvent }`
- **Callbacks**: `onJobStatusChange({ jobId, status })`
- **Task**: T007-35

### 7.10 Design Tokens

10 new CSS custom properties added to `packages/ui/src/styles/tokens.css`:

| Token                         | Light     | Dark      | Usage                     |
| ----------------------------- | --------- | --------- | ------------------------- |
| `--notification-dot`          | `#2563EB` | `#60A5FA` | Unread indicator dot      |
| `--notification-dot-size`     | `8px`     | `8px`     | Dot diameter              |
| `--notification-badge-bg`     | `#DC2626` | `#EF4444` | Badge background (red)    |
| `--notification-badge-fg`     | `#FFFFFF` | `#FFFFFF` | Badge text (white)        |
| `--search-overlay-width`      | `640px`   | `640px`   | Overlay desktop width     |
| `--search-overlay-max-height` | `480px`   | `480px`   | Max height before scroll  |
| `--upload-progress-height`    | `8px`     | `8px`     | Progress bar track height |
| `--upload-progress-bg`        | `#E5E7EB` | `#374151` | Progress bar track        |
| `--upload-progress-fill`      | `#0066CC` | `#3B82F6` | Progress bar fill         |
| `--job-stat-card-min-width`   | `140px`   | `140px`   | Stat card minimum width   |

**Task**: T007-05

---

## 8. Dependencies

### 8.1 New Dependencies

| Package       | Version | Purpose                      | Weekly Downloads | ADR Required? |
| ------------- | ------- | ---------------------------- | ---------------- | ------------- |
| `bullmq`      | `^5.x`  | Job queue with Redis backend | ~500K            | Yes (below)   |
| `cron-parser` | `^4.x`  | Cron expression validation   | ~3M              | No (utility)  |
| `nodemailer`  | `^6.x`  | Email sending via SMTP       | ~2M              | No (standard) |

**Note on `bullmq`**: BullMQ is the most widely-used Node.js job queue library
with Redis backend. It provides at-least-once delivery, cron scheduling,
configurable concurrency, automatic retries with backoff, and dead-letter queue
support. Constitution Art. 2.2 requires ADR approval for new dependencies. This
plan asserts approval as the dependency meets all criteria: >1000 weekly
downloads (~500K), TypeScript-first, no known critical vulnerabilities, and no
viable alternative in the approved stack. A formal ADR should be created during
implementation if the team requires one.

**Note on MinIO client**: `minio` package is already in the approved stack
(Art. 2.1). No new approval needed.

### 8.2 Internal Dependencies

| Module/Package                                   | How This Feature Uses It                       |
| ------------------------------------------------ | ---------------------------------------------- |
| `@plexica/database` (Prisma)                     | ORM for jobs, notifications, search_documents  |
| `@plexica/ui`                                    | 16 existing components reused (see §7)         |
| `apps/core-api/src/lib/redis.ts`                 | Redis connection for BullMQ and SSE pub/sub    |
| `apps/core-api/src/middleware/auth.ts`           | JWT validation on all endpoints                |
| `apps/core-api/src/middleware/tenant-context.ts` | Tenant isolation on all endpoints              |
| `test-infrastructure/`                           | MinIO, Redis, PostgreSQL for integration tests |

### 8.3 Dependency Graph (Task-Level)

```
Phase 1 (Foundation):
  T007-01 ────┐
  T007-05 ─┐  │
            │  ├──── Phase 2 starts after T007-01 complete
  T007-02 ──┤  │     T007-02/03/04 parallel with each other
  T007-03 ──┤  │
  T007-04 ──┘  │
               │
Phase 2 (Services):
  T007-06 (Storage) ─────── depends on T007-01
  T007-07 (Notif)   ─────── depends on T007-01, T007-03
  T007-08 (Jobs)    ─────── depends on T007-01, T007-02
  T007-09 (Search)  ─────── depends on T007-01, T007-04, T007-08
  T007-10 (Template)─────── depends on T007-07
  T007-11 (Worker)  ─────── depends on T007-08
  T007-12 (Bucket)  ─────── depends on T007-06

Phase 3 (API):
  T007-13 (Storage routes) ── depends on T007-06
  T007-14 (Notif routes)   ── depends on T007-07
  T007-15 (Job routes)     ── depends on T007-08
  T007-16 (Search routes)  ── depends on T007-09
  T007-17 (SSE)            ── depends on T007-07, T007-08

Phase 4 (DI):
  T007-18–22 ────── depend on all Phase 3
  T007-23 (Health) ── depends on T007-19–22

Phase 5 (UX):   Can start after Phase 1 (tokens ready)
  T007-24–27 ──── parallel, depend on T007-05
  T007-29    ──── depends on T007-05, T007-01
  T007-28    ──── depends on T007-29
  T007-30    ──── depends on T007-28, T007-29, T007-35

Phase 6 (Shell):
  T007-31 ──── depends on T007-24
  T007-32 ──── depends on T007-25, T007-34
  T007-33 ──── depends on T007-30
  T007-34 ──── depends on T007-17
  T007-35 ──── depends on T007-17

Phase 7 (Testing): Depends on Phases 2–6

Phase 8 (Polish): Depends on Phase 7
```

---

## 9. Implementation Phases

### Phase 1: Foundation & Shared Types (10 pts)

**Objective**: Establish type interfaces, database schema, and design tokens.
All downstream phases depend on this completing first.

**Sprint**: Sprint 7, Week 1

**Tasks**:

1. **T007-01** [M, 3pts] — Define shared TypeScript service interfaces
   - Create: `apps/core-api/src/types/core-services.types.ts`
   - Modify: `apps/core-api/src/types/index.ts` (add re-export)
   - All 4 service interfaces + supporting types

2. **T007-02** [S, 2pts] `[P]` — Database migration: `jobs` table
   - Create: `packages/database/prisma/migrations/YYYYMMDD_001_create_jobs/migration.sql`
   - Modify: `packages/database/prisma/schema.prisma`
   - Run: `pnpm db:generate`

3. **T007-03** [S, 2pts] `[P]` — Database migration: `notifications` table
   - Create: `packages/database/prisma/migrations/YYYYMMDD_002_create_notifications/migration.sql`
   - Modify: `packages/database/prisma/schema.prisma`
   - Run: `pnpm db:generate`

4. **T007-04** [S, 2pts] `[P]` — Database migration: `search_documents` table
   - Create: `packages/database/prisma/migrations/YYYYMMDD_003_create_search_documents/migration.sql`
   - Modify: `packages/database/prisma/schema.prisma`
   - Includes generated `search_vector` column + GIN index
   - Run: `pnpm db:generate`

5. **T007-05** [S, 1pt] — Add 10 new design tokens
   - Modify: `packages/ui/src/styles/tokens.css`
   - Light + dark mode values per design-spec.md §5

**Parallelism**: T007-02, T007-03, T007-04 can run in parallel after T007-01.
T007-05 has no dependencies and can start immediately.

---

### Phase 2: Core Service Implementation (27 pts)

**Objective**: Implement all four backend services with tenant isolation, retries,
and worker processes.

**Sprint**: Sprint 7, Weeks 2–3

**Tasks**:

6. **T007-06** [L, 5pts] `[P]` — Implement StorageService (MinIO adapter)
   - Create: `storage.service.ts`, `storage.types.ts`
   - Path sanitization, retry logic, bucket auto-provision, signed URLs

7. **T007-07** [L, 5pts] `[P]` — Implement NotificationService
   - Create: `notification.service.ts`, `notification.repository.ts`
   - Email (Nodemailer), push (stub), in-app (DB + Redis pub/sub)

8. **T007-08** [L, 5pts] `[P]` — Implement JobQueueService (BullMQ)
   - Create: `job-queue.service.ts`, `job.repository.ts`
   - BullMQ queue, cron validation, tenant context enforcement

9. **T007-09** [L, 5pts] `[P]` — Implement SearchService (PostgreSQL FTS)
   - Create: `search.service.ts`
   - `ts_rank` + `to_tsquery`, tenant-scoped, type filtering

10. **T007-10** [M, 2pts] — Notification template engine
    - Create: `notification-template.ts`
    - `{{variable}}` substitution, 3 built-in templates

11. **T007-11** [M, 3pts] — Job worker process
    - Create: `job-worker.ts`
    - BullMQ Worker, JobHandlerRegistry, lifecycle logging

12. **T007-12** [S, 2pts] — Tenant bucket provisioning hook
    - Create: `bucket-provisioner.ts`
    - Idempotent `makeBucket`, non-blocking, private-access policy

**Parallelism**: T007-06, T007-07, T007-08, T007-09 can run in parallel.
T007-10 depends on T007-07. T007-11 depends on T007-08. T007-12 depends on T007-06.

---

### Phase 3: API / Endpoint Layer (14 pts)

**Objective**: Expose all four services as versioned REST endpoints with Zod
validation, standard error format, and SSE streaming.

**Sprint**: Sprint 7, Week 3

**Tasks**:

13. **T007-13** [M, 3pts] `[P]` — Storage REST endpoints
    - Create: `storage.routes.ts`
    - 5 endpoints (upload, download, delete, list, signed-url)

14. **T007-14** [M, 2pts] `[P]` — Notification REST endpoints
    - Create: `notification.routes.ts`
    - 5 endpoints (send, bulk, list, mark-read, mark-all-read)

15. **T007-15** [M, 3pts] `[P]` — Job Queue REST endpoints
    - Create: `jobs.routes.ts`
    - 7 endpoints (enqueue, schedule, status, cancel, list, retry, disable)

16. **T007-16** [M, 3pts] `[P]` — Search REST endpoints
    - Create: `search.routes.ts`
    - 4 endpoints (search, index, delete, reindex)

17. **T007-17** [M, 3pts] — SSE endpoint
    - Create: `notification-stream.routes.ts`
    - Redis subscribe, ping, replay, notification + job_status events

**Parallelism**: T007-13, T007-14, T007-15, T007-16 can run in parallel.
T007-17 depends on T007-07 and T007-08.

---

### Phase 4: Integration & DI Wiring (6 pts)

**Objective**: Wire all services into Fastify DI, register routes, extend health checks.

**Sprint**: Sprint 7, Week 3 (after Phase 3)

**Tasks**:

18. **T007-18** [S, 1pt] — Register all routes in Fastify app
19. **T007-19** [S, 1pt] `[P]` — Wire StorageService into DI
20. **T007-20** [S, 1pt] `[P]` — Wire NotificationService into DI
21. **T007-21** [S, 1pt] `[P]` — Wire JobQueueService into DI + start worker
22. **T007-22** [S, 1pt] `[P]` — Wire SearchService into DI
23. **T007-23** [S, 1pt] — Extend `/health` with service dependency checks

All modify: `apps/core-api/src/index.ts`

---

### Phase 5: UX Components (27 pts)

**Objective**: Implement all 6 new UI components and the Job Dashboard page.
Can start once Phase 1 tokens are ready (T007-05).

**Sprint**: Sprint 8, Weeks 1–2

**Tasks**:

24. **T007-24** [L, 5pts] `[P]` — Build `SearchOverlay`
25. **T007-25** [L, 5pts] `[P]` — Build `NotificationBell`
26. **T007-26** [L, 5pts] `[P]` — Build `FileUploadZone`
27. **T007-27** [M, 2pts] `[P]` — Build `FileListItem`
28. **T007-28** [M, 3pts] `[P]` — Build `JobDetailPanel` (depends on T007-29)
29. **T007-29** [S, 2pts] `[P]` — Build `JobStatusBadge`
30. **T007-30** [L, 5pts] — Build Job Status Dashboard page

**Parallelism**: T007-24–27 and T007-29 can all run in parallel.
T007-28 depends on T007-29. T007-30 depends on T007-28, T007-29, T007-35.

---

### Phase 6: UX Shell Integration (9 pts)

**Objective**: Integrate components into shell header/sidebar, wire SSE hooks.

**Sprint**: Sprint 8, Weeks 2–3

**Tasks**:

31. **T007-31** [M, 2pts] — Integrate SearchOverlay into Header
32. **T007-32** [M, 2pts] — Integrate NotificationBell into Header
33. **T007-33** [S, 1pt] — Add Jobs to admin sidebar
34. **T007-34** [M, 2pts] `[P]` — SSE hook: `useNotificationStream`
35. **T007-35** [M, 2pts] `[P]` — SSE hook: `useJobStatusStream`

**Parallelism**: T007-34 and T007-35 can run in parallel (both depend on T007-17).

---

### Phase 7: Testing (32 pts)

**Objective**: Achieve ≥80% coverage. Unit, integration, component, and E2E tests.

**Sprint**: Sprint 8, Weeks 3–4

**Tasks**:

| Task    | Type        | Target                                | Pts |
| ------- | ----------- | ------------------------------------- | --- |
| T007-36 | Unit        | StorageService (10+ tests)            | 3   |
| T007-37 | Unit        | NotificationService (10+ tests)       | 3   |
| T007-38 | Unit        | JobQueueService (10+ tests)           | 3   |
| T007-39 | Unit        | SearchService (10+ tests)             | 3   |
| T007-40 | Integration | Storage API endpoints (8+ tests)      | 3   |
| T007-41 | Integration | Notification API endpoints (8+ tests) | 2   |
| T007-42 | Integration | Job Queue API endpoints (10+ tests)   | 3   |
| T007-43 | Integration | Search API endpoints (8+ tests)       | 2   |
| T007-44 | Component   | SearchOverlay + NotificationBell      | 3   |
| T007-45 | Component   | FileUploadZone + FileListItem         | 2   |
| T007-46 | Component   | Job Dashboard + JobDetailPanel        | 2   |
| T007-47 | E2E         | 4 user journeys (Playwright)          | 3   |

**Parallelism**: All unit tests (T007-36–39) can run in parallel. All integration
tests (T007-40–43) can run in parallel. All component tests (T007-44–46) can run
in parallel.

**Estimated Test Count**: ~110 tests

- Unit tests: ~40 (10 per service)
- Integration tests: ~34 (8–10 per API group)
- Component tests: ~24 (8 per component group)
- E2E tests: ~12 (4 journeys × 3 scenarios each)

---

### Phase 8: Polish & Documentation (3 pts)

**Objective**: OpenAPI docs, error message review, structured logging audit.

**Sprint**: Sprint 8, Week 4

**Tasks**:

48. **T007-48** [M, 3pts] — Polish: OpenAPI schemas, error codes, Pino logging
    - Add Fastify schema documentation to all route files
    - Verify Art. 6.2 error format compliance
    - Verify Art. 6.3 Pino logging fields
    - Verify Art. 5.2 no PII in logs

---

## 10. Testing Strategy

### 10.1 Coverage Targets

| Module              | Target | Rationale                    |
| ------------------- | ------ | ---------------------------- |
| StorageService      | ≥85%   | Security-critical (Art. 4.1) |
| NotificationService | ≥85%   | Multi-channel delivery       |
| JobQueueService     | ≥85%   | Async reliability (NFR-006)  |
| SearchService       | ≥85%   | Tenant isolation (FR-012)    |
| UI Components       | ≥80%   | Art. 4.1 overall threshold   |
| Overall feature     | ≥80%   | Constitution Art. 4.1        |

### 10.2 Unit Test Scenarios

| Service             | Test Focus                                                          | Edge Cases                                    |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| StorageService      | upload/download/delete/list/signUrl, tenant bucket isolation        | Path traversal, file too large, MinIO down    |
| NotificationService | send/email/inApp/push/sendBulk, template rendering, retry logic     | Invalid email, SMTP failure, bulk job enqueue |
| JobQueueService     | enqueue/schedule/cancel/getStatus, cron validation, tenant context  | Invalid cron, worker crash, concurrency       |
| SearchService       | index/search/delete/reindex, FTS ranking, type filter, tenant scope | Duplicate doc ID, reindex large dataset       |

### 10.3 Integration Test Scenarios

| API Group     | Test Scenarios                                                                     | Infrastructure     |
| ------------- | ---------------------------------------------------------------------------------- | ------------------ |
| Storage API   | Upload → stored in correct bucket, cross-tenant access → 403, path traversal → 400 | MinIO + PostgreSQL |
| Notification  | Create → DB record, list → tenant-scoped, mark-read → status change                | PostgreSQL         |
| Job Queue API | Enqueue → job ID, schedule cron → success, invalid cron → 400, tenant isolation    | Redis + PostgreSQL |
| Search API    | Index → searchable, FTS ranking, type filter, tenant isolation, reindex → 202      | PostgreSQL         |

### 10.4 Component Test Scenarios

| Component        | Key Behaviors to Test                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| SearchOverlay    | `/` opens, debounce 300ms, skeleton loading, grouped results, keyboard nav, `Esc` closes |
| NotificationBell | Badge count, dropdown open/close, mark-as-read, pulse on new notification, `Esc` closes  |
| FileUploadZone   | Progress bar, client-side size validation, drag-and-drop, cancel, retry                  |
| FileListItem     | File metadata render, download/delete callbacks, spinner while downloading               |
| JobDashboard     | Stat cards render, click filters table, tab bar, pagination, real-time update            |
| JobDetailPanel   | Expand/collapse, aria-expanded, retry callback, disable schedule dialog                  |

### 10.5 E2E Test Scenarios (Playwright)

| Journey | Scenario               | Steps                                                                |
| ------- | ---------------------- | -------------------------------------------------------------------- |
| 1       | Dana — Global Search   | Type "john" → grouped results → click contact → navigate             |
| 2       | Dana — File Upload     | Upload PDF → progress bar → success → file in list                   |
| 3       | Marco — Job Monitoring | Open `/admin/jobs` → expand failed job → retry → status change       |
| 4       | Dana — Notifications   | Bell badge → click → dropdown → click notification → navigate + read |

### 10.6 Performance Benchmarks (in tests)

| Metric                   | Target      | Test Type    | Task    |
| ------------------------ | ----------- | ------------ | ------- |
| Signed URL generation    | < 10ms P95  | Unit (timed) | T007-36 |
| Job enqueue latency      | < 50ms P95  | Unit (timed) | T007-38 |
| Search query (≤10K docs) | < 100ms P95 | Integration  | T007-43 |
| File upload throughput   | ≥ 50 MB/s   | Integration  | T007-40 |

---

## 11. Performance Analysis

### 11.1 Storage Service

- **Upload throughput** (NFR-001): MinIO client uses streaming upload via
  `putObject`. For large files, multipart upload is used automatically.
  50 MB/s is well within MinIO's single-connection capability. No application-level
  bottleneck expected.
- **Signed URL generation** (NFR-002): `presignedGetObject` is a local crypto
  operation (no network call to MinIO). < 10ms P95 is trivially achievable.

### 11.2 Job Queue

- **Enqueue latency** (NFR-003): BullMQ `add()` performs a single Redis LPUSH.
  With existing Redis connection, < 50ms P95 is guaranteed under normal load.
- **At-least-once delivery** (NFR-006): BullMQ uses Redis-based locking. Jobs
  are acknowledged only after handler completes. On worker crash, `lockDuration`
  expiry returns jobs to the queue automatically.

### 11.3 Search Service

- **Query latency** (NFR-004): PostgreSQL FTS with GIN index on `search_vector`
  supports sub-100ms queries for ≤10K documents per tenant. The weighted
  `tsvector` (title=A, body=B) provides relevance ranking without additional
  computation.
- **Scalability** (NFR-008): At ≥100K documents per tenant, the GIN index
  maintains query performance. If degradation occurs, the `B-TREE` index on
  `(tenant_id, type)` enables efficient pre-filtering before FTS scan.

### 11.4 SSE Connection Scaling

- **Memory per connection**: ~2KB (Redis subscriber + Node.js stream). At 1000
  concurrent users: ~2MB RAM overhead.
- **Redis pub/sub**: Each connected user = 1 subscription. Redis handles
  millions of pub/sub channels efficiently.
- **Ping overhead**: 1 ping per 30s per connection. At 1000 users: ~33 pings/s.
  Negligible.

### 11.5 Notification Delivery

- **Delivery rate** (NFR-005): ≥99.5% with retries. Email failures are retried
  3× with exponential backoff (1s, 2s, 4s). Invalid addresses are marked FAILED
  immediately (no retry). In-app notifications have no delivery failure mode
  (DB insert + Redis publish).

---

## 12. Architectural Decisions

| ADR     | Decision                                          | Status   | Plan Section |
| ------- | ------------------------------------------------- | -------- | ------------ |
| ADR-023 | SSE for real-time notification delivery           | Accepted | §6           |
| —       | PostgreSQL FTS over Elasticsearch (MVP)           | Implicit | §4.4         |
| —       | BullMQ for job queue (Redis-backed)               | Proposed | §4.3, §8.1   |
| —       | Nodemailer for email (SMTP)                       | Implicit | §4.2         |
| —       | Template engine: simple `{{var}}` over Handlebars | Implicit | §4.5         |

### Decision: PostgreSQL FTS for MVP Search

**Context**: Spec 007 §10 explicitly scopes Elasticsearch out of MVP. PostgreSQL
FTS with `tsvector` + `ts_rank` provides relevance-ranked full-text search with
zero additional infrastructure. The `search_documents` table uses weighted
vectors (title=A, body=B) and a GIN index for fast lookup.

**Trade-off**: PostgreSQL FTS lacks advanced features (fuzzy matching, synonyms,
multi-language analyzers) that Elasticsearch provides. For MVP with ≤100K
documents per tenant (NFR-008), PostgreSQL FTS is sufficient and avoids the
operational complexity of an Elasticsearch cluster.

**Migration path**: When Elasticsearch is needed (Phase 3, per spec), the
`SearchService` interface remains unchanged. Only the implementation behind
`search()` and `index()` methods changes — from `$queryRaw` SQL to
Elasticsearch client calls.

### Decision: BullMQ for Job Queue

**Context**: The job queue requires at-least-once delivery, cron scheduling,
configurable concurrency, automatic retries with backoff, and dead-letter queue
support. BullMQ is the most mature Node.js job queue library with Redis backend.

**Alternatives considered**:

- **Agenda (MongoDB-backed)**: Rejected — Plexica uses PostgreSQL, not MongoDB.
- **pg-boss (PostgreSQL-backed)**: Viable but less mature than BullMQ; fewer
  features for cron scheduling and concurrency control.
- **Custom Redis queue**: Rejected — reinventing the wheel; BullMQ handles
  all edge cases (stalled jobs, retries, cron).

**Decision**: Use BullMQ. Constitution Art. 2.1 lists Redis as approved
infrastructure. BullMQ adds ~500K weekly downloads, TypeScript-first, and
well-documented API.

---

## 13. Requirement Traceability

| Requirement | Description                   | Plan Section | Implementation Path                                    | Task(s)          |
| ----------- | ----------------------------- | ------------ | ------------------------------------------------------ | ---------------- |
| FR-001      | Storage CRUD operations       | §3.1, §4.1   | `storage.service.ts` → `storage.routes.ts`             | T007-06, T007-13 |
| FR-002      | Tenant bucket isolation       | §4.1, §4.7   | `tenant-{id}` bucket scoping + `bucket-provisioner.ts` | T007-06, T007-12 |
| FR-003      | MinIO/S3 backend              | §4.1         | MinIO client in `storage.service.ts`                   | T007-06          |
| FR-004      | Notification multi-channel    | §3.2, §4.2   | `notification.service.ts` → `notification.routes.ts`   | T007-07, T007-14 |
| FR-005      | Async delivery + retries      | §4.2         | `sendBulk` → JobQueueService, exponential backoff      | T007-07          |
| FR-006      | Notification templates        | §4.5         | `notification-template.ts` with `{{var}}` substitution | T007-10          |
| FR-007      | Job Queue CRUD                | §3.3, §4.3   | `job-queue.service.ts` → `jobs.routes.ts`              | T007-08, T007-15 |
| FR-008      | Job execution + concurrency   | §4.6         | `job-worker.ts` with BullMQ Worker                     | T007-11          |
| FR-009      | Cron scheduling               | §4.3         | `schedule()` with `cron-parser` validation             | T007-08          |
| FR-010      | Job tenant context            | §4.3         | `tenantId` required in every job payload               | T007-08          |
| FR-011      | Search CRUD                   | §3.4, §4.4   | `search.service.ts` → `search.routes.ts`               | T007-09, T007-16 |
| FR-012      | Search tenant isolation       | §4.4         | `WHERE tenant_id = $1` in all queries                  | T007-09          |
| FR-013      | Full-text search + relevance  | §4.4         | `ts_rank` + `to_tsquery` with weighted vectors         | T007-09          |
| FR-014      | Search type filtering         | §4.4         | `AND type = $3` filter in search query                 | T007-09          |
| NFR-001     | Upload ≥50 MB/s               | §11.1        | MinIO streaming upload                                 | T007-06          |
| NFR-002     | Signed URL <10ms P95          | §11.1        | Local crypto operation, no network call                | T007-06          |
| NFR-003     | Job enqueue <50ms P95         | §11.2        | Single Redis LPUSH via BullMQ                          | T007-08          |
| NFR-004     | Search <100ms P95 (≤10K docs) | §11.3        | GIN-indexed tsvector search                            | T007-09          |
| NFR-005     | Notification delivery ≥99.5%  | §11.5        | 3 retries + exponential backoff                        | T007-07          |
| NFR-006     | At-least-once job delivery    | §11.2        | BullMQ lock-based acknowledgement                      | T007-08          |
| NFR-007     | Storage tenant isolation      | §4.1         | Bucket = `tenant-{id}`, path sanitization              | T007-06          |
| NFR-008     | Search ≥100K docs per tenant  | §11.3        | GIN index + B-TREE pre-filter                          | T007-09          |

---

## 14. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                                                                                                  |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Core services provide foundational platform capabilities. UX meets 1.3 standards (WCAG 2.1 AA, <2s loads, actionable errors).                                                                                                                                          |
| Art. 2  | ✅     | MinIO (2.1), Redis/ioredis (2.1), PostgreSQL FTS (2.1). New deps: BullMQ, cron-parser, Nodemailer — all >1000 weekly downloads (2.2).                                                                                                                                  |
| Art. 3  | ✅     | Feature modules pattern (3.2). Layered: routes → services → repositories (3.2). Prisma ORM for all DB access (3.3). Parameterized queries via `$queryRaw` (3.3). REST conventions with `/api/v1/` prefix (3.4). Pagination on list endpoints (3.4).                    |
| Art. 4  | ✅     | ≥80% overall coverage target. ≥85% for each service module. ~110 tests planned across unit/integration/component/E2E (4.1).                                                                                                                                            |
| Art. 5  | ✅     | All endpoints require Bearer auth (5.1). Tenant isolation: bucket scoping (storage), `WHERE tenant_id` (search/notifications/jobs), Redis channel scoping (SSE) (5.2). Zod validation on all inputs (5.3). Path traversal prevention (5.3).                            |
| Art. 6  | ✅     | Standard error format `{ error: { code, message, details? } }` (6.2). Pino structured logging with required fields: timestamp, level, message, requestId, userId, tenantId (6.3). No PII in logs (6.3).                                                                |
| Art. 7  | ✅     | Files: kebab-case (`storage.service.ts`, `notification.routes.ts`). Classes: PascalCase (`StorageService`, `NotificationService`). Functions: camelCase. DB tables: snake_case plural (`jobs`, `notifications`, `search_documents`). API: `/api/v1/` REST conventions. |
| Art. 8  | ✅     | Unit tests for all service methods (8.1). Integration tests for all API endpoints (8.1). E2E tests for 4 critical user flows (8.1). Deterministic, independent tests (8.2). AAA pattern (8.2). Test factories for data (8.3).                                          |
| Art. 9  | ✅     | Health check extended with MinIO, Redis, search checks (9.1). Backward-compatible migrations (9.1). Feature flags not needed (services are internal infra, not user-facing features). Structured JSON logging (9.2).                                                   |

---

## Cross-References

| Document                    | Path                                                          |
| --------------------------- | ------------------------------------------------------------- |
| Spec                        | `.forge/specs/007-core-services/spec.md`                      |
| Design Spec                 | `.forge/specs/007-core-services/design-spec.md`               |
| User Journeys               | `.forge/specs/007-core-services/user-journey.md`              |
| Tasks                       | `.forge/specs/007-core-services/tasks.md`                     |
| ADR-023 (SSE)               | `.forge/knowledge/adr/adr-023-sse-real-time-notifications.md` |
| Constitution                | `.forge/constitution.md`                                      |
| Architecture                | `.forge/architecture/architecture.md`                         |
| Decision Log                | `.forge/knowledge/decision-log.md`                            |
| Design System               | `.forge/ux/design-system.md`                                  |
| Plugin System (Spec 004)    | `.forge/specs/004-plugin-system/spec.md`                      |
| Frontend Architecture (005) | `.forge/specs/005-frontend-architecture/spec.md`              |
| Frontend Readiness (010)    | `.forge/specs/010-frontend-production-readiness/spec.md`      |
