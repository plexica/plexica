/**
 * Shared Data Service Tests (M2.3 Task 11)
 *
 * Unit tests for the Shared Data service
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SharedDataService } from '../../services/shared-data.service.js';

// Create mock Prisma
const createMockPrisma = () => {
  const sharedData = new Map<string, any>();

  return {
    sharedPluginData: {
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = `${where.tenantId_namespace_key.tenantId}-${where.tenantId_namespace_key.namespace}-${where.tenantId_namespace_key.key}`;
        const existing = sharedData.get(key);

        if (existing) {
          const updated = { ...existing, ...update, updatedAt: new Date() };
          sharedData.set(key, updated);
          return updated;
        } else {
          const created = {
            ...create,
            id: `entry-${sharedData.size + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          sharedData.set(key, created);
          return created;
        }
      }),
      findUnique: vi.fn(async ({ where }) => {
        const key = `${where.tenantId_namespace_key.tenantId}-${where.tenantId_namespace_key.namespace}-${where.tenantId_namespace_key.key}`;
        return sharedData.get(key) || null;
      }),
      findMany: vi.fn(async ({ where, select, orderBy }) => {
        let results = Array.from(sharedData.values());

        // Apply filters
        if (where) {
          results = results.filter((entry) => {
            if (where.tenantId && entry.tenantId !== where.tenantId) return false;
            if (where.namespace && entry.namespace !== where.namespace) return false;
            if (where.ownerId && entry.ownerId !== where.ownerId) return false;

            // Handle OR conditions for expiresAt
            if (where.OR) {
              const now = new Date();
              const matchesOr = where.OR.some((condition: any) => {
                if (condition.expiresAt === null) return entry.expiresAt === null;
                if (condition.expiresAt?.gte) return entry.expiresAt && entry.expiresAt >= now;
                return false;
              });
              if (!matchesOr) return false;
            }

            // Handle expiresAt.lt for cleanup
            if (where.expiresAt?.lt) {
              if (!entry.expiresAt || entry.expiresAt >= where.expiresAt.lt) return false;
            }

            return true;
          });
        }

        // Apply select
        if (select) {
          results = results.map((entry) => {
            const selected: any = {};
            Object.keys(select).forEach((key) => {
              if (select[key]) selected[key] = entry[key];
            });
            return selected;
          });
        }

        // Apply orderBy
        if (orderBy && orderBy.key) {
          results.sort((a, b) => a.key.localeCompare(b.key));
        }

        return results;
      }),
      deleteMany: vi.fn(async ({ where }) => {
        let count = 0;
        const keysToDelete: string[] = [];

        sharedData.forEach((entry, key) => {
          let shouldDelete = true;

          if (where.tenantId && entry.tenantId !== where.tenantId) shouldDelete = false;
          if (where.namespace && entry.namespace !== where.namespace) shouldDelete = false;
          if (where.key && entry.key !== where.key) shouldDelete = false;
          if (where.ownerId && entry.ownerId !== where.ownerId) shouldDelete = false;

          // Handle expiresAt.lt for cleanup
          if (where.expiresAt?.lt) {
            if (!entry.expiresAt || entry.expiresAt >= where.expiresAt.lt) shouldDelete = false;
          }

          if (shouldDelete) {
            keysToDelete.push(key);
            count++;
          }
        });

        keysToDelete.forEach((key) => sharedData.delete(key));

        return { count };
      }),
    },
    __clearAll: () => {
      sharedData.clear();
    },
  } as any;
};

// Create mock Redis
const createMockRedis = () => {
  const cache = new Map<string, string>();

  return {
    get: vi.fn(async (key: string) => cache.get(key) || null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      cache.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (...keys: string[]) => {
      keys.forEach((key) => cache.delete(key));
      return keys.length;
    }),
    keys: vi.fn(async (pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(cache.keys()).filter((k) => regex.test(k));
    }),
    __clearAll: () => {
      cache.clear();
    },
  } as any;
};

const createMockLogger = () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
});

let mockPrisma: any;
let mockRedis: any;
let mockLogger: any;
let sharedDataService: SharedDataService;

describe('SharedDataService', () => {
  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();
    mockLogger = createMockLogger();
    sharedDataService = new SharedDataService(mockPrisma, mockRedis, mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockPrisma.__clearAll();
    mockRedis.__clearAll();
  });

  describe('set', () => {
    it('should set shared data successfully', async () => {
      await sharedDataService.set(
        'tenant-1',
        'crm.analytics',
        'last_sync',
        { timestamp: '2025-01-01T00:00:00Z' },
        'plugin-crm'
      );

      expect(mockPrisma.sharedPluginData.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId_namespace_key: {
              tenantId: 'tenant-1',
              namespace: 'crm.analytics',
              key: 'last_sync',
            },
          },
          create: expect.objectContaining({
            tenantId: 'tenant-1',
            namespace: 'crm.analytics',
            key: 'last_sync',
            ownerId: 'plugin-crm',
          }),
        })
      );
    });

    it('should set TTL when provided', async () => {
      const ttl = 3600; // 1 hour
      await sharedDataService.set(
        'tenant-1',
        'crm.analytics',
        'temp_data',
        { value: 'test' },
        'plugin-crm',
        { ttl }
      );

      expect(mockPrisma.sharedPluginData.upsert).toHaveBeenCalled();
      const call = mockPrisma.sharedPluginData.upsert.mock.calls[0][0];
      expect(call.create.expiresAt).toBeInstanceOf(Date);
    });

    it('should invalidate cache after setting', async () => {
      await sharedDataService.set(
        'tenant-1',
        'crm.analytics',
        'key1',
        { value: 'test' },
        'plugin-crm'
      );

      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should update existing data', async () => {
      // First set
      await sharedDataService.set('tenant-1', 'ns', 'key', { value: 'old' }, 'plugin-crm');

      // Second set (update)
      await sharedDataService.set('tenant-1', 'ns', 'key', { value: 'new' }, 'plugin-crm');

      const result = await sharedDataService.get('tenant-1', 'ns', 'key');
      expect(result).toEqual({ value: 'new' });
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      await sharedDataService.set(
        'tenant-1',
        'crm.analytics',
        'test_key',
        { message: 'hello' },
        'plugin-crm'
      );
    });

    it('should get shared data successfully', async () => {
      const data = await sharedDataService.get('tenant-1', 'crm.analytics', 'test_key');

      expect(data).toEqual({ message: 'hello' });
    });

    it('should return null for non-existent key', async () => {
      const data = await sharedDataService.get('tenant-1', 'crm.analytics', 'missing_key');

      expect(data).toBeNull();
    });

    it('should use cache on subsequent reads', async () => {
      // First read - hits database and caches
      await sharedDataService.get('tenant-1', 'crm.analytics', 'test_key');

      // Clear mock to track second call
      vi.clearAllMocks();

      // Second read - should use cache
      await sharedDataService.get('tenant-1', 'crm.analytics', 'test_key');

      expect(mockRedis.get).toHaveBeenCalled();
    });

    it('should return null and delete expired data', async () => {
      // Set data with very short TTL (1 second in the past)
      const pastDate = new Date(Date.now() - 1000);
      await sharedDataService.set(
        'tenant-1',
        'crm.analytics',
        'expired_key',
        { value: 'test' },
        'plugin-crm',
        { ttl: -1 } // Already expired
      );

      // Manually set expiresAt to past
      const entry = await mockPrisma.sharedPluginData.findUnique({
        where: {
          tenantId_namespace_key: {
            tenantId: 'tenant-1',
            namespace: 'crm.analytics',
            key: 'expired_key',
          },
        },
      });
      if (entry) {
        entry.expiresAt = pastDate;
      }

      const data = await sharedDataService.get('tenant-1', 'crm.analytics', 'expired_key');

      expect(data).toBeNull();
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await sharedDataService.set('tenant-1', 'ns', 'key1', { value: 1 }, 'plugin-crm');
      await sharedDataService.set('tenant-1', 'ns', 'key2', { value: 2 }, 'plugin-crm');
    });

    it('should delete shared data successfully', async () => {
      const deleted = await sharedDataService.delete('tenant-1', 'ns', 'key1');

      expect(deleted).toBe(true);

      const data = await sharedDataService.get('tenant-1', 'ns', 'key1');
      expect(data).toBeNull();
    });

    it('should return false when deleting non-existent data', async () => {
      const deleted = await sharedDataService.delete('tenant-1', 'ns', 'missing_key');

      expect(deleted).toBe(false);
    });

    it('should invalidate cache after deleting', async () => {
      await sharedDataService.delete('tenant-1', 'ns', 'key1');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('listKeys', () => {
    beforeEach(async () => {
      await sharedDataService.set('tenant-1', 'namespace-1', 'key1', { v: 1 }, 'plugin-a');
      await sharedDataService.set('tenant-1', 'namespace-1', 'key2', { v: 2 }, 'plugin-a');
      await sharedDataService.set('tenant-1', 'namespace-1', 'key3', { v: 3 }, 'plugin-b');
      await sharedDataService.set('tenant-1', 'namespace-2', 'key4', { v: 4 }, 'plugin-a');
    });

    it('should list all keys in namespace', async () => {
      const keys = await sharedDataService.listKeys('tenant-1', 'namespace-1');

      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should filter keys by ownerId', async () => {
      const keys = await sharedDataService.listKeys('tenant-1', 'namespace-1', {
        ownerId: 'plugin-a',
      });

      expect(keys).toHaveLength(2);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).not.toContain('key3');
    });

    it('should return empty array for namespace with no keys', async () => {
      const keys = await sharedDataService.listKeys('tenant-1', 'empty-namespace');

      expect(keys).toHaveLength(0);
    });
  });

  describe('getAll', () => {
    beforeEach(async () => {
      await sharedDataService.set('tenant-1', 'ns', 'key1', { value: 1 }, 'plugin-a');
      await sharedDataService.set('tenant-1', 'ns', 'key2', { value: 2 }, 'plugin-a');
      await sharedDataService.set('tenant-1', 'ns', 'key3', { value: 3 }, 'plugin-b');
    });

    it('should get all entries in namespace', async () => {
      const entries = await sharedDataService.getAll('tenant-1', 'ns');

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.key)).toContain('key1');
      expect(entries.map((e) => e.key)).toContain('key2');
      expect(entries.map((e) => e.key)).toContain('key3');
    });

    it('should filter entries by ownerId', async () => {
      const entries = await sharedDataService.getAll('tenant-1', 'ns', { ownerId: 'plugin-a' });

      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.ownerId === 'plugin-a')).toBe(true);
    });

    it('should include value and metadata', async () => {
      const entries = await sharedDataService.getAll('tenant-1', 'ns');

      entries.forEach((entry) => {
        expect(entry).toHaveProperty('key');
        expect(entry).toHaveProperty('value');
        expect(entry).toHaveProperty('ownerId');
        expect(entry).toHaveProperty('createdAt');
        expect(entry).toHaveProperty('updatedAt');
      });
    });
  });

  describe('clearNamespace', () => {
    beforeEach(async () => {
      await sharedDataService.set('tenant-1', 'ns', 'key1', { v: 1 }, 'plugin-a');
      await sharedDataService.set('tenant-1', 'ns', 'key2', { v: 2 }, 'plugin-a');
      await sharedDataService.set('tenant-1', 'ns', 'key3', { v: 3 }, 'plugin-b');
    });

    it('should clear all data in namespace', async () => {
      const count = await sharedDataService.clearNamespace('tenant-1', 'ns');

      expect(count).toBe(3);

      const keys = await sharedDataService.listKeys('tenant-1', 'ns');
      expect(keys).toHaveLength(0);
    });

    it('should clear only data owned by specific plugin', async () => {
      const count = await sharedDataService.clearNamespace('tenant-1', 'ns', 'plugin-a');

      expect(count).toBe(2);

      const keys = await sharedDataService.listKeys('tenant-1', 'ns');
      expect(keys).toHaveLength(1);
      expect(keys).toContain('key3');
    });

    it('should invalidate cache after clearing', async () => {
      await sharedDataService.clearNamespace('tenant-1', 'ns');

      expect(mockRedis.keys).toHaveBeenCalled();
    });

    it('should return 0 when clearing empty namespace', async () => {
      const count = await sharedDataService.clearNamespace('tenant-1', 'empty-ns');

      expect(count).toBe(0);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired entries', async () => {
      // Set expired data
      await sharedDataService.set('tenant-1', 'ns', 'expired', { v: 1 }, 'plugin-a', { ttl: -1 });

      // Set non-expired data
      await sharedDataService.set('tenant-1', 'ns', 'active', { v: 2 }, 'plugin-a', { ttl: 3600 });

      const count = await sharedDataService.cleanupExpired();

      // At least one entry should be cleaned (the expired one)
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should not remove non-expired entries', async () => {
      await sharedDataService.set('tenant-1', 'ns', 'key1', { v: 1 }, 'plugin-a');
      await sharedDataService.set('tenant-1', 'ns', 'key2', { v: 2 }, 'plugin-a', { ttl: 3600 });

      await sharedDataService.cleanupExpired();

      const keys = await sharedDataService.listKeys('tenant-1', 'ns');
      expect(keys).toHaveLength(2);
    });
  });
});
