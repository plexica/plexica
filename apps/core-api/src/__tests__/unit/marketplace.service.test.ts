// apps/core-api/src/__tests__/unit/marketplace.service.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  SearchPluginsDto,
  PublishPluginDto,
  PublishVersionDto,
  RatePluginDto,
  UpdateRatingDto,
  InstallPluginDto,
  GetRatingsDto,
} from '../../schemas/marketplace.schema';

// Mock the entire @plexica/database package to avoid DATABASE_URL requirement
vi.mock('@plexica/database', () => ({
  PrismaClient: class MockPrismaClient {},
  PluginStatus: {
    DRAFT: 'DRAFT',
    PENDING_REVIEW: 'PENDING_REVIEW',
    PUBLISHED: 'PUBLISHED',
    REJECTED: 'REJECTED',
    DEPRECATED: 'DEPRECATED',
  },
  Prisma: {
    PluginScalarFieldEnum: {},
  },
}));

// Mock the database module
vi.mock('../../lib/db.js', () => ({
  db: {},
}));

import type { PrismaClient } from '@plexica/database';
import { MarketplaceService } from '../../services/marketplace.service';

// Define PluginStatus as constants
const PluginStatus = {
  DRAFT: 'DRAFT' as const,
  PENDING_REVIEW: 'PENDING_REVIEW' as const,
  PUBLISHED: 'PUBLISHED' as const,
  REJECTED: 'REJECTED' as const,
  DEPRECATED: 'DEPRECATED' as const,
};

