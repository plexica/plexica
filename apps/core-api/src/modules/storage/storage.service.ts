// File: apps/core-api/src/modules/storage/storage.service.ts
// Spec 007 T007-06: StorageService — tenant-scoped MinIO adapter
// FR-001: File upload, FR-002: bucket isolation, FR-003: signed URLs
// NFR-001: upload <500ms P95, NFR-002: signed URL <10ms P95, NFR-007: tenant isolation

import { Client, BucketItem } from 'minio';
import { getMinioClient } from '../../services/minio-client.js';
import { config } from '../../config/index.js';
import {
  IStorageService,
  FileInfo,
  UploadOptions,
  SignedUrlOptions,
  StorageErrorCode,
} from '../../types/core-services.types.js';
import { logger } from '../../lib/logger.js';

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Sanitize a storage path: reject path traversal attempts.
 * Edge Case #8 per spec.md §6.
 */
function sanitizePath(path: string): string {
  if (!path || path.includes('..') || path.startsWith('/')) {
    throw Object.assign(
      new Error('Invalid storage path: path traversal or absolute path rejected'),
      {
        code: StorageErrorCode.PATH_TRAVERSAL,
        statusCode: 400,
      }
    );
  }
  // Normalise to no leading slash
  return path.replace(/^\/+/, '');
}

/**
 * Retry with exponential backoff for MinIO transient errors.
 * Edge Case #2 per spec.md §6.
 */
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3, baseDelayMs = 100): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTransient =
        err instanceof Error &&
        (err.message.includes('ECONNRESET') ||
          err.message.includes('ETIMEDOUT') ||
          err.message.includes('socket hang up') ||
          err.message.includes('503'));

      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// ============================================================================
// StorageService
// ============================================================================

