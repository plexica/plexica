# Core Services

**Last Updated**: February 16, 2026  
**Status**: ❌ Not Implemented (Specification approved)  
**Spec Reference**: [`.forge/specs/007-core-services/spec.md`](../.forge/specs/007-core-services/spec.md)

---

## 📋 Implementation Status

| Service              | Status         | Priority | Target Sprint |
| -------------------- | -------------- | -------- | ------------- |
| Storage Service      | ❌ Not Started | P0       | Sprint 3      |
| Notification Service | ❌ Not Started | P0       | Sprint 3      |
| Job Queue Service    | ❌ Not Started | P0       | Sprint 3      |
| Search Service       | ❌ Not Started | P0       | Sprint 3      |

**Overall Completion**: 0%

> ⚠️ **Critical Note**: Core Services are **not yet implemented**. This document describes
> the planned API design. Plugins currently cannot use these services.
>
> **Impact**: This is a **critical blocker** for the plugin ecosystem. Plugins must implement
> their own storage, notifications, jobs, and search logic until these services are available.

---

## Overview

Plexica will provide four **core services** available to the shell application and all plugins:

1. **Storage Service**: MinIO/S3-compatible file management with tenant-isolated buckets
2. **Notification Service**: Email, push, and in-app notifications
3. **Job Queue Service**: Async and scheduled task execution
4. **Search Service**: Full-text search with tenant-scoped indexing

These services will be accessed through standardized TypeScript interfaces via the `@plexica/sdk`,
ensuring consistent behavior and automatic tenant isolation across all consumers.

### Design Principles

- **Tenant Isolation**: All services automatically scope data/operations to the current tenant
- **Plugin Agnostic**: Same API for core modules and plugins
- **Simple Interface**: Intuitive methods with minimal configuration
- **Type Safety**: Full TypeScript support with auto-generated types
- **Observable**: Built-in logging, metrics, and error tracking

---

## 1. Storage Service

### Overview

File upload/download service with automatic tenant isolation using MinIO (S3-compatible storage).

**Features**:

- ✅ Tenant-isolated buckets (`tenant-{tenantId}`)
- ✅ Pre-signed URLs for secure client-side uploads
- ✅ Automatic file type detection
- ✅ Streaming support for large files
- ✅ Folder/prefix organization

### Architecture

```
┌──────────────┐
│   Plugin     │
└──────┬───────┘
       │ core.storage.upload()
       ▼
┌──────────────────────┐
│  Storage Service     │
│  - Validate tenant   │
│  - Generate path     │
│  - Check limits      │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  MinIO Client        │
│  bucket: tenant-123  │
└──────────────────────┘
```

### API Reference

#### Upload File

```typescript
import { core } from '@plexica/sdk';

// Upload file with automatic tenant isolation
const result = await core.storage.upload({
  file: fileBuffer, // Buffer or Stream
  path: 'avatars/user-123.png',
  contentType: 'image/png',
  metadata: {
    // Optional
    uploadedBy: 'user-123',
    originalName: 'profile.png',
  },
});

// Returns:
// {
//   url: 'https://storage.plexica.com/tenant-abc123/avatars/user-123.png',
//   size: 45678,
//   contentType: 'image/png',
//   etag: 'a1b2c3d4...'
// }
```

#### Download File

```typescript
// Download file as buffer
const file = await core.storage.download('avatars/user-123.png');

// Returns: { buffer: Buffer, contentType: string, size: number }

// Stream file (for large files)
const stream = await core.storage.downloadStream('exports/large-file.csv');
```

#### Get Signed URL

```typescript
// Generate pre-signed URL (1 hour expiry)
const signedUrl = await core.storage.getSignedUrl(
  'avatars/user-123.png',
  3600 // TTL in seconds
);

// Returns: 'https://storage.plexica.com/tenant-abc123/avatars/user-123.png?X-Amz-...'

// Client can now upload/download directly without backend
```

#### Delete File

```typescript
await core.storage.delete('avatars/user-123.png');

// Delete multiple files
await core.storage.deleteMany(['avatars/user-123.png', 'avatars/user-124.png']);
```

#### List Files

```typescript
// List files in a folder/prefix
const files = await core.storage.list({
  prefix: 'avatars/',
  limit: 100,
  offset: 0,
});

// Returns:
// {
//   files: [
//     { path: 'avatars/user-123.png', size: 45678, lastModified: Date },
//     { path: 'avatars/user-124.png', size: 23456, lastModified: Date }
//   ],
//   total: 2,
//   hasMore: false
// }
```