describe('MarketplaceService - Search and Discovery', () => {
  let marketplaceService: MarketplaceService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      plugin: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        aggregate: vi.fn(),
      },
      pluginVersion: {
        findMany: vi.fn(),
      },
      pluginRating: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    marketplaceService = new MarketplaceService(mockPrisma as unknown as PrismaClient);
  });

  describe('searchPlugins', () => {
    it('should return all published plugins with default pagination', async () => {
      const mockPlugins = [
        {
          id: 'crm',
          name: 'CRM',
          version: '1.2.0',
          status: PluginStatus.PUBLISHED,
          description: 'Customer Relationship Management',
          category: 'crm',
          averageRating: 4.5,
          ratingCount: 24,
          downloadCount: 156,
          installCount: 89,
          author: 'Plexica Team',
          manifest: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          versions: [],
          _count: { ratings: 24, installations: 89 },
        },
        {
          id: 'analytics',
          name: 'Analytics',
          version: '2.0.1',
          status: PluginStatus.PUBLISHED,
          description: 'Advanced analytics',
          category: 'analytics',
          averageRating: 4.8,
          ratingCount: 42,
          downloadCount: 287,
          installCount: 156,
          author: 'Plexica Team',
          manifest: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          versions: [],
          _count: { ratings: 42, installations: 156 },
        },
      ];

      mockPrisma.plugin.findMany.mockResolvedValue(mockPlugins);
      mockPrisma.plugin.count.mockResolvedValue(2);

      const params: Partial<SearchPluginsDto> = {};
      const result = await marketplaceService.searchPlugins(params as SearchPluginsDto);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(mockPrisma.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
          skip: 0,
          take: 20,
        })
      );
    });

    it('should filter plugins by search query', async () => {
      mockPrisma.plugin.findMany.mockResolvedValue([]);
      mockPrisma.plugin.count.mockResolvedValue(0);

      const params: Partial<SearchPluginsDto> = { query: 'CRM' };
      await marketplaceService.searchPlugins(params as SearchPluginsDto);

      expect(mockPrisma.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'CRM', mode: 'insensitive' } },
              { description: { contains: 'CRM', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });

    it('should filter plugins by category', async () => {
      mockPrisma.plugin.findMany.mockResolvedValue([]);
      mockPrisma.plugin.count.mockResolvedValue(0);

      const params: Partial<SearchPluginsDto> = { category: 'crm' };
      await marketplaceService.searchPlugins(params as SearchPluginsDto);

      expect(mockPrisma.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'crm',
          }),
        })
      );
    });

    it('should sort plugins by rating', async () => {
      mockPrisma.plugin.findMany.mockResolvedValue([]);
      mockPrisma.plugin.count.mockResolvedValue(0);

      const params: Partial<SearchPluginsDto> = { sortBy: 'rating' };
      await marketplaceService.searchPlugins(params as SearchPluginsDto);

      expect(mockPrisma.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { averageRating: expect.any(String) },
        })
      );
    });

    it('should sort plugins by downloads', async () => {
      mockPrisma.plugin.findMany.mockResolvedValue([]);
      mockPrisma.plugin.count.mockResolvedValue(0);

      const params: Partial<SearchPluginsDto> = { sortBy: 'downloads' };
      await marketplaceService.searchPlugins(params as SearchPluginsDto);

      expect(mockPrisma.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { downloadCount: expect.any(String) },
        })
      );
    });

    it('should handle pagination correctly', async () => {
      mockPrisma.plugin.findMany.mockResolvedValue([]);
      mockPrisma.plugin.count.mockResolvedValue(100);

      const params: Partial<SearchPluginsDto> = { page: 3, limit: 10 };
      const result = await marketplaceService.searchPlugins(params as SearchPluginsDto);

      expect(mockPrisma.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20, // (page 3 - 1) * 10
          take: 10,
        })
      );
      expect(result.pagination.totalPages).toBe(10);
    });
  });

  describe('getPluginById', () => {
    it('should return plugin details without all versions by default', async () => {
      const mockPlugin = {
        id: 'crm',
        name: 'CRM',
        version: '1.2.0',
        status: PluginStatus.PUBLISHED,
        description: 'Customer Relationship Management',
        manifest: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [{ version: '1.2.0', isLatest: true }],
        ratings: [],
        _count: { ratings: 24, installations: 89, versions: 3 },
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      const result = await marketplaceService.getPluginById('crm');

      expect(result).toEqual(mockPlugin);
      expect(mockPrisma.plugin.findUnique).toHaveBeenCalledWith({
        where: { id: 'crm' },
        include: expect.objectContaining({
          versions: expect.objectContaining({
            where: { isLatest: true },
            take: 1,
          }),
        }),
      });
    });

    it('should return plugin details with all versions when requested', async () => {
      const mockPlugin = {
        id: 'crm',
        name: 'CRM',
        versions: [
          { version: '1.0.0', isLatest: false },
          { version: '1.1.0', isLatest: false },
          { version: '1.2.0', isLatest: true },
        ],
        ratings: [],
        _count: { ratings: 24, installations: 89, versions: 3 },
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      const result = await marketplaceService.getPluginById('crm', true);

      expect(result.versions).toHaveLength(3);
      expect(mockPrisma.plugin.findUnique).toHaveBeenCalledWith({
        where: { id: 'crm' },
        include: expect.objectContaining({
          versions: expect.objectContaining({
            orderBy: { publishedAt: 'desc' },
          }),
        }),
      });
    });

    it('should throw error if plugin not found', async () => {
      mockPrisma.plugin.findUnique.mockResolvedValue(null);

      await expect(marketplaceService.getPluginById('nonexistent')).rejects.toThrow(
        "Plugin 'nonexistent' not found"
      );
    });
  });

  describe('getMarketplaceStats', () => {
    it('should return overall marketplace statistics', async () => {
      // Mock count calls - first for total, second for published
      mockPrisma.plugin.count
        .mockResolvedValueOnce(100) // total plugins
        .mockResolvedValueOnce(50); // published plugins

      mockPrisma.plugin.aggregate.mockResolvedValue({
        _sum: { downloadCount: 5000, installCount: 2500 },
        _avg: { averageRating: 4.5 },
      });

      // Mock groupBy for top categories
      mockPrisma.plugin.groupBy = vi.fn().mockResolvedValue([
        { category: 'crm', _count: 10 },
        { category: 'analytics', _count: 8 },
        { category: 'billing', _count: 5 },
      ]);

      // Mock findMany for recently published
      mockPrisma.plugin.findMany.mockResolvedValue([
        { id: 'plugin1', name: 'Plugin 1', publishedAt: new Date() },
        { id: 'plugin2', name: 'Plugin 2', publishedAt: new Date() },
      ]);

      const stats = await marketplaceService.getMarketplaceStats();

      expect(stats.totalPlugins).toBe(100);
      expect(stats.publishedPlugins).toBe(50);
      expect(stats.totalDownloads).toBe(5000);
      expect(stats.totalInstalls).toBe(2500);
      expect(stats.averageRating).toBe(4.5);
      expect(stats.topCategories).toHaveLength(3);
    });
  });
});

