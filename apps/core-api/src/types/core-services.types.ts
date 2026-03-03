// File: apps/core-api/src/types/core-services.types.ts
// Shared type interfaces for Spec 007 - Core Services
// Covers: StorageService, NotificationService, JobQueueService, SearchService

import { z } from 'zod';

// ============================================================================
// STORAGE SERVICE TYPES
// ============================================================================

/**
 * Metadata for a stored file object
 */
export interface FileInfo {
  /** Object key within the tenant bucket (e.g. "uploads/report.pdf") */
  key: string;
  /** Original filename */
  filename: string;
  /** MIME content type */
  contentType: string;
  /** File size in bytes */
  size: number;
  /** Upload timestamp */
  uploadedAt: Date;
  /** Tenant-scoped bucket name (tenant-{tenantId}) */
  bucket: string;
  /** Optional arbitrary metadata */
  metadata?: Record<string, string>;
}

/**
 * Options for uploading a file to storage
 */
export interface UploadOptions {
  /** Override content type (defaults to detected MIME) */
  contentType?: string;
  /** Maximum allowed size in bytes (enforced before upload) */
  maxSizeBytes?: number;
  /** Arbitrary metadata key-value pairs to store with the object */
  metadata?: Record<string, string>;
}

/**
 * Options for generating a pre-signed URL
 */
export interface SignedUrlOptions {
  /** Expiry duration in seconds (default: 3600) */
  expiresIn?: number;
}

/**
 * StorageService interface — tenant-scoped file storage (MinIO adapter)
 * Every method is automatically scoped to bucket `tenant-{tenantId}`
 */
export interface IStorageService {
  upload(
    path: string,
    data: Buffer | NodeJS.ReadableStream,
    options?: UploadOptions
  ): Promise<FileInfo>;
  download(path: string): Promise<NodeJS.ReadableStream>;
  delete(path: string): Promise<void>;
  list(prefix?: string): Promise<FileInfo[]>;
  getSignedUrl(path: string, options?: SignedUrlOptions): Promise<string>;
}

// ============================================================================
// NOTIFICATION SERVICE TYPES
// ============================================================================

/**
 * Notification delivery channel
 */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
  IN_APP = 'IN_APP',
}

/**
 * Notification delivery/read status
 */
export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  READ = 'READ',
}

/**
 * A notification record (persisted to DB for IN_APP/EMAIL)
 */
export interface Notification {
  id?: string;
  tenantId: string;
  /** Keycloak user ID */
  userId: string;
  channel: NotificationChannel;
  status?: NotificationStatus;
  title: string;
  body: string;
  /** Optional metadata: source resource link, plugin id, etc. */
  metadata?: {
    link?: string;
    pluginId?: string;
    [key: string]: unknown;
  };
  readAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * An email-specific push message
 */
export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  /** HTML body (optional; falls back to plain text if omitted) */
  htmlBody?: string;
}

/**
 * Push notification message (mobile push — Firebase, future)
 */
export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * In-app notification message
 */
export interface InAppMessage {
  userId: string;
  title: string;
  body: string;
  metadata?: Notification['metadata'];
}

/**
 * Options for bulk-sending notifications
 */
export interface BulkNotificationOptions {
  /** If true, sends are fire-and-forget via JobQueue (default: true) */
  async?: boolean;
}

/**
 * NotificationService interface
 */
export interface INotificationService {
  send(notification: Notification): Promise<Notification>;
  sendBulk(notifications: Notification[], options?: BulkNotificationOptions): Promise<void>;
  email(tenantId: string, message: EmailMessage): Promise<void>;
  push(tenantId: string, message: PushMessage): Promise<void>;
  inApp(tenantId: string, message: InAppMessage): Promise<Notification>;
}

// ============================================================================
// JOB QUEUE SERVICE TYPES
// ============================================================================

/**
 * Job lifecycle status
 * Matches the `JobStatus` enum in the database migration (T007-02)
 */
export enum JobStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  SCHEDULED = 'SCHEDULED',
}

/**
 * A job record — persisted to the `jobs` table
 */