#### Check File Exists

```typescript
const exists = await core.storage.exists('avatars/user-123.png');
// Returns: true | false
```

### Storage Limits

| Limit                  | Value  | Enforced |
| ---------------------- | ------ | -------- |
| Max file size          | 100 MB | Yes      |
| Max files per tenant   | 10,000 | Soft     |
| Max storage per tenant | 10 GB  | Soft     |

### Error Handling

```typescript
try {
  await core.storage.upload({ file, path: 'test.pdf' });
} catch (error) {
  if (error.code === 'FILE_TOO_LARGE') {
    // File exceeds 100 MB limit
  }
  if (error.code === 'STORAGE_QUOTA_EXCEEDED') {
    // Tenant storage quota exceeded
  }
  if (error.code === 'INVALID_FILE_TYPE') {
    // File type not allowed
  }
}
```

### Configuration

**Environment Variables**:

```bash
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET_PREFIX=tenant-
```

**Per-Tenant Settings** (optional):

```json
{
  "storage": {
    "maxFileSize": 104857600, // 100 MB
    "maxStorage": 10737418240, // 10 GB
    "allowedTypes": ["image/*", "application/pdf", "text/*"]
  }
}
```

---

## 2. Notification Service

### Overview

Multi-channel notification delivery: email, push notifications, and in-app messages.

**Features**:

- ✅ Email via SMTP (Nodemailer)
- ✅ In-app notifications (database + WebSocket)
- ✅ Push notifications (Firebase Cloud Messaging)
- ✅ Template support with variable interpolation
- ✅ Async delivery with retry logic
- ✅ Notification center UI component

### Architecture

```
┌──────────────┐
│   Plugin     │
└──────┬───────┘
       │ core.notifications.email()
       ▼
┌──────────────────────────┐
│  Notification Service    │
│  - Validate template     │
│  - Interpolate variables │
│  - Queue for delivery    │
└──────┬───────────────────┘
       │
       ├─────► Email Queue ──────► SMTP Server
       │
       ├─────► Push Queue ───────► FCM
       │
       └─────► In-App Queue ─────► WebSocket + DB
```

### API Reference

#### Send Email

```typescript
// Send email with template
await core.notifications.email({
  to: 'user@example.com',
  template: 'deal-won',
  data: {
    dealName: 'Acme Corp',
    value: '$50,000',
    userName: 'John Doe',
  },
});

// Send email with custom content
await core.notifications.email({
  to: 'user@example.com',
  subject: 'Welcome to Plexica',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
  text: 'Welcome! Thanks for signing up.',
});
```

#### Send In-App Notification

```typescript
await core.notifications.inApp({
  userId: 'user-123',
  title: 'Deal Won!',
  message: 'You closed Acme Corp for $50k',
  type: 'success', // success | info | warning | error
  action: {
    // Optional
    label: 'View Deal',
    url: '/crm/deals/abc123',
  },
});
```

#### Send Push Notification

```typescript
await core.notifications.push({
  userId: 'user-123',
  title: 'New message from Sarah',
  body: 'Can we schedule a call tomorrow?',
  icon: '/icons/message.png',
  badge: 3, // Unread count
  data: {
    // Custom data payload
    type: 'message',
    messageId: 'msg-456',
  },
});
```

#### Bulk Notifications

```typescript
// Send to multiple recipients (async, queued)
await core.notifications.sendBulk([
  { type: 'email', to: 'user1@example.com', template: 'weekly-report', data: {...} },
  { type: 'email', to: 'user2@example.com', template: 'weekly-report', data: {...} },
  { type: 'inApp', userId: 'user-123', title: 'Report ready', message: '...' }
]);
```

#### Mark as Read

```typescript
// Mark in-app notification as read
await core.notifications.markAsRead('notification-id-123');

// Mark all as read for user
await core.notifications.markAllAsRead('user-123');
```

#### Get Notifications

```typescript
// Get user's in-app notifications
const notifications = await core.notifications.getForUser('user-123', {
  unreadOnly: true,
  limit: 20,
  offset: 0,
});

// Returns:
// {
//   notifications: [
//     {
//       id: 'notif-123',
//       title: 'Deal Won!',
//       message: '...',
//       type: 'success',
//       read: false,
//       createdAt: Date
//     }
//   ],
//   unreadCount: 5,
//   total: 42
// }
```