describe('MarketplaceService - Publishing Workflow', () => {
  let marketplaceService: MarketplaceService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      plugin: {
        create: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      pluginVersion: {
        create: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    marketplaceService = new MarketplaceService(mockPrisma as unknown as PrismaClient);
  });

  describe('publishPlugin', () => {
    it('should create a new plugin in DRAFT status', async () => {
      const pluginData: PublishPluginDto = {
        id: 'new-plugin',
        name: 'New Plugin',
        description: 'A new plugin for testing',
        category: 'utility',
        version: '1.0.0',
        manifest: {
          id: 'new-plugin',
          name: 'New Plugin',
          version: '1.0.0',
        },
        author: 'Developer',
        authorEmail: 'dev@example.com',
        license: 'MIT',
        screenshots: [],
      };

      const mockCreatedPlugin = {
        ...pluginData,
        status: PluginStatus.DRAFT,
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [{ version: '1.0.0', isLatest: true }],
      };

      mockPrisma.plugin.create.mockResolvedValue(mockCreatedPlugin);

      const result = await marketplaceService.publishPlugin(pluginData);

      expect(result.status).toBe(PluginStatus.DRAFT);
      expect(mockPrisma.plugin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: PluginStatus.DRAFT,
          id: 'new-plugin',
          name: 'New Plugin',
        }),
        include: { versions: true },
      });
    });
  });

  describe('publishVersion', () => {
    it('should create a new version and mark it as latest', async () => {
      const mockPlugin = {
        id: 'crm',
        version: '1.0.0',
        manifest: {},
        versions: [{ version: '1.0.0', isLatest: true }],
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginVersion.create.mockResolvedValue({
        id: 'version-id',
        version: '1.1.0',
        isLatest: true,
        changelog: 'New features',
        manifest: {},
      });
      mockPrisma.plugin.update.mockResolvedValue({});

      const versionData: PublishVersionDto = {
        version: '1.1.0',
        changelog: 'New features added',
        manifest: {},
        setAsLatest: true,
      };

      const result = await marketplaceService.publishVersion('crm', versionData);

      expect(result.isLatest).toBe(true);
      expect(mockPrisma.pluginVersion.updateMany).toHaveBeenCalledWith({
        where: { pluginId: 'crm', isLatest: true },
        data: { isLatest: false },
      });
    });

    it('should throw error if version already exists', async () => {
      const mockPlugin = {
        id: 'crm',
        version: '1.0.0',
        versions: [{ version: '1.0.0', isLatest: true }],
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      const versionData: PublishVersionDto = {
        version: '1.0.0',
        changelog: 'Duplicate version',
        manifest: {},
        setAsLatest: true,
      };

      await expect(marketplaceService.publishVersion('crm', versionData)).rejects.toThrow(
        'Version 1.0.0 already exists'
      );
    });

    it('should throw error if new version is not greater than current', async () => {
      const mockPlugin = {
        id: 'crm',
        version: '2.0.0',
        versions: [{ version: '2.0.0', isLatest: true }],
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      const versionData: PublishVersionDto = {
        version: '1.5.0',
        changelog: 'Older version',
        manifest: {},
        setAsLatest: true,
      };

      await expect(marketplaceService.publishVersion('crm', versionData)).rejects.toThrow(
        'must be greater than current version'
      );
    });
  });

  describe('submitForReview', () => {
    it('should transition plugin from DRAFT to PENDING_REVIEW', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.DRAFT,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.plugin.update.mockResolvedValue({
        ...mockPlugin,
        status: PluginStatus.PENDING_REVIEW,
      });

      const result = await marketplaceService.submitForReview('plugin1');

      expect(result.status).toBe(PluginStatus.PENDING_REVIEW);
      expect(mockPrisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'plugin1' },
        data: {
          status: PluginStatus.PENDING_REVIEW,
          rejectedAt: null,
          rejectionReason: null,
        },
      });
    });

    it('should allow resubmission of REJECTED plugin', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.REJECTED,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.plugin.update.mockResolvedValue({
        ...mockPlugin,
        status: PluginStatus.PENDING_REVIEW,
      });

      const result = await marketplaceService.submitForReview('plugin1');

      expect(result.status).toBe(PluginStatus.PENDING_REVIEW);
    });

    it('should reject submission if not in DRAFT or REJECTED status', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.PUBLISHED,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      await expect(marketplaceService.submitForReview('plugin1')).rejects.toThrow(
        'Plugin must be in DRAFT or REJECTED status'
      );
    });
  });

  describe('reviewPlugin', () => {
    it('should approve plugin and set to PUBLISHED', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.PENDING_REVIEW,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.plugin.update.mockResolvedValue({
        ...mockPlugin,
        status: PluginStatus.PUBLISHED,
        publishedAt: new Date(),
      });

      const result = await marketplaceService.reviewPlugin('plugin1', {
        action: 'approve',
      });

      expect(result.status).toBe(PluginStatus.PUBLISHED);
      expect(mockPrisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'plugin1' },
        data: expect.objectContaining({
          status: PluginStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      });
    });

    it('should reject plugin with reason', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.PENDING_REVIEW,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.plugin.update.mockResolvedValue({
        ...mockPlugin,
        status: PluginStatus.REJECTED,
      });

      const result = await marketplaceService.reviewPlugin('plugin1', {
        action: 'reject',
        reason: 'Does not meet quality standards',
      });

      expect(result.status).toBe(PluginStatus.REJECTED);
      expect(mockPrisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'plugin1' },
        data: expect.objectContaining({
          status: PluginStatus.REJECTED,
          rejectedAt: expect.any(Date),
          rejectionReason: 'Does not meet quality standards',
        }),
      });
    });

    it('should reject review if plugin not in PENDING_REVIEW status', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.DRAFT,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      await expect(
        marketplaceService.reviewPlugin('plugin1', { action: 'approve' })
      ).rejects.toThrow('Plugin must be in PENDING_REVIEW status');
    });

    it('should throw error if rejecting without reason', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.PENDING_REVIEW,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      await expect(
        marketplaceService.reviewPlugin('plugin1', { action: 'reject' })
      ).rejects.toThrow('Rejection reason is required');
    });
  });

  describe('deprecatePlugin', () => {
    it('should deprecate a published plugin', async () => {
      const mockPlugin = {
        id: 'plugin1',
        status: PluginStatus.PUBLISHED,
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.plugin.update.mockResolvedValue({
        ...mockPlugin,
        status: PluginStatus.DEPRECATED,
      });

      const result = await marketplaceService.deprecatePlugin('plugin1');

      expect(result.status).toBe(PluginStatus.DEPRECATED);
      expect(mockPrisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'plugin1' },
        data: {
          status: PluginStatus.DEPRECATED,
        },
      });
    });

    it('should throw error if plugin not found', async () => {
      mockPrisma.plugin.findUnique.mockResolvedValue(null);

      await expect(marketplaceService.deprecatePlugin('nonexistent')).rejects.toThrow(
        `Plugin 'nonexistent' not found`
      );
    });
  });
});

