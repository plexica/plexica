# Spec: 007 - Core Services

> Feature specification for the Plexica shared core services: Storage, Notifications, Job Queue, and Search.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 007        |

---

## 1. Overview

Plexica provides four **core services** available to the shell application and all plugins: **Storage Service** (MinIO/S3-compatible file management with tenant-isolated buckets), **Notification Service** (email, push, and in-app notifications), **Job Queue Service** (async and scheduled task execution), and **Search Service** (full-text search with tenant-scoped indexing). These services are accessed through standardized TypeScript interfaces, ensuring consistent behavior and tenant isolation across all consumers.

## 2. Problem Statement

Plugins and core modules need common infrastructure capabilities — file storage, notifications, background jobs, and search — without each plugin implementing its own. These services must enforce tenant isolation (each tenant's files, notifications, jobs, and search indices are isolated), provide standardized APIs, and be reliable under load. Without shared services, plugins would duplicate infrastructure logic, leading to inconsistent behavior and security gaps.

## 3. User Stories

### US-001: File Upload and Download

**As a** plugin developer,
**I want** to upload and download files via a unified Storage API,
**so that** my plugin can manage files without configuring its own storage backend.

**Acceptance Criteria:**

- Given a file upload with path `avatars/user-123.png`, when I call `storage.upload(file, path)`, then the file is stored in the tenant's MinIO bucket `tenant-{tenant_id}`.
- Given a stored file, when I call `storage.download(path)`, then the file content is returned.
- Given a stored file, when I call `storage.getSignedUrl(path, 3600)`, then a pre-signed URL valid for 1 hour is returned.
- Given a file path in tenant A's bucket, when tenant B attempts to download it, then access is denied.

### US-002: Send Notifications

**As a** plugin developer,
**I want** to send notifications via email, push, or in-app channels,
**so that** users are informed of important events.

**Acceptance Criteria:**

- Given notification data, when I call `notifications.email(to, template, data)`, then an email is sent using the configured email provider.
- Given notification data, when I call `notifications.inApp(userId, message)`, then the user sees the notification in their notification center.
- Given bulk notifications, when I call `notifications.sendBulk(notifications)`, then all notifications are queued and delivered asynchronously.
- Given a notification failure, when delivery fails, then it is retried up to 3 times with exponential backoff.

### US-003: Enqueue Background Jobs

**As a** plugin developer,
**I want** to enqueue async jobs and schedule recurring tasks,
**so that** heavy processing doesn't block API requests.

**Acceptance Criteria:**

- Given a job `crm.export-contacts`, when I call `jobQueue.enqueue(job)`, then the job is queued and a job ID is returned.
- Given a scheduled job, when I call `jobQueue.schedule(job, '0 0 * * *')`, then the job runs daily at midnight.
- Given a queued job, when I call `jobQueue.getStatus(jobId)`, then the current status (pending, running, completed, failed) is returned.
- Given a job fails, when retries are configured, then the job is retried with exponential backoff.

### US-004: Full-Text Search

**As a** plugin developer,
**I want** to index and search documents via a unified Search API,
**so that** users can find content across my plugin's data.

**Acceptance Criteria:**

- Given a CRM contact, when I call `search.index(document)`, then the document is indexed with `tenant_id` for isolation.
- Given a search query `"john"` with type filter `crm:contact`, when I call `search.search(query)`, then matching contacts for the current tenant are returned.
- Given a deleted resource, when I call `search.delete(documentId)`, then the document is removed from the search index.
- Given a schema change, when I call `search.reindex('crm:contact')`, then all contacts are re-indexed.

## 4. Functional Requirements

| ID     | Requirement                                                                        | Priority | Story Ref |
| ------ | ---------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Storage Service: `upload`, `download`, `delete`, `list`, `getSignedUrl` operations | Must     | US-001    |
| FR-002 | Storage isolation: each tenant has its own bucket `tenant-{tenant_id}`             | Must     | US-001    |
| FR-003 | Storage backend: MinIO (S3-compatible); configurable for AWS S3 in production      | Must     | US-001    |
| FR-004 | Notification Service: `email`, `push`, `inApp`, `send`, `sendBulk` operations      | Must     | US-002    |
| FR-005 | Notification delivery: async via job queue; retries with exponential backoff       | Must     | US-002    |
| FR-006 | Notification templates: support dynamic data injection (e.g., `{{userName}}`)      | Should   | US-002    |
| FR-007 | Job Queue Service: `enqueue`, `schedule`, `cancel`, `getStatus` operations         | Must     | US-003    |
| FR-008 | Job execution: workers process jobs from queue; configurable concurrency           | Must     | US-003    |
| FR-009 | Scheduled jobs: cron expression support for recurring tasks                        | Must     | US-003    |
| FR-010 | Job tenant context: every job includes `tenant_id` for isolated execution          | Must     | US-003    |
| FR-011 | Search Service: `index`, `search`, `delete`, `reindex` operations                  | Must     | US-004    |
| FR-012 | Search isolation: all search queries scoped to `tenant_id`                         | Must     | US-004    |
| FR-013 | Search supports full-text matching with relevance scoring                          | Must     | US-004    |
| FR-014 | Search type filtering: search within specific resource types (e.g., `crm:contact`) | Should   | US-004    |

## 5. Non-Functional Requirements

| ID      | Category    | Requirement                                      | Target                              |
| ------- | ----------- | ------------------------------------------------ | ----------------------------------- |
| NFR-001 | Performance | File upload throughput                           | ≥50 MB/s per tenant                 |
| NFR-002 | Performance | Signed URL generation                            | < 10ms P95                          |
| NFR-003 | Performance | Job enqueue latency                              | < 50ms P95                          |
| NFR-004 | Performance | Search query latency                             | < 100ms P95 for ≤10K documents      |
| NFR-005 | Reliability | Notification delivery rate                       | ≥99.5% (with retries)               |
| NFR-006 | Reliability | Job execution: at-least-once delivery            | No lost jobs                        |
| NFR-007 | Security    | File access enforces tenant isolation            | Cross-tenant file access impossible |
| NFR-008 | Scalability | Search index supports ≥100K documents per tenant | Without query degradation           |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                        | Expected Behavior                                             |
| --- | ----------------------------------------------- | ------------------------------------------------------------- |
| 1   | File upload exceeds size limit                  | 413 Payload Too Large returned; configurable limit per tenant |
| 2   | MinIO/S3 is temporarily unavailable             | Upload/download retried; error returned after 3 retries       |
| 3   | Notification email address is invalid           | Notification marked as failed; no retry for invalid addresses |
| 4   | Job worker crashes mid-execution                | Job returned to queue; re-processed by another worker         |
| 5   | Cron expression is invalid                      | Schedule rejected with validation error                       |
| 6   | Search reindex on large dataset (>100K docs)    | Background job; progress reported via job status API          |
| 7   | Two plugins index documents with same ID        | Document IDs scoped by type; no collision if types differ     |
| 8   | File path traversal attack (`../../etc/passwd`) | Path sanitized; only paths within tenant bucket allowed       |

## 7. Data Requirements

### Service Interfaces

```typescript
interface StorageService {
  upload(file: Buffer, path: string, options?: UploadOptions): Promise<FileInfo>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<FileInfo[]>;
  getSignedUrl(path: string, expiresIn: number): Promise<string>;
}

interface NotificationService {
  send(notification: Notification): Promise<void>;
  sendBulk(notifications: Notification[]): Promise<void>;
  email(to: string, template: string, data: object): Promise<void>;
  push(userId: string, message: PushMessage): Promise<void>;
  inApp(userId: string, message: InAppMessage): Promise<void>;
}

interface JobQueueService {
  enqueue(job: Job): Promise<string>;
  schedule(job: Job, cronExpression: string): Promise<string>;
  cancel(jobId: string): Promise<void>;
  getStatus(jobId: string): Promise<JobStatus>;
}

interface SearchService {
  index(document: Indexable): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult>;
  delete(documentId: string): Promise<void>;
  reindex(type: string): Promise<void>;
}
```

## 8. API Requirements

| Method | Path                             | Description             | Auth              |
| ------ | -------------------------------- | ----------------------- | ----------------- |
| POST   | /api/v1/storage/upload           | Upload file             | Bearer            |
| GET    | /api/v1/storage/download/:path   | Download file           | Bearer            |
| DELETE | /api/v1/storage/:path            | Delete file             | Bearer            |
| GET    | /api/v1/storage/list             | List files by prefix    | Bearer            |
| GET    | /api/v1/storage/signed-url/:path | Get signed URL          | Bearer            |
| POST   | /api/v1/notifications            | Send notification       | Bearer            |
| POST   | /api/v1/notifications/bulk       | Send bulk notifications | Bearer            |
| POST   | /api/v1/jobs                     | Enqueue job             | Bearer (internal) |
| POST   | /api/v1/jobs/schedule            | Schedule recurring job  | Bearer (internal) |
| GET    | /api/v1/jobs/:id/status          | Get job status          | Bearer (internal) |
| DELETE | /api/v1/jobs/:id                 | Cancel job              | Bearer (internal) |
| POST   | /api/v1/search                   | Search documents        | Bearer            |
| POST   | /api/v1/search/index             | Index document          | Bearer (internal) |
| DELETE | /api/v1/search/:id               | Delete from index       | Bearer (internal) |
| POST   | /api/v1/search/reindex           | Reindex by type         | Bearer (internal) |

## 9. UX/UI Notes

- File upload: progress bar with percentage and cancel button.
- Notifications: bell icon in header with unread count badge; dropdown shows recent in-app notifications.
- Job status: visible in admin dashboard for Super Admin and Tenant Admin.
- Search: global search bar in header; results grouped by type with relevance scoring.

## 10. Out of Scope

- File versioning (only latest version stored; no revision history).
- Push notification provider integration (e.g., Firebase) — placeholder interface for MVP.
- Distributed job queue across multiple workers (single worker for MVP; scalable in Phase 3).
- Elasticsearch integration for search (use PostgreSQL full-text search for MVP; migrate in Phase 3).
- File virus/malware scanning on upload (future security enhancement).

## 11. Open Questions

- No open questions. All requirements derived from existing functional specifications.

## 12. Constitution Compliance

| Article | Status | Notes                                                                          |
| ------- | ------ | ------------------------------------------------------------------------------ |
| Art. 1  | ✅     | Core services provide foundational platform capabilities                       |
| Art. 2  | ✅     | MinIO (Art. 2.1); Redis for job queue; PostgreSQL for search (MVP)             |
| Art. 3  | ✅     | Service layer pattern; standardized interfaces for all consumers               |
| Art. 4  | ✅     | Unit tests for each service interface; integration tests with MinIO/Redis      |
| Art. 5  | ✅     | Tenant bucket isolation; path traversal prevention; signed URL expiry          |
| Art. 6  | ✅     | Standard error format for all service operations; retries for transient errors |
| Art. 7  | ✅     | `storage.service.ts`, `notification.service.ts` — kebab-case files             |
| Art. 8  | ✅     | Unit tests for all service methods; integration tests for storage operations   |
| Art. 9  | ✅     | Health checks include service dependency checks (MinIO, Redis)                 |

---

## Cross-References

| Document                 | Path                                              |
| ------------------------ | ------------------------------------------------- |
| Constitution             | `.forge/constitution.md`                          |
| Plugin System Spec       | `.forge/specs/004-plugin-system/spec.md`          |
| Multi-Tenancy Spec       | `.forge/specs/001-multi-tenancy/spec.md`          |
| Source: Functional Specs | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 10) |
| Source: MinIO Config     | `test-infrastructure/docker-compose.yml`          |
