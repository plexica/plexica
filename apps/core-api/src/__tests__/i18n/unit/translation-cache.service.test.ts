/**
 * TranslationCacheService Unit Tests
 *
 * Tests Redis caching operations with mocked Redis client.
 * Covers cache get/set, hash storage, TTL handling, and invalidation patterns.
 *
 * Test Coverage:
 * - getCached() - Cache hits, misses, and error handling
 * - setCached() - Bundle storage with TTL
 * - getHash() - Content hash retrieval
 * - invalidateTenant() - Tenant-specific cache invalidation
 * - invalidateAll() - Global cache invalidation
 * - invalidateNamespace() - Selective invalidation
 * - Key pattern generation (global vs tenant-specific)
 *
 * @module __tests__/i18n/unit/translation-cache.service.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TranslationBundle } from '@plexica/i18n';

// Mock Redis client before importing service
vi.mock('../../../lib/redis.js', () => ({
  redis: {
    get: vi.fn(),
    setex: vi.fn(),
    keys: vi.fn(),
    del: vi.fn(),
    pipeline: vi.fn(),
  },
}));

// Import after mocking
import { TranslationCacheService } from '../../../modules/i18n/i18n-cache.service.js';
import { redis } from '../../../lib/redis.js';

describe('TranslationCacheService', () => {
  let service: TranslationCacheService;
  let mockPipelineInstance: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create fresh service instance
    service = new TranslationCacheService();

    // Setup mock pipeline instance
    mockPipelineInstance = {
      del: vi.fn().mockReturnThis(), // Chainable
      exec: vi.fn().mockResolvedValue([]), // Returns empty array
    };
    vi.mocked(redis.pipeline).mockReturnValue(mockPipelineInstance);
  });

  describe('getCached', () => {
    it('should return cached translation bundle when found', async () => {
      // Arrange
      const mockBundle: TranslationBundle = {
        locale: 'en',
        namespace: 'core',
        contentHash: 'abc12345',
        messages: { greeting: 'Hello' },
      };
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(mockBundle));

      // Act
      const result = await service.getCached('en', 'core');

      // Assert
      expect(result).toEqual(mockBundle);
      expect(vi.mocked(redis.get)).toHaveBeenCalledWith('i18n:en:core');
    });

    it('should return cached bundle for tenant-specific key', async () => {
      // Arrange
      const mockBundle: TranslationBundle = {
        locale: 'it',
        namespace: 'crm',
        contentHash: 'def67890',
        messages: { 'deals.title': 'Opportunità' },
      };
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(mockBundle));

      // Act
      const result = await service.getCached('it', 'crm', 'acme-corp');

      // Assert
      expect(result).toEqual(mockBundle);
      expect(vi.mocked(redis.get)).toHaveBeenCalledWith('i18n:acme-corp:it:crm');
    });

    it('should return null when cache miss', async () => {
      // Arrange
      vi.mocked(redis.get).mockResolvedValue(null);

      // Act
      const result = await service.getCached('fr', 'billing');

      // Assert
      expect(result).toBeNull();
      expect(vi.mocked(redis.get)).toHaveBeenCalledWith('i18n:fr:billing');
    });

    it('should return null and log error when Redis fails', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis connection error'));

      // Act
      const result = await service.getCached('en', 'core');

      // Assert
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache read error'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should return null when cached data is invalid JSON', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(redis.get).mockResolvedValue('invalid-json{');

      // Act
      const result = await service.getCached('en', 'core');

      // Assert
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('setCached', () => {
    it('should store translation bundle with default TTL', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'en',
        namespace: 'core',
        contentHash: 'abc12345',
        messages: { greeting: 'Hello' },
      };

      // Act
      await service.setCached(bundle);

      // Assert
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
        'i18n:en:core',
        3600, // Default TTL: 1 hour
        JSON.stringify(bundle)
      );
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith('i18n:hash:en:core', 3600, 'abc12345');
    });

    it('should store tenant-specific bundle with custom TTL', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'it',
        namespace: 'crm',
        contentHash: 'def67890',
        messages: { 'deals.title': 'Opportunità' },
      };

      // Act
      await service.setCached(bundle, 'acme-corp', 7200); // 2 hours

      // Assert
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
        'i18n:acme-corp:it:crm',
        7200,
        JSON.stringify(bundle)
      );
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
        'i18n:hash:acme-corp:it:crm',
        7200,
        'def67890'
      );
    });

    it('should not throw when Redis write fails', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const bundle: TranslationBundle = {
        locale: 'en',
        namespace: 'core',
        contentHash: 'abc12345',
        messages: { greeting: 'Hello' },
      };
      vi.mocked(redis.setex).mockRejectedValue(new Error('Redis write error'));

      // Act & Assert - Should not throw
      await expect(service.setCached(bundle)).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache write error'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should store both bundle and hash keys separately', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'de',
        namespace: 'support',
        contentHash: 'xyz98765',
        messages: { 'ticket.create': 'Neues Ticket erstellen' },
      };
      vi.mocked(redis.setex).mockResolvedValue('OK');

      // Act
      await service.setCached(bundle, undefined, 1800);

      // Assert - Verify two setex calls (bundle + hash)
      expect(vi.mocked(redis.setex)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(redis.setex)).toHaveBeenNthCalledWith(
        1,
        'i18n:de:support',
        1800,
        JSON.stringify(bundle)
      );
      expect(vi.mocked(redis.setex)).toHaveBeenNthCalledWith(
        2,
        'i18n:hash:de:support',
        1800,
        'xyz98765'
      );
    });
  });

  describe('getHash', () => {
    it('should return cached content hash', async () => {
      // Arrange
      vi.mocked(redis.get).mockResolvedValue('abc12345');

      // Act
      const result = await service.getHash('en', 'core');

      // Assert
      expect(result).toBe('abc12345');
      expect(vi.mocked(redis.get)).toHaveBeenCalledWith('i18n:hash:en:core');
    });

    it('should return cached hash for tenant-specific key', async () => {
      // Arrange
      vi.mocked(redis.get).mockResolvedValue('tenant-hash');

      // Act
      const result = await service.getHash('it', 'crm', 'acme-corp');

      // Assert
      expect(result).toBe('tenant-hash');
      expect(vi.mocked(redis.get)).toHaveBeenCalledWith('i18n:hash:acme-corp:it:crm');
    });

    it('should return null when hash not cached', async () => {
      // Arrange
      vi.mocked(redis.get).mockResolvedValue(null);

      // Act
      const result = await service.getHash('fr', 'billing');

      // Assert
      expect(result).toBeNull();
    });

    it('should return null and log error when Redis fails', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis error'));

      // Act
      const result = await service.getHash('en', 'core');

      // Assert
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Hash read error'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('invalidateTenant', () => {
    it('should delete all cache keys for a specific tenant', async () => {
      // Arrange
      vi.mocked(redis.keys).mockResolvedValueOnce([
        'i18n:acme-corp:en:core',
        'i18n:acme-corp:it:crm',
      ]);
      vi.mocked(redis.keys).mockResolvedValueOnce([
        'i18n:hash:acme-corp:en:core',
        'i18n:hash:acme-corp:it:crm',
      ]);

      // Act
      await service.invalidateTenant('acme-corp');

      // Assert
      expect(vi.mocked(redis.keys)).toHaveBeenNthCalledWith(1, 'i18n:acme-corp:*');
      expect(vi.mocked(redis.keys)).toHaveBeenNthCalledWith(2, 'i18n:hash:acme-corp:*');
      expect(vi.mocked(redis.pipeline)).toHaveBeenCalled();
      expect(mockPipelineInstance.del).toHaveBeenCalledTimes(4); // 2 bundle keys + 2 hash keys
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });

    it('should handle case with no matching keys gracefully', async () => {
      // Arrange
      vi.mocked(redis.keys).mockResolvedValue([]);

      // Act
      await service.invalidateTenant('nonexistent-tenant');

      // Assert
      expect(vi.mocked(redis.keys)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(redis.pipeline)).not.toHaveBeenCalled(); // No pipeline if no keys
    });

    it('should not throw when Redis fails', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(redis.keys).mockRejectedValue(new Error('Redis error'));

      // Act & Assert - Should not throw
      await expect(service.invalidateTenant('acme-corp')).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache invalidation error'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should use pipeline for efficient bulk deletion', async () => {
      // Arrange
      const manyKeys = Array.from({ length: 50 }, (_, i) => `i18n:tenant:en:plugin${i}`);
      const manyHashKeys = Array.from({ length: 50 }, (_, i) => `i18n:hash:tenant:en:plugin${i}`);
      vi.mocked(redis.keys).mockResolvedValueOnce(manyKeys);
      vi.mocked(redis.keys).mockResolvedValueOnce(manyHashKeys);

      // Act
      await service.invalidateTenant('tenant');

      // Assert
      expect(vi.mocked(redis.pipeline)).toHaveBeenCalledOnce();
      expect(mockPipelineInstance.del).toHaveBeenCalledTimes(100); // 50 + 50
      expect(mockPipelineInstance.exec).toHaveBeenCalledOnce();
    });
  });

  describe('invalidateAll', () => {
    it('should delete all i18n cache keys', async () => {
      // Arrange
      vi.mocked(redis.keys).mockResolvedValueOnce([
        'i18n:en:core',
        'i18n:it:crm',
        'i18n:tenant:en:core',
      ]);
      vi.mocked(redis.keys).mockResolvedValueOnce(['i18n:hash:en:core', 'i18n:hash:it:crm']);

      // Act
      await service.invalidateAll();

      // Assert
      expect(vi.mocked(redis.keys)).toHaveBeenNthCalledWith(1, 'i18n:*');
      expect(vi.mocked(redis.keys)).toHaveBeenNthCalledWith(2, 'i18n:hash:*');
      expect(vi.mocked(redis.pipeline)).toHaveBeenCalled();
      expect(mockPipelineInstance.del).toHaveBeenCalledTimes(5); // 3 bundle + 2 hash
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });

    it('should handle case with no cached keys', async () => {
      // Arrange
      vi.mocked(redis.keys).mockResolvedValue([]);

      // Act
      await service.invalidateAll();

      // Assert
      expect(vi.mocked(redis.keys)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(redis.pipeline)).not.toHaveBeenCalled();
    });

    it('should not throw when Redis fails', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(redis.keys).mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(service.invalidateAll()).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache invalidation error (invalidateAll)'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('invalidateNamespace', () => {
    it('should delete global and tenant-specific keys for a namespace', async () => {
      // Arrange
      vi.mocked(redis.keys).mockResolvedValueOnce(['i18n:tenant1:en:core', 'i18n:tenant2:en:core']);
      vi.mocked(redis.keys).mockResolvedValueOnce([
        'i18n:hash:tenant1:en:core',
        'i18n:hash:tenant2:en:core',
      ]);

      // Act
      await service.invalidateNamespace('en', 'core');

      // Assert
      expect(vi.mocked(redis.keys)).toHaveBeenNthCalledWith(1, 'i18n:*:en:core');
      expect(vi.mocked(redis.keys)).toHaveBeenNthCalledWith(2, 'i18n:hash:*:en:core');
      expect(vi.mocked(redis.pipeline)).toHaveBeenCalled();
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('i18n:en:core'); // Global key
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('i18n:hash:en:core'); // Global hash
      expect(mockPipelineInstance.del).toHaveBeenCalledTimes(6); // 2 global + 2 tenant + 2 hash
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });

    it('should handle case with no tenant-specific keys', async () => {
      // Arrange
      vi.mocked(redis.keys).mockResolvedValue([]);

      // Act
      await service.invalidateNamespace('it', 'crm');

      // Assert
      expect(vi.mocked(redis.pipeline)).toHaveBeenCalled();
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('i18n:it:crm');
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('i18n:hash:it:crm');
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });

    it('should not throw when Redis fails', async () => {
      // Arrange
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(redis.keys).mockRejectedValue(new Error('Redis error'));

      // Act & Assert
      await expect(service.invalidateNamespace('en', 'core')).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache invalidation error for namespace'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Key pattern generation', () => {
    it('should build global cache key without tenant slug', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'en',
        namespace: 'core',
        contentHash: 'abc123',
        messages: {},
      };

      // Act
      await service.setCached(bundle);

      // Assert
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
        'i18n:en:core', // Global key format
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should build tenant-specific cache key with tenant slug', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'it',
        namespace: 'crm',
        contentHash: 'def456',
        messages: {},
      };

      // Act
      await service.setCached(bundle, 'acme-corp');

      // Assert
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith(
        'i18n:acme-corp:it:crm', // Tenant-specific key format
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should build global hash key without tenant slug', async () => {
      // Arrange
      vi.mocked(redis.get).mockResolvedValue('hash123');

      // Act
      await service.getHash('en', 'core');

      // Assert
      expect(vi.mocked(redis.get)).toHaveBeenCalledWith('i18n:hash:en:core');
    });

    it('should build tenant-specific hash key with tenant slug', async () => {
      // Arrange
      vi.mocked(redis.get).mockResolvedValue('hash456');

      // Act
      await service.getHash('it', 'crm', 'acme-corp');

      // Assert
      expect(vi.mocked(redis.get)).toHaveBeenCalledWith('i18n:hash:acme-corp:it:crm');
    });
  });

  describe('TTL handling', () => {
    it('should use default TTL (3600s) when not specified', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'en',
        namespace: 'core',
        contentHash: 'abc123',
        messages: {},
      };
      vi.mocked(redis.setex).mockResolvedValue('OK');

      // Act
      await service.setCached(bundle);

      // Assert
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith('i18n:en:core', 3600, expect.any(String));
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith('i18n:hash:en:core', 3600, 'abc123');
    });

    it('should use custom TTL when specified', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'en',
        namespace: 'core',
        contentHash: 'abc123',
        messages: {},
      };
      vi.mocked(redis.setex).mockResolvedValue('OK');

      // Act
      await service.setCached(bundle, undefined, 7200); // 2 hours

      // Assert
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith('i18n:en:core', 7200, expect.any(String));
      expect(vi.mocked(redis.setex)).toHaveBeenCalledWith('i18n:hash:en:core', 7200, 'abc123');
    });

    it('should apply same TTL to both bundle and hash keys', async () => {
      // Arrange
      const bundle: TranslationBundle = {
        locale: 'de',
        namespace: 'support',
        contentHash: 'xyz789',
        messages: {},
      };
      vi.mocked(redis.setex).mockResolvedValue('OK');

      // Act
      await service.setCached(bundle, 'tenant', 1800);

      // Assert
      const calls = vi.mocked(redis.setex).mock.calls;
      const bundleCall = calls.find((call) => call[0].includes('i18n:tenant:de'));
      const hashCall = calls.find((call) => call[0].includes('i18n:hash:tenant'));

      expect(bundleCall?.[1]).toBe(1800);
      expect(hashCall?.[1]).toBe(1800);
    });
  });
});