describe('MarketplaceService - Rating System', () => {
  let marketplaceService: MarketplaceService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      plugin: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      pluginRating: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
      },
    };

    marketplaceService = new MarketplaceService(mockPrisma as unknown as PrismaClient);
  });

  describe('ratePlugin', () => {
    it('should create a new rating for a plugin', async () => {
      const mockPlugin = { id: 'crm', averageRating: 0, ratingCount: 0 };
      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginRating.findUnique.mockResolvedValue(null);
      mockPrisma.pluginRating.create.mockResolvedValue({
        id: 'rating-1',
        pluginId: 'crm',
        tenantId: 'tenant-1',
        userId: 'user-1',
        rating: 5,
        review: 'Excellent plugin!',
      });
      mockPrisma.pluginRating.aggregate.mockResolvedValue({
        _avg: { rating: 5 },
        _count: { rating: 1 },
      });
      mockPrisma.plugin.update.mockResolvedValue({});

      const ratingData: RatePluginDto = {
        rating: 5,
        review: 'Excellent plugin!',
      };

      const result = await marketplaceService.ratePlugin('crm', 'tenant-1', 'user-1', ratingData);

      expect(result.rating).toBe(5);
      expect(mockPrisma.pluginRating.create).toHaveBeenCalledWith({
        data: {
          pluginId: 'crm',
          tenantId: 'tenant-1',
          userId: 'user-1',
          rating: 5,
          review: 'Excellent plugin!',
        },
      });
    });

    it('should throw error if plugin not found', async () => {
      mockPrisma.plugin.findUnique.mockResolvedValue(null);

      const ratingData: RatePluginDto = { rating: 5 };

      await expect(
        marketplaceService.ratePlugin('nonexistent', 'tenant-1', 'user-1', ratingData)
      ).rejects.toThrow(`Plugin 'nonexistent' not found`);
    });

    it('should throw error if rating already exists', async () => {
      const mockPlugin = { id: 'crm' };
      const existingRating = { id: 'rating-1', rating: 4 };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginRating.findUnique.mockResolvedValue(existingRating);

      const ratingData: RatePluginDto = { rating: 5 };

      await expect(
        marketplaceService.ratePlugin('crm', 'tenant-1', 'user-1', ratingData)
      ).rejects.toThrow('already rated');
    });

    it('should validate rating is between 1 and 5', async () => {
      const mockPlugin = { id: 'crm' };
      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginRating.findUnique.mockResolvedValue(null);

      // This validation happens at schema level, but service should handle it
      const invalidRating: RatePluginDto = { rating: 6 };

      await expect(
        marketplaceService.ratePlugin('crm', 'tenant-1', 'user-1', invalidRating)
      ).rejects.toThrow();
    });
  });

  describe('updateRating', () => {
    it('should update an existing rating', async () => {
      const existingRating = {
        id: 'rating-1',
        pluginId: 'crm',
        rating: 4,
        review: 'Good',
      };

      mockPrisma.pluginRating.findUnique.mockResolvedValue(existingRating);
      mockPrisma.pluginRating.update.mockResolvedValue({
        ...existingRating,
        rating: 5,
        review: 'Excellent!',
      });
      mockPrisma.pluginRating.aggregate.mockResolvedValue({
        _avg: { rating: 4.5 },
        _count: { rating: 10 },
      });
      mockPrisma.plugin.update.mockResolvedValue({});

      const updateData: UpdateRatingDto = {
        rating: 5,
        review: 'Excellent!',
      };

      const result = await marketplaceService.updateRating('crm', 'tenant-1', 'user-1', updateData);

      expect(result.rating).toBe(5);
      expect(mockPrisma.pluginRating.update).toHaveBeenCalled();
    });

    it('should throw error if rating not found', async () => {
      mockPrisma.pluginRating.findUnique.mockResolvedValue(null);

      const updateData: UpdateRatingDto = { rating: 5 };

      await expect(
        marketplaceService.updateRating('crm', 'tenant-1', 'user-1', updateData)
      ).rejects.toThrow('not found');
    });
  });

  describe('deleteRating', () => {
    it('should delete an existing rating', async () => {
      const existingRating = {
        id: 'rating-1',
        pluginId: 'crm',
        rating: 4,
      };

      mockPrisma.pluginRating.delete.mockResolvedValue(existingRating);
      mockPrisma.pluginRating.aggregate.mockResolvedValue({
        _avg: { rating: 4.2 },
        _count: { rating: 9 },
      });
      mockPrisma.plugin.update.mockResolvedValue({});

      await marketplaceService.deleteRating('crm', 'tenant-1', 'user-1');

      expect(mockPrisma.pluginRating.delete).toHaveBeenCalledWith({
        where: {
          pluginId_tenantId_userId: {
            pluginId: 'crm',
            tenantId: 'tenant-1',
            userId: 'user-1',
          },
        },
      });
    });
  });

  describe('getPluginRatings', () => {
    it('should return paginated ratings for a plugin', async () => {
      const mockRatings = [
        { id: 'rating-1', rating: 5, review: 'Great!' },
        { id: 'rating-2', rating: 4, review: 'Good' },
      ];

      mockPrisma.pluginRating.findMany.mockResolvedValue(mockRatings);
      mockPrisma.pluginRating.count.mockResolvedValue(2);

      const params: GetRatingsDto = {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      const result = await marketplaceService.getPluginRatings('crm', params);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(mockPrisma.pluginRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { pluginId: 'crm' },
          skip: 0,
          take: 20,
        })
      );
    });

    it('should filter ratings by minRating', async () => {
      const mockRatings = [{ id: 'rating-1', rating: 5, review: 'Great!' }];

      mockPrisma.pluginRating.findMany.mockResolvedValue(mockRatings);
      mockPrisma.pluginRating.count.mockResolvedValue(1);

      const params: GetRatingsDto = {
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        minRating: 4,
      };

      const result = await marketplaceService.getPluginRatings('crm', params);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.pluginRating.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            pluginId: 'crm',
            rating: { gte: 4 },
          },
          skip: 0,
          take: 20,
        })
      );
    });
  });

  describe('voteRating', () => {
    it('should mark rating as helpful', async () => {
      const mockRating = {
        id: 'rating-1',
        helpful: 5,
        notHelpful: 1,
      };

      mockPrisma.pluginRating.findUnique.mockResolvedValue(mockRating);
      mockPrisma.pluginRating.update.mockResolvedValue({
        ...mockRating,
        helpful: 6,
      });

      const result = await marketplaceService.voteRating('rating-1', true);

      expect(result.helpful).toBe(6);
      expect(mockPrisma.pluginRating.update).toHaveBeenCalledWith({
        where: { id: 'rating-1' },
        data: { helpful: { increment: 1 } },
      });
    });

    it('should mark rating as not helpful', async () => {
      const mockRating = {
        id: 'rating-1',
        helpful: 5,
        notHelpful: 1,
      };

      mockPrisma.pluginRating.findUnique.mockResolvedValue(mockRating);
      mockPrisma.pluginRating.update.mockResolvedValue({
        ...mockRating,
        notHelpful: 2,
      });

      const result = await marketplaceService.voteRating('rating-1', false);

      expect(result.notHelpful).toBe(2);
      expect(mockPrisma.pluginRating.update).toHaveBeenCalledWith({
        where: { id: 'rating-1' },
        data: { notHelpful: { increment: 1 } },
      });
    });

    it('should throw error if rating not found', async () => {
      mockPrisma.pluginRating.findUnique.mockResolvedValue(null);

      await expect(marketplaceService.voteRating('nonexistent-rating', true)).rejects.toThrow(
        'Rating not found'
      );
    });
  });
});