export interface Job {
  id?: string;
  tenantId: string;
  /** Job type name (e.g. "notifications.send-bulk", "search.reindex") */
  name: string;
  /** Optional plugin that owns this job */
  pluginId?: string;
  status?: JobStatus;
  /** Arbitrary JSON payload (must include tenantId per FR-010) */
  payload: Record<string, unknown> & { tenantId: string };
  result?: Record<string, unknown>;
  error?: string;
  retries?: number;
  maxRetries?: number;
  /** ISO 8601 cron expression for scheduled jobs */
  cronExpression?: string;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Options for enqueuing a one-time job
 */
export interface EnqueueOptions {
  /** Delay before processing in milliseconds */
  delay?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Job priority (higher = sooner, default: 0) */
  priority?: number;
}

/**
 * Options for scheduling a recurring cron job
 */
export interface ScheduleOptions {
  /** ISO 8601 cron expression (e.g. "0 9 * * 1-5") */
  cronExpression: string;
  /** Timezone for cron evaluation (default: UTC) */
  timezone?: string;
}

/**
 * Result of enqueuing or scheduling a job
 */
export interface JobEnqueueResult {
  jobId: string;
}

/**
 * Current status snapshot of a job
 */
export interface JobStatusResult {
  jobId: string;
  status: JobStatus;
  retries: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * JobQueueService interface
 */
export interface IJobQueueService {
  enqueue(job: Job, options?: EnqueueOptions): Promise<JobEnqueueResult>;
  schedule(job: Job, options: ScheduleOptions): Promise<JobEnqueueResult>;
  cancel(jobId: string, tenantId: string): Promise<void>;
  getStatus(jobId: string, tenantId: string): Promise<JobStatusResult>;
}

// ============================================================================
// SEARCH SERVICE TYPES
// ============================================================================

/**
 * A document to be indexed for full-text search
 */
export interface Indexable {
  /** Plugin-assigned document identifier (scoped by tenantId + type) */
  documentId: string;
  /** Document type (e.g. "crm:contact", "workspace:page") */
  type: string;
  /** Short title — included in FTS vector */
  title: string;
  /** Main content body — included in FTS vector */
  body: string;
  /** Optional arbitrary metadata (not indexed for FTS, but stored) */
  metadata?: Record<string, unknown>;
}

/**
 * Query parameters for a full-text search request
 */
export interface SearchQuery {
  /** Full-text search term */
  q: string;
  /** Optional type filter (e.g. "crm:contact") */
  type?: string;
  /** Maximum results to return (default: 20, max: 100) */
  limit?: number;
}

/**
 * A single search result item
 */
export interface SearchResult {
  documentId: string;
  type: string;
  title: string;
  /** Snippet from body with matched terms highlighted */
  snippet: string;
  /** ts_rank score (higher = more relevant) */
  rank: number;
  metadata?: Record<string, unknown>;
}

/**
 * SearchService interface — PostgreSQL FTS (Elasticsearch deferred per spec.md §10)
 */
export interface ISearchService {
  index(tenantId: string, doc: Indexable): Promise<void>;
  search(tenantId: string, query: SearchQuery): Promise<SearchResult[]>;
  delete(tenantId: string, documentId: string, type: string): Promise<void>;
  reindex(tenantId: string, type: string): Promise<JobEnqueueResult>;
}

// ============================================================================
// ZOD VALIDATION SCHEMAS (Art. 5.3 — all external input validated with Zod)
// ============================================================================

export const UploadOptionsSchema = z.object({
  contentType: z.string().optional(),
  maxSizeBytes: z.number().positive().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const NotificationSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  userId: z.string().min(1, 'userId is required'),
  channel: z.nativeEnum(NotificationChannel),
  title: z.string().min(1, 'title is required').max(255),
  body: z.string().min(1, 'body is required'),
  metadata: z
    .object({
      link: z.string().url().optional(),
      pluginId: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export const JobSchema = z.object({
  tenantId: z.string().uuid('tenantId must be a valid UUID'),
  name: z.string().min(1, 'job name is required').max(255),
  pluginId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).refine((p) => typeof p['tenantId'] === 'string', {
    message: 'payload must include tenantId (FR-010)',
  }),
  maxRetries: z.number().int().min(0).max(10).optional(),
  cronExpression: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
});

export const SearchQuerySchema = z.object({
  q: z.string().min(1, 'search query is required').max(500),
  type: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const IndexableSchema = z.object({
  documentId: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// ERROR CODES (Art. 6.2 — stable, documented error codes)
// ============================================================================

export enum StorageErrorCode {
  FILE_TOO_LARGE = 'STORAGE_FILE_TOO_LARGE',
  PATH_TRAVERSAL = 'STORAGE_PATH_TRAVERSAL',
  FILE_NOT_FOUND = 'STORAGE_FILE_NOT_FOUND',
  UPLOAD_FAILED = 'STORAGE_UPLOAD_FAILED',
  DOWNLOAD_FAILED = 'STORAGE_DOWNLOAD_FAILED',
  DELETE_FAILED = 'STORAGE_DELETE_FAILED',
  SIGNED_URL_FAILED = 'STORAGE_SIGNED_URL_FAILED',
}

export enum NotificationErrorCode {
  INVALID_EMAIL = 'NOTIFICATION_INVALID_EMAIL',
  SEND_FAILED = 'NOTIFICATION_SEND_FAILED',
  NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
  TEMPLATE_RENDER_FAILED = 'NOTIFICATION_TEMPLATE_RENDER_FAILED',
}

export enum JobErrorCode {
  INVALID_CRON = 'JOB_INVALID_CRON',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  ALREADY_CANCELLED = 'JOB_ALREADY_CANCELLED',
  ENQUEUE_FAILED = 'JOB_ENQUEUE_FAILED',
  SCHEDULE_FAILED = 'JOB_SCHEDULE_FAILED',
}

export enum SearchErrorCode {
  INDEX_FAILED = 'SEARCH_INDEX_FAILED',
  QUERY_FAILED = 'SEARCH_QUERY_FAILED',
  DELETE_FAILED = 'SEARCH_DELETE_FAILED',
  REINDEX_FAILED = 'SEARCH_REINDEX_FAILED',
}