export class StorageService implements IStorageService {
  private readonly tenantId: string;
  private readonly bucketName: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    // NFR-007: tenant isolation enforced by bucket naming
    this.bucketName = `tenant-${tenantId}`;
  }

  /** Expose bucket name for provisioner and health checks */
  getBucketName(): string {
    return this.bucketName;
  }

  // --------------------------------------------------------------------------
  // Bucket provisioning (idempotent)
  // --------------------------------------------------------------------------

  private async ensureBucket(): Promise<void> {
    const minioSvc = getMinioClient();
    await minioSvc.ensureTenantBucket(this.tenantId);
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Upload a file to the tenant's bucket.
   * FR-001: store uploaded files
   * Edge Case #1: enforce max file size before upload
   * Edge Case #2: retry on transient MinIO errors (max 3)
   */
  async upload(
    path: string,
    data: Buffer | NodeJS.ReadableStream,
    options: UploadOptions = {}
  ): Promise<FileInfo> {
    const sanitized = sanitizePath(path);
    const client: Client = (getMinioClient() as unknown as { client: Client }).client;
    if (options.maxSizeBytes !== undefined && Buffer.isBuffer(data)) {
      if (data.length > options.maxSizeBytes) {
        throw Object.assign(
          new Error(
            `File too large: ${data.length} bytes exceeds limit of ${options.maxSizeBytes} bytes`
          ),
          { code: StorageErrorCode.FILE_TOO_LARGE, statusCode: 413 }
        );
      }
    }

    const contentType = options.contentType ?? 'application/octet-stream';
    const size = Buffer.isBuffer(data) ? data.length : -1;

    await withRetry(async () => {
      await this.ensureBucket();
      if (Buffer.isBuffer(data)) {
        await client.putObject(this.bucketName, sanitized, data, data.length, {
          'Content-Type': contentType,
          ...options.metadata,
        });
      } else {
        // Cast NodeJS.ReadableStream → stream.Readable (minio SDK type requirement)
        const readable = data as unknown as import('stream').Readable;
        await client.putObject(this.bucketName, sanitized, readable, undefined, {
          'Content-Type': contentType,
          ...options.metadata,
        });
      }
    });

    logger.info(
      { tenantId: this.tenantId, path: sanitized, size },
      '[StorageService] uploaded file'
    );

    return {
      key: sanitized,
      filename: sanitized.split('/').pop() ?? sanitized,
      contentType,
      size,
      uploadedAt: new Date(),
      bucket: this.bucketName,
      metadata: options.metadata,
    };
  }

  /**
   * Download a file from the tenant's bucket.
   * FR-001: retrieve uploaded files
   */
  async download(path: string): Promise<NodeJS.ReadableStream> {
    const sanitized = sanitizePath(path);
    const client: Client = (getMinioClient() as unknown as { client: Client }).client;

    try {
      return (await withRetry(() =>
        client.getObject(this.bucketName, sanitized)
      )) as unknown as NodeJS.ReadableStream;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('NoSuchKey') ||
          (err as Error & { code?: string }).code === 'NoSuchKey')
      ) {
        throw Object.assign(new Error(`File not found: ${sanitized}`), {
          code: StorageErrorCode.FILE_NOT_FOUND,
          statusCode: 404,
        });
      }
      throw Object.assign(err as Error, {
        code: StorageErrorCode.DOWNLOAD_FAILED,
        statusCode: 500,
      });
    }
  }

  /**
   * Delete a file from the tenant's bucket.
   */
  async delete(path: string): Promise<void> {
    const sanitized = sanitizePath(path);
    const client: Client = (getMinioClient() as unknown as { client: Client }).client;

    try {
      await withRetry(() => client.removeObject(this.bucketName, sanitized));
      logger.info({ tenantId: this.tenantId, path: sanitized }, '[StorageService] deleted file');
    } catch (err) {
      throw Object.assign(err as Error, {
        code: StorageErrorCode.DELETE_FAILED,
        statusCode: 500,
      });
    }
  }

  /**
   * List files in the tenant's bucket, optionally filtered by prefix.
   */
  async list(prefix?: string): Promise<FileInfo[]> {
    const client: Client = (getMinioClient() as unknown as { client: Client }).client;
    const results: FileInfo[] = [];

    const stream = client.listObjects(this.bucketName, prefix ?? '', true);

    return new Promise((resolve, reject) => {
      stream.on('data', (obj: BucketItem) => {
        if (obj.name) {
          results.push({
            key: obj.name,
            filename: obj.name.split('/').pop() ?? obj.name,
            contentType: 'application/octet-stream', // MinIO doesn't return content-type in list
            size: obj.size ?? 0,
            uploadedAt: obj.lastModified ?? new Date(),
            bucket: this.bucketName,
          });
        }
      });
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(results));
    });
  }

  /**
   * Generate a pre-signed URL for direct download.
   * NFR-002: target <10ms P95 (presignedGetObject is a local HMAC operation)
   */
  async getSignedUrl(path: string, options: SignedUrlOptions = {}): Promise<string> {
    const sanitized = sanitizePath(path);
    const client: Client = (getMinioClient() as unknown as { client: Client }).client;
    const expiresIn = options.expiresIn ?? 3600;

    try {
      const url = await client.presignedGetObject(this.bucketName, sanitized, expiresIn);
      return url;
    } catch (err) {
      throw Object.assign(err as Error, {
        code: StorageErrorCode.SIGNED_URL_FAILED,
        statusCode: 500,
      });
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a tenant-scoped StorageService instance.
 * Usage: const storage = createStorageService(tenantId);
 */
export function createStorageService(tenantId: string): StorageService {
  return new StorageService(tenantId);
}

// ============================================================================
// MinIO config helper (for DI wiring in index.ts)
// ============================================================================

export function getStorageConfig() {
  const [endPoint, portStr] = config.storageEndpoint.split(':');
  return {
    endPoint,
    port: parseInt(portStr ?? '9000', 10),
    useSSL: config.storageUseSsl,
    accessKey: config.storageAccessKey,
    secretKey: config.storageSecretKey,
  };
}