### Email Templates

**Template Directory**: `apps/core-api/templates/emails/`

Example template (`deal-won.hbs`):

```handlebars
<html>
  <head>
    <title>Deal Won</title>
  </head>
  <body>
    <h1>Congratulations, {{userName}}!</h1>
    <p>You just closed <strong>{{dealName}}</strong> for <strong>{{value}}</strong>.</p>
    <a href='{{dealUrl}}'>View Deal</a>
  </body>
</html>
```

### Notification Preferences

Users can configure notification preferences:

```typescript
// Get user preferences
const prefs = await core.notifications.getPreferences('user-123');

// Update preferences
await core.notifications.updatePreferences('user-123', {
  email: {
    dealWon: true,
    weeklyReport: false,
  },
  push: {
    newMessage: true,
    taskAssigned: true,
  },
  inApp: {
    all: true,
  },
});
```

### Retry Logic

Failed notifications are retried with exponential backoff:

- **Retry 1**: After 1 minute
- **Retry 2**: After 5 minutes
- **Retry 3**: After 15 minutes
- **Max retries**: 3

After 3 failed attempts, the notification is marked as `FAILED` and logged for manual review.

### Configuration

**Environment Variables**:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=notifications@plexica.com
SMTP_PASS=***
SMTP_FROM=Plexica <notifications@plexica.com>

FCM_SERVER_KEY=***
FCM_PROJECT_ID=plexica-prod

NOTIFICATION_RETRY_MAX=3
NOTIFICATION_RETRY_BACKOFF=exponential
```

---

## 3. Job Queue Service

### Overview

Async and scheduled task execution with Redis-backed queue (BullMQ).

**Features**:

- ✅ Async job execution (non-blocking)
- ✅ Scheduled jobs (cron expressions)
- ✅ Job status tracking
- ✅ Retry logic with exponential backoff
- ✅ Job priority (low, normal, high)
- ✅ Parallel processing with configurable concurrency

### Architecture

```
┌──────────────┐
│   Plugin     │
└──────┬───────┘
       │ core.jobs.enqueue()
       ▼
┌──────────────────────────┐
│  Job Queue Service       │
│  - Create job            │
│  - Add to queue          │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Redis Queue (BullMQ)    │
│  - Job storage           │
│  - Status tracking       │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Worker Processes        │
│  - Poll queue            │
│  - Execute job           │
│  - Update status         │
└──────────────────────────┘
```

### API Reference

#### Enqueue Job

```typescript
// Enqueue async job
const jobId = await core.jobs.enqueue({
  name: 'crm.export-contacts',
  data: {
    format: 'csv',
    filters: { status: 'active' },
  },
  priority: 'normal', // low | normal | high
  attempts: 3, // Max retry attempts
  backoff: 'exponential', // Fixed delay or exponential
});

// Returns: 'job-abc123'
```

#### Schedule Job

```typescript
// Schedule recurring job (cron expression)
const jobId = await core.jobs.schedule({
  name: 'crm.daily-report',
  cron: '0 0 * * *', // Daily at midnight
  data: {
    recipients: ['admin@acme-corp.com'],
  },
  timezone: 'America/New_York',
});

// Other cron examples:
// '*/15 * * * *'    - Every 15 minutes
// '0 9 * * 1'       - Every Monday at 9am
// '0 0 1 * *'       - First day of every month at midnight
```

#### Get Job Status

```typescript
const status = await core.jobs.getStatus('job-abc123');

// Returns:
// {
//   id: 'job-abc123',
//   name: 'crm.export-contacts',
//   status: 'completed',    // pending | active | completed | failed | delayed
//   progress: 100,          // 0-100
//   result: {               // Job result data
//     exportUrl: 'https://storage.plexica.com/...'
//   },
//   attempts: 1,
//   failedReason: null,
//   createdAt: Date,
//   startedAt: Date,
//   completedAt: Date
// }
```

#### Cancel Job

```typescript
await core.jobs.cancel('job-abc123');

// Cancel all jobs with a specific name
await core.jobs.cancelByName('crm.export-contacts');
```

#### List Jobs

```typescript
// List jobs for current tenant
const jobs = await core.jobs.list({
  status: 'pending', // Filter by status
  name: 'crm.*', // Filter by name pattern
  limit: 50,
  offset: 0,
});

