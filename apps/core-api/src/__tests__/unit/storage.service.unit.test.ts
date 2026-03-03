// apps/core-api/src/__tests__/unit/storage.service.unit.test.ts
// T007-36 — Unit tests for StorageService
// Tests: upload, download, delete, list, getSignedUrl, sanitizePath (edge cases)

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external dependencies before importing the SUT
// ---------------------------------------------------------------------------

const mockPutObject = vi.fn().mockResolvedValue(undefined);
const mockGetObject = vi.fn();
const mockRemoveObject = vi.fn().mockResolvedValue(undefined);
const mockPresignedGetObject = vi.fn().mockResolvedValue('https://minio/signed?token=abc');
const mockListObjects = vi.fn();
const mockEnsureTenantBucket = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/minio-client.js', () => ({
  getMinioClient: vi.fn(() => ({
    client: {
      putObject: mockPutObject,
      getObject: mockGetObject,
      removeObject: mockRemoveObject,
      presignedGetObject: mockPresignedGetObject,
      listObjects: mockListObjects,
    },
    ensureTenantBucket: mockEnsureTenantBucket,
  })),
}));

vi.mock('../../config/index.js', () => ({
  config: {
    storageEndpoint: 'localhost:9000',
    storageUseSsl: false,
    storageAccessKey: 'minioadmin',
    storageSecretKey: 'minioadmin',
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { StorageService } from '../../modules/storage/storage.service.js';
import { StorageErrorCode } from '../../types/core-services.types.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal EventEmitter stream for list()
// ---------------------------------------------------------------------------
import { EventEmitter } from 'events';

function makeObjectStream(
  items: { name?: string; size?: number; lastModified?: Date }[]
): EventEmitter {
  const emitter = new EventEmitter();
  setImmediate(() => {
    for (const item of items) {
      emitter.emit('data', item);
    }
    emitter.emit('end');
  });
  return emitter;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('StorageService', () => {
  let service: StorageService;
  const TENANT_ID = 'tenant-abc-123';

  beforeEach(() => {
    service = new StorageService(TENANT_ID);
    vi.clearAllMocks();
    // Default: ensureTenantBucket resolves immediately
    mockEnsureTenantBucket.mockResolvedValue(undefined);
    mockPutObject.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // getBucketName
  // -------------------------------------------------------------------------
  describe('getBucketName', () => {
    it('should return tenant-scoped bucket name', () => {
      expect(service.getBucketName()).toBe(`tenant-${TENANT_ID}`);
    });
  });

  // -------------------------------------------------------------------------
  // upload
  // -------------------------------------------------------------------------
  describe('upload', () => {
    it('should upload a Buffer and return FileInfo', async () => {
      const data = Buffer.from('hello world');
      const result = await service.upload('docs/test.txt', data, {
        contentType: 'text/plain',
      });

      expect(mockEnsureTenantBucket).toHaveBeenCalledWith(TENANT_ID);
      expect(mockPutObject).toHaveBeenCalledWith(
        `tenant-${TENANT_ID}`,
        'docs/test.txt',
        data,
        data.length,
        expect.objectContaining({ 'Content-Type': 'text/plain' })
      );
      expect(result.key).toBe('docs/test.txt');
      expect(result.contentType).toBe('text/plain');
      expect(result.size).toBe(data.length);
      expect(result.bucket).toBe(`tenant-${TENANT_ID}`);
    });

    it('should reject path traversal attempts', async () => {
      await expect(service.upload('../etc/passwd', Buffer.from('x'))).rejects.toMatchObject({
        code: StorageErrorCode.PATH_TRAVERSAL,
      });
    });

    it('should reject absolute paths', async () => {
      await expect(service.upload('/absolute/path', Buffer.from('x'))).rejects.toMatchObject({
        code: StorageErrorCode.PATH_TRAVERSAL,
      });
    });

    it('should throw FILE_TOO_LARGE when buffer exceeds maxSizeBytes', async () => {
      const data = Buffer.alloc(1024); // 1KB
      await expect(service.upload('big.bin', data, { maxSizeBytes: 512 })).rejects.toMatchObject({
        code: StorageErrorCode.FILE_TOO_LARGE,
      });
    });

    it('should default contentType to application/octet-stream', async () => {
      await service.upload('file.bin', Buffer.from('data'));
      expect(mockPutObject).toHaveBeenCalledWith(
        expect.any(String),
        'file.bin',
        expect.any(Buffer),
        expect.any(Number),
        expect.objectContaining({ 'Content-Type': 'application/octet-stream' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // download
  // -------------------------------------------------------------------------
  describe('download', () => {
    it('should return a readable stream on success', async () => {
      const fakeStream = new EventEmitter();
      mockGetObject.mockResolvedValue(fakeStream);

      const stream = await service.download('docs/test.txt');
      expect(stream).toBe(fakeStream);
    });

    it('should throw FILE_NOT_FOUND for NoSuchKey errors', async () => {
      mockGetObject.mockRejectedValue(new Error('NoSuchKey: does not exist'));

      await expect(service.download('missing.txt')).rejects.toMatchObject({
        code: StorageErrorCode.FILE_NOT_FOUND,
      });
    });

    it('should throw DOWNLOAD_FAILED for other errors', async () => {
      mockGetObject.mockRejectedValue(new Error('Connection refused'));

      await expect(service.download('file.txt')).rejects.toMatchObject({
        code: StorageErrorCode.DOWNLOAD_FAILED,
      });
    });

    it('should reject path traversal in download', async () => {
      await expect(service.download('../secret')).rejects.toMatchObject({
        code: StorageErrorCode.PATH_TRAVERSAL,
      });
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------
  describe('delete', () => {
    it('should call removeObject with the correct bucket and path', async () => {
      mockRemoveObject.mockResolvedValue(undefined);
      await service.delete('docs/old.txt');

      expect(mockRemoveObject).toHaveBeenCalledWith(`tenant-${TENANT_ID}`, 'docs/old.txt');
    });

    it('should throw DELETE_FAILED on error', async () => {
      mockRemoveObject.mockRejectedValue(new Error('Storage error'));

      await expect(service.delete('docs/file.txt')).rejects.toMatchObject({
        code: StorageErrorCode.DELETE_FAILED,
      });
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  describe('list', () => {
    it('should return a list of FileInfo items', async () => {
      const items = [
        { name: 'docs/a.txt', size: 100, lastModified: new Date('2026-01-01') },
        { name: 'docs/b.txt', size: 200, lastModified: new Date('2026-01-02') },
      ];
      mockListObjects.mockReturnValue(makeObjectStream(items));

      const result = await service.list('docs/');

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('docs/a.txt');
      expect(result[0].size).toBe(100);
      expect(result[1].key).toBe('docs/b.txt');
    });

    it('should return empty array when no objects exist', async () => {
      mockListObjects.mockReturnValue(makeObjectStream([]));
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it('should skip objects without a name', async () => {
      const items = [
        { name: undefined, size: 0 },
        { name: 'valid.txt', size: 50 },
      ];
      mockListObjects.mockReturnValue(makeObjectStream(items));

      const result = await service.list();
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('valid.txt');
    });
  });

  // -------------------------------------------------------------------------
  // getSignedUrl
  // -------------------------------------------------------------------------
  describe('getSignedUrl', () => {
    it('should return a signed URL', async () => {
      mockPresignedGetObject.mockResolvedValue('https://minio/signed?token=abc');
      const url = await service.getSignedUrl('docs/report.pdf');
      expect(url).toBe('https://minio/signed?token=abc');
      expect(mockPresignedGetObject).toHaveBeenCalledWith(
        `tenant-${TENANT_ID}`,
        'docs/report.pdf',
        3600 // default expiry
      );
    });

    it('should use custom expiresIn', async () => {
      mockPresignedGetObject.mockResolvedValue('https://minio/signed?t=x');
      await service.getSignedUrl('file.pdf', { expiresIn: 600 });
      expect(mockPresignedGetObject).toHaveBeenCalledWith(expect.any(String), 'file.pdf', 600);
    });

    it('should throw SIGNED_URL_FAILED on error', async () => {
      mockPresignedGetObject.mockRejectedValue(new Error('MinIO error'));
      await expect(service.getSignedUrl('file.pdf')).rejects.toMatchObject({
        code: StorageErrorCode.SIGNED_URL_FAILED,
      });
    });
  });
});
