/**
 * Unit tests for TranslationService
 *
 * Tests business logic with mocked dependencies (Prisma, filesystem, Redis).
 * Coverage target: ≥85% per Constitution Article 4.1 (core modules)
 *
 * Tests FR-001, FR-002, FR-003, FR-005, FR-006, FR-007, FR-011, FR-012
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TranslationService } from '../../../modules/i18n/i18n.service.js';
import type { TenantOverrides, NamespacedMessages } from '@plexica/i18n';
import { promises as fs } from 'fs';
import * as path from 'path';

// Mock modules
vi.mock('../../../lib/db.js', () => ({
  db: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Create mock for PluginLifecycleService
const mockGetInstalledPlugins = vi.fn();

vi.mock('../../../services/plugin.service.js', () => ({
  PluginLifecycleService: class MockPluginLifecycleService {
    getInstalledPlugins = mockGetInstalledPlugins;
  },
}));

vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
  },
}));

// Import mocked dependencies
import { db } from '../../../lib/db.js';

describe('TranslationService', () => {
  let service: TranslationService;
  let mockPluginService: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create service instance
    service = new TranslationService();

    // Get reference to mocked plugin service
    mockPluginService = (service as any).pluginService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTranslations', () => {
    const mockMessages: NamespacedMessages = {
      common: {
        greeting: 'Hello',
        farewell: 'Goodbye',
      },
    };

    const mockFlattenedMessages = {
      'common.greeting': 'Hello',
      'common.farewell': 'Goodbye',
    };

    beforeEach(() => {
      // Mock file system operations
      vi.mocked(fs.stat).mockResolvedValue({
        size: 1024, // 1KB - well under 200KB limit
      } as any);

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMessages));
    });

    it('should load translations for valid locale and namespace', async () => {
      // Act
      const result = await service.getTranslations('en', 'core');

      // Assert
      expect(result).toMatchObject({
        locale: 'en',
        namespace: 'core',
        messages: mockFlattenedMessages,
      });
      expect(result.contentHash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should merge tenant overrides when tenantSlug provided', async () => {
      // Arrange
      const tenantOverrides: TenantOverrides = {
        en: {
          core: {
            'common.greeting': 'Hello from Acme Corp!', // Override
          },
        },
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        id: 'tenant-uuid',
        translationOverrides: tenantOverrides,
      } as any);

      // Act
      const result = await service.getTranslations('en', 'core', 'acme-corp');

      // Assert
      expect(result.messages['common.greeting']).toBe('Hello from Acme Corp!');
      expect(result.messages['common.farewell']).toBe('Goodbye'); // Base value preserved
      expect(db.tenant.findUnique).toHaveBeenCalledWith({
        where: { slug: 'acme-corp' },
        select: { id: true, translationOverrides: true },
      });
    });

    it('should fallback to "en" when requested locale not found (FR-003)', async () => {
      // Arrange
      vi.mocked(fs.stat)
        .mockRejectedValueOnce(new Error('File not found')) // 'it' not found
        .mockResolvedValueOnce({ size: 1024 } as any); // 'en' found

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMessages));

      // Act
      const result = await service.getTranslations('it', 'core');

      // Assert
      expect(result.locale).toBe('en'); // Fallback locale
      expect(result.messages).toEqual(mockFlattenedMessages);
    });

    it('should throw error when neither requested nor fallback locale found', async () => {
      // Arrange: Both 'it' and 'en' (fallback) files don't exist
      vi.mocked(fs.stat).mockRejectedValue(new Error('File not found'));

      // Act & Assert: When even the fallback locale fails, the namespace doesn't exist
      await expect(service.getTranslations('it', 'core')).rejects.toThrow(
        /NAMESPACE_NOT_FOUND.*Translation file not found/
      );
    });

    it('should throw error for invalid locale format', async () => {
      // Act & Assert
      await expect(service.getTranslations('invalid-locale', 'core')).rejects.toThrow(
        /INVALID_LOCALE/
      );
    });

    it('should throw error for invalid namespace format', async () => {
      // Act & Assert
      await expect(service.getTranslations('en', 'Invalid_Namespace')).rejects.toThrow(
        /NAMESPACE_NOT_FOUND.*Invalid namespace format/
      );
    });

    it('should continue without overrides if tenant not found', async () => {
      // Arrange
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      // Act
      const result = await service.getTranslations('en', 'core', 'nonexistent-tenant');

      // Assert - Should return base translations without error
      expect(result.messages).toEqual(mockFlattenedMessages);
      expect(result.locale).toBe('en');
    });

    it('should generate different content hash for different translations', async () => {
      // Arrange
      const messages1 = { key1: 'value1' };
      const messages2 = { key2: 'value2' };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(messages1))
        .mockResolvedValueOnce(JSON.stringify(messages2));

      // Act
      const result1 = await service.getTranslations('en', 'namespace1');
      const result2 = await service.getTranslations('en', 'namespace2');

      // Assert
      expect(result1.contentHash).not.toBe(result2.contentHash);
    });
  });

  describe('loadNamespaceFile', () => {
    it('should load and flatten valid namespace file', async () => {
      // Arrange
      const mockMessages: NamespacedMessages = {
        dashboard: {
          title: 'Dashboard',
          actions: {
            save: 'Save',
          },
        },
      };

      vi.mocked(fs.stat).mockResolvedValue({ size: 5000 } as any);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockMessages));

      // Act
      const result = await service.loadNamespaceFile('en', 'core');

      // Assert
      expect(result).toEqual({
        'dashboard.title': 'Dashboard',
        'dashboard.actions.save': 'Save',
      });

      const expectedPath = path.join(process.cwd(), 'translations', 'en', 'core.json');
      expect(fs.stat).toHaveBeenCalledWith(expectedPath);
      expect(fs.readFile).toHaveBeenCalledWith(expectedPath, 'utf-8');
    });

    it('should throw error when file not found', async () => {
      // Arrange
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT: no such file'));

      // Act & Assert
      await expect(service.loadNamespaceFile('fr', 'core')).rejects.toThrow(
        /NAMESPACE_NOT_FOUND.*Translation file not found/
      );
    });

    it('should enforce 200KB file size limit (FR-012)', async () => {
      // Arrange
      const fileSize = 250 * 1024; // 250KB (256000 bytes) - over limit
      vi.mocked(fs.stat).mockResolvedValue({ size: fileSize } as any);

      // Act & Assert
      await expect(service.loadNamespaceFile('en', 'core')).rejects.toThrow(
        /FILE_TOO_LARGE.*exceeds 200KB limit.*256000 bytes/
      );
    });

    it('should accept file at exactly 200KB limit', async () => {
      // Arrange
      const fileSize = 200 * 1024; // Exactly 200KB
      vi.mocked(fs.stat).mockResolvedValue({ size: fileSize } as any);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ key: 'value' }));

      // Act
      const result = await service.loadNamespaceFile('en', 'core');

      // Assert - Should not throw
      expect(result).toBeDefined();
    });

    it('should parse JSON correctly', async () => {
      // Arrange
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
      vi.mocked(fs.readFile).mockResolvedValue('{"nested":{"key":"value"}}');

      // Act
      const result = await service.loadNamespaceFile('en', 'test');

      // Assert
      expect(result).toEqual({ 'nested.key': 'value' });
    });

    it('should throw error for invalid JSON', async () => {
      // Arrange
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 } as any);
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }');

      // Act & Assert
      await expect(service.loadNamespaceFile('en', 'core')).rejects.toThrow();
    });
  });

  describe('getEnabledNamespaces', () => {
    it('should return core namespace plus enabled plugin namespaces (FR-005)', async () => {
      // Arrange
      const mockInstallations = [
        {
          id: 'inst-1',
          enabled: true,
          plugin: {
            id: 'plugin-1',
            manifest: {
              translations: {
                namespaces: ['crm', 'crm-reports'],
              },
            },
          },
        },
        {
          id: 'inst-2',
          enabled: false, // Disabled - should be excluded
          plugin: {
            id: 'plugin-2',
            manifest: {
              translations: {
                namespaces: ['analytics'],
              },
            },
          },
        },
        {
          id: 'inst-3',
          enabled: true,
          plugin: {
            id: 'plugin-3',
            manifest: {
              translations: {
                namespaces: ['inventory'],
              },
            },
          },
        },
      ];

      mockPluginService.getInstalledPlugins.mockResolvedValue(mockInstallations);

      // Act
      const result = await service.getEnabledNamespaces('tenant-uuid');

      // Assert
      expect(result).toEqual(['core', 'crm', 'crm-reports', 'inventory']);
      expect(result).not.toContain('analytics'); // Disabled plugin excluded
      expect(mockPluginService.getInstalledPlugins).toHaveBeenCalledWith('tenant-uuid');
    });

    it('should return only core namespace when no plugins enabled', async () => {
      // Arrange
      mockPluginService.getInstalledPlugins.mockResolvedValue([]);

      // Act
      const result = await service.getEnabledNamespaces('tenant-uuid');

      // Assert
      expect(result).toEqual(['core']);
    });

    it('should deduplicate namespaces from multiple plugins', async () => {
      // Arrange
      const mockInstallations = [
        {
          id: 'inst-1',
          enabled: true,
          plugin: {
            manifest: {
              translations: {
                namespaces: ['shared', 'crm'],
              },
            },
          },
        },
        {
          id: 'inst-2',
          enabled: true,
          plugin: {
            manifest: {
              translations: {
                namespaces: ['shared', 'inventory'], // 'shared' appears twice
              },
            },
          },
        },
      ];

      mockPluginService.getInstalledPlugins.mockResolvedValue(mockInstallations);

      // Act
      const result = await service.getEnabledNamespaces('tenant-uuid');

      // Assert
      expect(result).toEqual(['core', 'shared', 'crm', 'inventory']);
      // 'shared' should appear only once
      expect(result.filter((ns) => ns === 'shared')).toHaveLength(1);
    });

    it('should handle plugins without translations field', async () => {
      // Arrange
      const mockInstallations = [
        {
          id: 'inst-1',
          enabled: true,
          plugin: {
            manifest: {
              // No translations field
            },
          },
        },
      ];

      mockPluginService.getInstalledPlugins.mockResolvedValue(mockInstallations);

      // Act
      const result = await service.getEnabledNamespaces('tenant-uuid');

      // Assert
      expect(result).toEqual(['core']); // Should not throw
    });
  });

  describe('getTenantOverrides', () => {
    it('should return tenant overrides from database', async () => {
      // Arrange
      const mockOverrides: TenantOverrides = {
        en: {
          core: {
            'common.greeting': 'Custom greeting',
          },
        },
        it: {
          core: {
            'common.farewell': 'Arrivederci',
          },
        },
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        translationOverrides: mockOverrides,
      } as any);

      // Act
      const result = await service.getTenantOverrides('tenant-uuid');

      // Assert
      expect(result).toEqual(mockOverrides);
      expect(db.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: 'tenant-uuid' },
        select: { translationOverrides: true },
      });
    });

    it('should return empty object when tenant has no overrides', async () => {
      // Arrange
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        translationOverrides: null,
      } as any);

      // Act
      const result = await service.getTenantOverrides('tenant-uuid');

      // Assert
      expect(result).toEqual({});
    });

    it('should throw error when tenant not found', async () => {
      // Arrange
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(service.getTenantOverrides('nonexistent-tenant')).rejects.toThrow(
        /TENANT_NOT_FOUND.*Tenant 'nonexistent-tenant' not found/
      );
    });
  });

  describe('updateTenantOverrides', () => {
    const validOverrides: TenantOverrides = {
      en: {
        core: {
          'common.greeting': 'Custom greeting',
        },
      },
    };

    it('should update tenant overrides in database (FR-006)', async () => {
      // Arrange
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        id: 'tenant-uuid',
      } as any);

      vi.mocked(db.tenant.update).mockResolvedValue({
        translationOverrides: validOverrides,
      } as any);

      // Act
      const result = await service.updateTenantOverrides('tenant-uuid', validOverrides);

      // Assert
      expect(result).toEqual(validOverrides);
      expect(db.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-uuid' },
        data: {
          translationOverrides: validOverrides,
        },
        select: { translationOverrides: true },
      });
    });

    it('should throw error when tenant not found', async () => {
      // Arrange
      vi.mocked(db.tenant.findUnique).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.updateTenantOverrides('nonexistent-tenant', validOverrides)
      ).rejects.toThrow(/TENANT_NOT_FOUND.*Tenant 'nonexistent-tenant' not found/);

      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it('should validate translation keys before update (FR-011)', async () => {
      // Arrange
      const invalidOverrides: TenantOverrides = {
        en: {
          core: {
            'invalid key with spaces': 'value', // Invalid: spaces not allowed
            'key-with-dashes': 'valid value',
          },
        },
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        id: 'tenant-uuid',
      } as any);

      // Act & Assert
      await expect(service.updateTenantOverrides('tenant-uuid', invalidOverrides)).rejects.toThrow(
        /INVALID_TRANSLATION_KEY/
      );

      expect(db.tenant.update).not.toHaveBeenCalled();
    });

    it('should accept overrides with valid translation keys', async () => {
      // Arrange
      const validOverrides: TenantOverrides = {
        en: {
          core: {
            'common.greeting': 'Hello',
            'dashboard.title': 'Dashboard',
            'auth.login.submit': 'Sign In',
          },
        },
      };

      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        id: 'tenant-uuid',
      } as any);

      vi.mocked(db.tenant.update).mockResolvedValue({
        translationOverrides: validOverrides,
      } as any);

      // Act
      const result = await service.updateTenantOverrides('tenant-uuid', validOverrides);

      // Assert - Should not throw
      expect(result).toEqual(validOverrides);
    });

    it('should handle empty overrides', async () => {
      // Arrange
      const emptyOverrides: TenantOverrides = {};

      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        id: 'tenant-uuid',
      } as any);

      vi.mocked(db.tenant.update).mockResolvedValue({
        translationOverrides: emptyOverrides,
      } as any);

      // Act
      const result = await service.updateTenantOverrides('tenant-uuid', emptyOverrides);

      // Assert
      expect(result).toEqual(emptyOverrides);
    });
  });

  describe('validateTranslationKeys', () => {
    it('should validate correct translation keys (FR-011)', () => {
      // Arrange - Only alphanumeric, dots, and underscores allowed
      const validKeys = [
        'common.greeting',
        'dashboard.title',
        'auth.login.form.email',
        'key_with_underscores',
        'CamelCaseKey',
      ];

      // Act
      const result = service.validateTranslationKeys(validKeys);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject keys with invalid characters', () => {
      // Arrange
      const invalidKeys = ['key with spaces', 'key@with@symbols', 'key/with/slashes'];

      // Act
      const result = service.validateTranslationKeys(invalidKeys);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].key).toBe('key with spaces');
    });

    it('should reject keys exceeding max length (FR-011: 128 chars)', () => {
      // Arrange
      const longKey = 'a'.repeat(129); // 129 characters (over limit)

      // Act
      const result = service.validateTranslationKeys([longKey]);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors[0].key).toBe(longKey);
    });

    it('should accept keys at max length boundary (128 chars)', () => {
      // Arrange
      const maxLengthKey = 'a'.repeat(128); // Exactly 128 characters

      // Act
      const result = service.validateTranslationKeys([maxLengthKey]);

      // Assert
      expect(result.valid).toBe(true);
    });

    it('should reject keys with _system prefix (reserved)', () => {
      // Arrange
      const reservedKeys = ['_system.internal', '_system.config'];

      // Act
      const result = service.validateTranslationKeys(reservedKeys);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('should handle empty array', () => {
      // Act
      const result = service.validateTranslationKeys([]);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return all errors for multiple invalid keys', () => {
      // Arrange
      const mixedKeys = ['valid.key', 'invalid key', 'another.valid.key', 'another invalid'];

      // Act
      const result = service.validateTranslationKeys(mixedKeys);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].key).toBe('invalid key');
      expect(result.errors[1].key).toBe('another invalid');
    });
  });

  describe('getContentHash', () => {
    beforeEach(() => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({ key: 'value' }));
    });

    it('should return 8-character hex hash', async () => {
      // Act
      const hash = await service.getContentHash('en', 'core');

      // Assert
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should return same hash for identical content', async () => {
      // Act
      const hash1 = await service.getContentHash('en', 'core');
      const hash2 = await service.getContentHash('en', 'core');

      // Assert
      expect(hash1).toBe(hash2);
    });

    it('should include tenant overrides in hash calculation', async () => {
      // Arrange
      vi.mocked(db.tenant.findUnique).mockResolvedValue({
        id: 'tenant-uuid',
        translationOverrides: {
          en: {
            core: {
              key: 'overridden value',
            },
          },
        },
      } as any);

      // Act
      const hashWithoutTenant = await service.getContentHash('en', 'core');
      const hashWithTenant = await service.getContentHash('en', 'core', 'acme-corp');

      // Assert - Hashes should be different
      expect(hashWithoutTenant).not.toBe(hashWithTenant);
    });
  });
});