// Returns:
// {
//   jobs: [ {...}, {...} ],
//   total: 123,
//   hasMore: true
// }
```

### Job Handlers

Plugins define job handlers that process jobs:

```typescript
// In plugin code (apps/plugins/crm/src/jobs/export-contacts.ts)
import { core } from '@plexica/sdk';

// Register job handler
core.jobs.registerHandler('crm.export-contacts', async (job) => {
  const { format, filters } = job.data;

  // Update progress
  await job.updateProgress(0);

  // Fetch contacts
  const contacts = await db.contact.findMany({ where: filters });
  await job.updateProgress(50);

  // Generate export
  const csv = generateCSV(contacts);
  await job.updateProgress(75);

  // Upload to storage
  const url = await core.storage.upload({
    file: Buffer.from(csv),
    path: `exports/contacts-${Date.now()}.csv`,
    contentType: 'text/csv',
  });
  await job.updateProgress(100);

  // Return result
  return { exportUrl: url };
});
```

### Job Priority

Jobs are processed in priority order:

| Priority | Weight | Use Case                              |
| -------- | ------ | ------------------------------------- |
| `high`   | 10     | User-initiated exports, real-time ops |
| `normal` | 5      | Background tasks, routine processing  |
| `low`    | 1      | Cleanup, analytics, non-urgent ops    |

### Retry Strategy

Failed jobs are retried based on backoff strategy:

**Exponential Backoff**:

- Retry 1: After 1 minute
- Retry 2: After 2 minutes
- Retry 3: After 4 minutes
- Max attempts: 3 (configurable)

**Fixed Delay**:

- Retry every N seconds (configurable)

### Worker Configuration

**Environment Variables**:

```bash
JOB_QUEUE_REDIS_URL=redis://localhost:6379
JOB_QUEUE_CONCURRENCY=5          # Parallel job execution
JOB_QUEUE_MAX_ATTEMPTS=3
JOB_QUEUE_BACKOFF=exponential
```

**Per-Queue Settings**:

```typescript
core.jobs.configureQueue('crm', {
  concurrency: 10, // Process 10 jobs in parallel
  maxAttempts: 5,
  backoff: 'exponential',
});
```

---

## 4. Search Service

### Overview

Full-text search with tenant-scoped indexing using Elasticsearch or MeiliSearch.

**Features**:

- ✅ Full-text search with relevance scoring
- ✅ Tenant-scoped indexes (automatic isolation)
- ✅ Type filtering (search within specific resource types)
- ✅ Faceted search (filter by attributes)
- ✅ Autocomplete/suggestions
- ✅ Highlight search terms in results

### Architecture

```
┌──────────────┐
│   Plugin     │
└──────┬───────┘
       │ core.search.index()
       ▼
┌──────────────────────────┐
│  Search Service          │
│  - Add tenant_id         │
│  - Validate schema       │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  Elasticsearch           │
│  Index: plexica_tenant123│
└──────────────────────────┘
```

### API Reference

#### Index Document

```typescript
// Index a document
await core.search.index({
  type: 'crm:contact',
  id: 'contact-123',
  data: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    company: 'Acme Corp',
    tags: ['vip', 'customer'],
  },
});
```

#### Search Documents

```typescript
// Basic search
const results = await core.search.search({
  query: 'john acme',
  limit: 20,
  offset: 0,
});

// Returns:
// {
//   hits: [
//     {
//       type: 'crm:contact',
//       id: 'contact-123',
//       score: 0.95,           // Relevance score
//       data: {
//         firstName: 'John',
//         lastName: 'Doe',
//         email: 'john@example.com',
//         company: 'Acme Corp'
//       },
//       highlights: {          // Search term highlights
//         company: 'Acme <em>Corp</em>'
//       }
//     }
//   ],
//   total: 1,
//   maxScore: 0.95
// }

// Search with type filter
const contacts = await core.search.search({
  query: 'john',
  type: 'crm:contact',
  limit: 10,
});

// Advanced search with filters
const results = await core.search.search({
  query: 'acme',
  type: 'crm:contact',
  filters: {
    tags: { contains: 'vip' },
    company: { equals: 'Acme Corp' },
  },
});
```

#### Autocomplete/Suggestions

```typescript
// Get autocomplete suggestions
const suggestions = await core.search.suggest({
  query: 'joh',
  type: 'crm:contact',
  field: 'firstName',
  limit: 5,
});

// Returns: ['John', 'Johnny', 'Johan']
```

#### Delete Document

```typescript
await core.search.delete({
  type: 'crm:contact',
  id: 'contact-123',
});