describe('MarketplaceService - Installation Tracking', () => {
  let marketplaceService: MarketplaceService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      plugin: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      pluginVersion: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      tenantPlugin: {
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      pluginInstallation: {
        findFirst: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    marketplaceService = new MarketplaceService(mockPrisma as unknown as PrismaClient);
  });

  describe('installPlugin', () => {
    it('should track plugin installation with latest version', async () => {
      const mockPlugin = {
        id: 'crm',
        status: PluginStatus.PUBLISHED,
        version: '1.2.0',
        installCount: 10,
        versions: [{ version: '1.2.0', isLatest: true }],
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.tenantPlugin.findUnique.mockResolvedValue(null);
      mockPrisma.tenantPlugin.create.mockResolvedValue({
        id: 'tp-1',
        tenantId: 'tenant-1',
        pluginId: 'crm',
        enabled: true,
        configuration: {},
      });
      mockPrisma.pluginInstallation.create.mockResolvedValue({
        id: 'install-1',
        pluginId: 'crm',
        version: '1.2.0',
        tenantId: 'tenant-1',
        installedBy: 'user-1',
      });
      mockPrisma.plugin.update.mockResolvedValue({});

      const result = await marketplaceService.installPlugin('crm', 'tenant-1', 'user-1', {
        configuration: {},
      });

      expect(result.pluginId).toBe('crm');
      expect(mockPrisma.tenantPlugin.create).toHaveBeenCalled();
      expect(mockPrisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'crm' },
        data: {
          installCount: { increment: 1 },
        },
      });
    });

    it('should track installation with specific version', async () => {
      const mockPlugin = {
        id: 'crm',
        status: PluginStatus.PUBLISHED,
        version: '1.2.0',
        installCount: 10,
        versions: [{ version: '1.0.0' }],
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.tenantPlugin.findUnique.mockResolvedValue(null);
      mockPrisma.tenantPlugin.create.mockResolvedValue({
        id: 'tp-1',
        pluginId: 'crm',
      });
      mockPrisma.pluginInstallation.create.mockResolvedValue({
        id: 'install-1',
        version: '1.0.0',
      });
      mockPrisma.plugin.update.mockResolvedValue({});

      const installDto: InstallPluginDto = { version: '1.0.0', configuration: {} };
      const result = await marketplaceService.installPlugin(
        'crm',
        'tenant-1',
        'user-1',
        installDto
      );

      expect(result.pluginId).toBe('crm');
    });

    it('should throw error if plugin already installed', async () => {
      const mockPlugin = {
        id: 'crm',
        status: PluginStatus.PUBLISHED,
      };
      const existingTenantPlugin = { id: 'tp-1', pluginId: 'crm', tenantId: 'tenant-1' };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.tenantPlugin.findUnique.mockResolvedValue(existingTenantPlugin);

      await expect(
        marketplaceService.installPlugin('crm', 'tenant-1', 'user-1', { configuration: {} })
      ).rejects.toThrow('already installed');
    });

    it('should throw error if plugin not found', async () => {
      mockPrisma.plugin.findUnique.mockResolvedValue(null);

      await expect(
        marketplaceService.installPlugin('nonexistent', 'tenant-1', 'user-1', { configuration: {} })
      ).rejects.toThrow(`Plugin 'nonexistent' not found`);
    });

    it('should throw error if plugin is not PUBLISHED', async () => {
      const mockPlugin = {
        id: 'crm',
        status: PluginStatus.DRAFT,
        version: '1.0.0',
        versions: [],
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);

      await expect(
        marketplaceService.installPlugin('crm', 'tenant-1', 'user-1', { configuration: {} })
      ).rejects.toThrow('Plugin must be PUBLISHED to install');
    });
  });

  describe('uninstallPlugin', () => {
    it('should track plugin uninstallation', async () => {
      const existingTenantPlugin = {
        id: 'tp-1',
        tenantId: 'tenant-1',
        pluginId: 'crm',
      };

      mockPrisma.tenantPlugin.findUnique.mockResolvedValue(existingTenantPlugin);
      mockPrisma.tenantPlugin.delete.mockResolvedValue(existingTenantPlugin);
      mockPrisma.pluginInstallation.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.plugin.update.mockResolvedValue({});

      const result = await marketplaceService.uninstallPlugin('crm', 'tenant-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.tenantPlugin.delete).toHaveBeenCalledWith({
        where: {
          tenantId_pluginId: {
            tenantId: 'tenant-1',
            pluginId: 'crm',
          },
        },
      });
      expect(mockPrisma.plugin.update).toHaveBeenCalledWith({
        where: { id: 'crm' },
        data: { installCount: { decrement: 1 } },
      });
    });

    it('should throw error if plugin not installed', async () => {
      mockPrisma.tenantPlugin.findUnique.mockResolvedValue(null);

      await expect(marketplaceService.uninstallPlugin('crm', 'tenant-1')).rejects.toThrow(
        'not installed'
      );
    });
  });
});