// Delete all documents of a type
await core.search.deleteByType('crm:contact');
```

#### Reindex

```typescript
// Reindex all documents of a type
await core.search.reindex('crm:contact', async (batchSize, offset) => {
  // Fetch documents from database
  const contacts = await db.contact.findMany({
    take: batchSize,
    skip: offset,
  });

  return contacts.map((c) => ({
    id: c.id,
    data: {
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      company: c.company,
    },
  }));
});
```

### Search Schema

Define searchable fields for a document type:

```typescript
// Register search schema for a type
core.search.registerSchema('crm:contact', {
  fields: {
    firstName: { type: 'text', weight: 2 }, // Higher weight = more important
    lastName: { type: 'text', weight: 2 },
    email: { type: 'text', weight: 1 },
    company: { type: 'text', weight: 1 },
    tags: { type: 'keyword', faceted: true }, // For filtering
    createdAt: { type: 'date' },
  },
  sortableFields: ['createdAt', 'lastName'],
  facetedFields: ['tags', 'company'],
});
```

### Faceted Search

Filter by attributes with counts:

```typescript
const results = await core.search.search({
  query: 'sales',
  type: 'crm:contact',
  facets: ['tags', 'company'],
});

// Returns:
// {
//   hits: [...],
//   facets: {
//     tags: [
//       { value: 'vip', count: 12 },
//       { value: 'customer', count: 45 },
//       { value: 'lead', count: 8 }
//     ],
//     company: [
//       { value: 'Acme Corp', count: 23 },
//       { value: 'Globex Inc', count: 15 }
//     ]
//   }
// }
```

### Performance

- **Indexing Latency**: < 100ms P95
- **Search Latency**: < 200ms P95
- **Throughput**: 1000 searches/second per tenant
- **Index Size**: ~1 MB per 1000 documents

### Configuration

**Environment Variables**:

```bash
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_INDEX_PREFIX=plexica_tenant_
ELASTICSEARCH_MAX_RESULTS=10000

# OR (if using MeiliSearch)
MEILISEARCH_URL=http://localhost:7700
MEILISEARCH_API_KEY=***
```

---

## Usage from Plugins

### Plugin SDK Import

```typescript
import { core } from '@plexica/sdk';

// All core services available via `core.*`
await core.storage.upload({...});
await core.notifications.email({...});
await core.jobs.enqueue({...});
await core.search.index({...});
```

### Tenant Context

**Automatic Tenant Isolation**: All core services automatically scope operations to the current tenant.
Plugins do not need to pass `tenantId` — it's extracted from the request context.

```typescript
// ❌ DON'T: Pass tenantId manually
await core.storage.upload({ tenantId: '...', file, path });

// ✅ DO: Tenant context is automatic
await core.storage.upload({ file, path });
```

### Error Handling

All services throw standardized errors:

```typescript
import { PlexicaError } from '@plexica/sdk';

try {
  await core.storage.upload({ file, path });
} catch (error) {
  if (error instanceof PlexicaError) {
    console.error(`Error ${error.code}: ${error.message}`);
    // error.code: 'FILE_TOO_LARGE' | 'STORAGE_QUOTA_EXCEEDED' | ...
  }
}
```

---

## Testing

### Unit Tests (Planned)

Target: 170+ tests across 4 services, ≥80% coverage

**Test Coverage**:

- Storage: 50 tests (upload, download, signed URLs, tenant isolation, errors)
- Notification: 40 tests (email, push, in-app, templates, retry logic)
- Job Queue: 45 tests (enqueue, schedule, status, retry, cancellation)
- Search: 35 tests (index, search, facets, reindex, tenant isolation)

### Integration Tests (Planned)

E2E tests with real infrastructure:

```typescript
describe('Core Services Integration', () => {
  it('should upload file, send notification, and index for search', async () => {
    // Upload file
    const { url } = await core.storage.upload({ file, path: 'test.pdf' });
    expect(url).toContain('tenant-test');

    // Send notification
    await core.notifications.email({
      to: 'test@example.com',
      template: 'file-uploaded',
      data: { url },
    });

    // Index document
    await core.search.index({
      type: 'files',
      id: 'file-123',
      data: { name: 'test.pdf', url },
    });

    // Search
    const results = await core.search.search({ query: 'test.pdf' });
    expect(results.hits).toHaveLength(1);
  });
});
```

---

## Monitoring & Observability

### Metrics (Prometheus)

Planned metrics for each service:

```
# Storage
plexica_storage_uploads_total{tenant_id}
plexica_storage_downloads_total{tenant_id}
plexica_storage_size_bytes{tenant_id}

# Notifications
plexica_notifications_sent_total{tenant_id,type,status}
plexica_notifications_delivery_duration_seconds{type}

# Jobs
plexica_jobs_enqueued_total{tenant_id,name}
plexica_jobs_completed_total{tenant_id,name,status}
plexica_jobs_duration_seconds{name}

# Search
plexica_search_queries_total{tenant_id}
plexica_search_indexing_duration_seconds{type}
```

### Logging

Structured logs with tenant context:

```json
{
  "level": "info",
  "timestamp": "2026-02-16T10:30:00Z",
  "service": "storage",
  "operation": "upload",
  "tenantId": "tenant-abc123",
  "userId": "user-456",
  "path": "avatars/user-456.png",
  "size": 45678,
  "duration": 120
}
```

---

## Migration & Rollout Plan

### Phase 1: Storage Service (Week 1)

- [ ] Implement StorageService with MinIO client
- [ ] Create API routes: `/api/v1/storage/*`
- [ ] Add to `@plexica/sdk`
- [ ] Write 50 unit tests
- [ ] Update documentation

### Phase 2: Notification Service (Week 1)

- [ ] Implement NotificationService (email, in-app, push)
- [ ] Create notification queue (BullMQ)
- [ ] Email templates system
- [ ] API routes: `/api/v1/notifications/*`
- [ ] Add to `@plexica/sdk`
- [ ] Write 40 unit tests

### Phase 3: Job Queue Service (Week 2)

- [ ] Implement JobQueueService with BullMQ
- [ ] Job handler registry
- [ ] Scheduled jobs (cron)
- [ ] API routes: `/api/v1/jobs/*`
- [ ] Add to `@plexica/sdk`
- [ ] Write 45 unit tests

### Phase 4: Search Service (Week 2)

- [ ] Implement SearchService with Elasticsearch/MeiliSearch
- [ ] Index schema registry
- [ ] Faceted search
- [ ] API routes: `/api/v1/search/*`
- [ ] Add to `@plexica/sdk`
- [ ] Write 35 unit tests

### Phase 5: Integration & Documentation (Week 2-3)

- [ ] Integration tests (E2E)
- [ ] Performance testing (load tests)
- [ ] Update plugin development guide
- [ ] Create example plugin using all 4 services
- [ ] Update `docs/PLUGIN_DEVELOPMENT.md`

**Total Effort**: 80 hours (2 engineers × 2 weeks)

---

## FAQ

### Q: Why aren't Core Services implemented yet?

**A**: The platform initially focused on multi-tenancy, authentication, and plugin infrastructure.
Core Services are the next priority (Sprint 3) to unblock the plugin ecosystem.

### Q: Can I use Core Services now?

**A**: No, they are not yet implemented. Plugins must implement their own storage/notification/job/search logic.
See workarounds below.

### Q: What workarounds are available?

**A**:

- **Storage**: Use `apps/core-api/src/lib/minio-client.ts` directly (manual tenant isolation)
- **Notifications**: Use Nodemailer directly or third-party services
- **Jobs**: Use `packages/event-bus/` for async messaging
- **Search**: Implement database full-text search or use external APIs

### Q: Will the API change?

**A**: The API described in this document is the approved specification (Spec 007).
Minor changes are possible during implementation, but the core interface will remain stable.

### Q: How do I track progress?

**A**: Follow Sprint 3 status in [`.forge/sprints/active/sprint-003.yaml`](../.forge/sprints/active/sprint-003.yaml)

---

## References

- **FORGE Spec**: [`.forge/specs/007-core-services/spec.md`](../.forge/specs/007-core-services/spec.md)
- **Constitution**: [`.forge/constitution.md`](../.forge/constitution.md) Article 3.1 (Core Services Layer)
- **Plugin SDK**: `packages/sdk/` (to be updated)
- **MinIO Client**: `apps/core-api/src/lib/minio-client.ts` (temporary workaround)
- **Event Bus**: `packages/event-bus/` (temporary job queue alternative)

---

**Document Version**: 1.0  
**Last Updated**: February 16, 2026  
**Status**: ❌ Implementation Not Started  
**Next Review**: After Sprint 3 completion