describe('MarketplaceService - Analytics', () => {
  let marketplaceService: MarketplaceService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      plugin: {
        findUnique: vi.fn(),
      },
      pluginInstallation: {
        count: vi.fn(),
      },
      pluginRating: {
        count: vi.fn(),
        groupBy: vi.fn(),
      },
    };

    marketplaceService = new MarketplaceService(mockPrisma as unknown as PrismaClient);
  });

  describe('getPluginAnalytics', () => {
    it('should return analytics for a plugin', async () => {
      const mockPlugin = {
        id: 'crm',
        name: 'CRM Plugin',
        version: '1.2.0',
        status: PluginStatus.PUBLISHED,
        averageRating: 4.5,
        ratingCount: 24,
        installCount: 89,
        downloadCount: 156,
        versions: [
          { version: '1.2.0', publishedAt: new Date(), downloadCount: 50, isLatest: true },
          { version: '1.1.0', publishedAt: new Date(), downloadCount: 40, isLatest: false },
        ],
        ratings: [],
        installations: [],
        _count: { versions: 2, ratings: 24, installations: 89 },
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginInstallation.count.mockResolvedValue(15); // Installations in range
      mockPrisma.pluginRating.count.mockResolvedValue(8); // Ratings in range
      mockPrisma.pluginRating.groupBy.mockResolvedValue([
        { rating: 5, _count: 10 },
        { rating: 4, _count: 8 },
        { rating: 3, _count: 4 },
        { rating: 2, _count: 1 },
        { rating: 1, _count: 1 },
      ]);

      const result = await marketplaceService.getPluginAnalytics('crm', '7d');

      expect(result.plugin.totalInstalls).toBe(89);
      expect(result.plugin.totalDownloads).toBe(156);
      expect(result.plugin.totalRatings).toBe(24);
      expect(result.plugin.averageRating).toBe(4.5);
      expect(result.timeRange).toBe('7d');
      expect(result.installationsInRange).toBe(15);
      expect(result.ratingsInRange).toBe(8);
      expect(result.ratingDistribution).toBeDefined();
      expect(result.versions).toHaveLength(2);
    });

    it('should support 30d timeRange', async () => {
      const mockPlugin = {
        id: 'crm',
        name: 'CRM Plugin',
        version: '1.2.0',
        status: PluginStatus.PUBLISHED,
        averageRating: 4.5,
        ratingCount: 24,
        installCount: 89,
        downloadCount: 156,
        versions: [],
        ratings: [],
        installations: [],
        _count: { versions: 0, ratings: 24, installations: 89 },
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginInstallation.count.mockResolvedValue(25);
      mockPrisma.pluginRating.count.mockResolvedValue(12);
      mockPrisma.pluginRating.groupBy.mockResolvedValue([]);

      const result = await marketplaceService.getPluginAnalytics('crm', '30d');

      expect(result.timeRange).toBe('30d');
      expect(result.installationsInRange).toBe(25);
    });

    it('should support 90d timeRange', async () => {
      const mockPlugin = {
        id: 'crm',
        name: 'CRM Plugin',
        version: '1.2.0',
        status: PluginStatus.PUBLISHED,
        averageRating: 4.5,
        ratingCount: 24,
        installCount: 89,
        downloadCount: 156,
        versions: [],
        ratings: [],
        installations: [],
        _count: { versions: 0, ratings: 24, installations: 89 },
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginInstallation.count.mockResolvedValue(40);
      mockPrisma.pluginRating.count.mockResolvedValue(18);
      mockPrisma.pluginRating.groupBy.mockResolvedValue([]);

      const result = await marketplaceService.getPluginAnalytics('crm', '90d');

      expect(result.timeRange).toBe('90d');
      expect(result.installationsInRange).toBe(40);
    });

    it('should support "all" timeRange', async () => {
      const mockPlugin = {
        id: 'crm',
        name: 'CRM Plugin',
        version: '1.2.0',
        status: PluginStatus.PUBLISHED,
        averageRating: 4.5,
        ratingCount: 24,
        installCount: 89,
        downloadCount: 156,
        versions: [],
        ratings: [],
        installations: [],
        _count: { versions: 0, ratings: 24, installations: 89 },
      };

      mockPrisma.plugin.findUnique.mockResolvedValue(mockPlugin);
      mockPrisma.pluginInstallation.count.mockResolvedValue(89);
      mockPrisma.pluginRating.count.mockResolvedValue(24);
      mockPrisma.pluginRating.groupBy.mockResolvedValue([]);

      const result = await marketplaceService.getPluginAnalytics('crm', 'all');

      expect(result.timeRange).toBe('all');
      expect(result.installationsInRange).toBe(89);
    });

    it('should throw error if plugin not found', async () => {
      mockPrisma.plugin.findUnique.mockResolvedValue(null);

      await expect(marketplaceService.getPluginAnalytics('nonexistent', '7d')).rejects.toThrow(
        "Plugin 'nonexistent' not found"
      );
    });
  });
});
