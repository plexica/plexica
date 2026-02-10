/**
 * Marketplace Service (M2.4)
 *
 * Handles all marketplace-related operations:
 * - Plugin publishing workflow
 * - Version management
 * - Rating & reviews
 * - Search & discovery
 * - Installation tracking
 * - Analytics
 */

import { db } from '../lib/db.js';
import { PluginStatus, Prisma, type PrismaClient } from '@plexica/database';
import type {
  PublishPluginDto,
  PublishVersionDto,
  RatePluginDto,
  SearchPluginsDto,
  ReviewPluginDto,
  UpdatePluginMetadataDto,
  InstallPluginDto,
} from '../schemas/marketplace.schema.js';
import semver from 'semver';

export class MarketplaceService {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = db) {
    this.db = dbClient;
  }

  /**
   * Search plugins in the marketplace
   */
  async searchPlugins(query: SearchPluginsDto) {
    const {
      query: searchQuery,
      category,
      status,
      minRating,
      page = 1,
      limit = 20,
      sortBy = 'publishedAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    // When status is provided, filter by it; when undefined, show all statuses (for admin views)
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (category) {
      where.category = category;
    }

    if (minRating) {
      where.averageRating = {
        gte: minRating,
      };
    }

    if (searchQuery) {
      where.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
        { author: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    // Build orderBy
    const orderBy: any = {};
    switch (sortBy) {
      case 'rating':
        orderBy.averageRating = sortOrder;
        break;
      case 'downloads':
        orderBy.downloadCount = sortOrder;
        break;
      case 'installs':
        orderBy.installCount = sortOrder;
        break;
      case 'publishedAt':
        orderBy.publishedAt = sortOrder;
        break;
      default:
        orderBy.name = sortOrder;
    }

    const [plugins, total] = await Promise.all([
      this.db.plugin.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          versions: {
            where: { isLatest: true },
            take: 1,
          },
          _count: {
            select: {
              ratings: true,
              installations: true,
            },
          },
        },
      }),
      this.db.plugin.count({ where }),
    ]);

    return {
      data: plugins,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get plugin details by ID
   */
  async getPluginById(pluginId: string, includeAllVersions = false) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
      include: {
        versions: includeAllVersions
          ? {
              orderBy: { publishedAt: 'desc' },
            }
          : {
              where: { isLatest: true },
              take: 1,
            },
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Latest 5 ratings
        },
        _count: {
          select: {
            ratings: true,
            installations: true,
            versions: true,
          },
        },
      },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    return plugin;
  }

  /**
   * Publish a new plugin (creates DRAFT)
   */
  async publishPlugin(dto: PublishPluginDto, _publisherId: string) {
    // Check if plugin with this ID already exists
    const existing = await this.db.plugin.findUnique({
      where: { id: dto.id },
    });

    if (existing) {
      throw new Error(
        `Plugin '${dto.id}' already exists. Use publishVersion() to add a new version.`
      );
    }

    // Validate semver
    if (!semver.valid(dto.version)) {
      throw new Error(`Invalid version: ${dto.version}`);
    }

    // Create plugin in DRAFT status
    const plugin = await this.db.plugin.create({
      data: {
        id: dto.id,
        name: dto.name,
        version: dto.version,
        manifest: dto.manifest as Prisma.InputJsonValue,
        status: PluginStatus.DRAFT,
        description: dto.description,
        longDescription: dto.longDescription,
        category: dto.category,
        author: dto.author,
        authorEmail: dto.authorEmail,
        homepage: dto.homepage,
        repository: dto.repository,
        license: dto.license,
        icon: dto.icon,
        screenshots: dto.screenshots || [],
        demoUrl: dto.demoUrl,
        // Create initial version
        versions: {
          create: {
            version: dto.version,
            changelog: dto.changelog || 'Initial release',
            manifest: dto.manifest as Prisma.InputJsonValue,
            assetUrl: dto.assetUrl,
            isLatest: true,
          },
        },
      },
      include: {
        versions: true,
      },
    });

    return plugin;
  }

  /**
   * Publish a new version of an existing plugin
   */
  async publishVersion(pluginId: string, dto: PublishVersionDto) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
      include: {
        versions: {
          orderBy: { publishedAt: 'desc' },
        },
      },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    // Validate semver
    if (!semver.valid(dto.version)) {
      throw new Error(`Invalid version: ${dto.version}`);
    }

    // Check if version already exists
    const existingVersion = plugin.versions.find((v) => v.version === dto.version);
    if (existingVersion) {
      throw new Error(`Version ${dto.version} already exists for plugin '${pluginId}'`);
    }

    // Validate version is higher than current
    const currentVersion = plugin.version;
    if (!semver.gt(dto.version, currentVersion)) {
      throw new Error(
        `New version ${dto.version} must be greater than current version ${currentVersion}`
      );
    }

    // If setAsLatest, unmark previous latest
    if (dto.setAsLatest) {
      await this.db.pluginVersion.updateMany({
        where: {
          pluginId,
          isLatest: true,
        },
        data: {
          isLatest: false,
        },
      });
    }

    // Create new version
    const newVersion = await this.db.pluginVersion.create({
      data: {
        pluginId,
        version: dto.version,
        changelog: dto.changelog,
        manifest: dto.manifest as Prisma.InputJsonValue,
        assetUrl: dto.assetUrl,
        isLatest: dto.setAsLatest,
      },
    });

    // Update plugin's current version if setAsLatest
    if (dto.setAsLatest) {
      await this.db.plugin.update({
        where: { id: pluginId },
        data: {
          version: dto.version,
          manifest: dto.manifest as Prisma.InputJsonValue,
        },
      });
    }

    return newVersion;
  }

  /**
   * Update plugin metadata (without creating new version)
   */
  async updatePluginMetadata(pluginId: string, dto: UpdatePluginMetadataDto) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    const updated = await this.db.plugin.update({
      where: { id: pluginId },
      data: {
        description: dto.description,
        longDescription: dto.longDescription,
        homepage: dto.homepage,
        repository: dto.repository,
        icon: dto.icon,
        screenshots: dto.screenshots,
        demoUrl: dto.demoUrl,
      },
    });

    return updated;
  }

  /**
   * Submit plugin for review (DRAFT -> PENDING_REVIEW)
   */
  async submitForReview(pluginId: string) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    if (plugin.status !== PluginStatus.DRAFT && plugin.status !== PluginStatus.REJECTED) {
      throw new Error(
        `Plugin must be in DRAFT or REJECTED status to submit for review. Current: ${plugin.status}`
      );
    }

    const updated = await this.db.plugin.update({
      where: { id: pluginId },
      data: {
        status: PluginStatus.PENDING_REVIEW,
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    return updated;
  }

  /**
   * Review plugin (Super Admin only)
   * Approve: PENDING_REVIEW -> PUBLISHED
   * Reject: PENDING_REVIEW -> REJECTED
   */
  async reviewPlugin(pluginId: string, dto: ReviewPluginDto) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    if (plugin.status !== PluginStatus.PENDING_REVIEW) {
      throw new Error(`Plugin must be in PENDING_REVIEW status. Current: ${plugin.status}`);
    }

    if (dto.action === 'approve') {
      const updated = await this.db.plugin.update({
        where: { id: pluginId },
        data: {
          status: PluginStatus.PUBLISHED,
          publishedAt: new Date(),
        },
      });
      return updated;
    } else {
      // reject
      if (!dto.reason) {
        throw new Error('Rejection reason is required');
      }

      const updated = await this.db.plugin.update({
        where: { id: pluginId },
        data: {
          status: PluginStatus.REJECTED,
          rejectedAt: new Date(),
          rejectionReason: dto.reason,
        },
      });
      return updated;
    }
  }

  /**
   * Deprecate a plugin
   */
  async deprecatePlugin(pluginId: string) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    const updated = await this.db.plugin.update({
      where: { id: pluginId },
      data: {
        status: PluginStatus.DEPRECATED,
      },
    });

    return updated;
  }

  /**
   * Rate a plugin
   */
  async ratePlugin(pluginId: string, tenantId: string, userId: string, dto: RatePluginDto) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    // Check if user already rated this plugin
    const existing = await this.db.pluginRating.findUnique({
      where: {
        pluginId_tenantId_userId: {
          pluginId,
          tenantId,
          userId,
        },
      },
    });

    if (existing) {
      throw new Error(
        'You have already rated this plugin. Use updateRating() to change your rating.'
      );
    }

    // Create rating
    const rating = await this.db.pluginRating.create({
      data: {
        pluginId,
        tenantId,
        userId,
        rating: dto.rating,
        review: dto.review,
      },
    });

    // Update plugin statistics
    await this.updatePluginRatingStats(pluginId);

    return rating;
  }

  /**
   * Update an existing rating
   */
  async updateRating(
    pluginId: string,
    tenantId: string,
    userId: string,
    updates: { rating?: number; review?: string }
  ) {
    const existing = await this.db.pluginRating.findUnique({
      where: {
        pluginId_tenantId_userId: {
          pluginId,
          tenantId,
          userId,
        },
      },
    });

    if (!existing) {
      throw new Error('Rating not found');
    }

    const updated = await this.db.pluginRating.update({
      where: {
        pluginId_tenantId_userId: {
          pluginId,
          tenantId,
          userId,
        },
      },
      data: updates,
    });

    // Update plugin statistics if rating changed
    if (updates.rating !== undefined) {
      await this.updatePluginRatingStats(pluginId);
    }

    return updated;
  }

  /**
   * Delete a rating
   */
  async deleteRating(pluginId: string, tenantId: string, userId: string) {
    await this.db.pluginRating.delete({
      where: {
        pluginId_tenantId_userId: {
          pluginId,
          tenantId,
          userId,
        },
      },
    });

    // Update plugin statistics
    await this.updatePluginRatingStats(pluginId);
  }

  /**
   * Get ratings for a plugin
   */
  async getPluginRatings(
    pluginId: string,
    options: { page?: number; limit?: number; minRating?: number } = {}
  ) {
    const { page = 1, limit = 20, minRating } = options;
    const skip = (page - 1) * limit;

    const where: any = { pluginId };
    if (minRating) {
      where.rating = { gte: minRating };
    }

    const [ratings, total] = await Promise.all([
      this.db.pluginRating.findMany({
        where,
        orderBy: [{ helpful: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.db.pluginRating.count({ where }),
    ]);

    return {
      data: ratings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark rating as helpful/not helpful
   */
  async voteRating(ratingId: string, helpful: boolean) {
    const rating = await this.db.pluginRating.findUnique({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new Error('Rating not found');
    }

    const updated = await this.db.pluginRating.update({
      where: { id: ratingId },
      data: helpful
        ? {
            helpful: { increment: 1 },
          }
        : {
            notHelpful: { increment: 1 },
          },
    });

    return updated;
  }

  /**
   * Install a plugin for a tenant (creates installation record)
   */
  async installPlugin(pluginId: string, tenantId: string, userId: string, dto: InstallPluginDto) {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
      include: {
        versions: {
          where: dto.version ? { version: dto.version } : { isLatest: true },
        },
      },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    if (plugin.status !== PluginStatus.PUBLISHED) {
      throw new Error(`Plugin must be PUBLISHED to install. Current status: ${plugin.status}`);
    }

    const version = dto.version || plugin.version;

    // Check if plugin is already installed
    const existing = await this.db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: {
          tenantId,
          pluginId,
        },
      },
    });

    if (existing) {
      throw new Error('Plugin is already installed for this tenant');
    }

    // Create TenantPlugin record
    const tenantPlugin = await this.db.tenantPlugin.create({
      data: {
        tenantId,
        pluginId,
        enabled: true,
        configuration: (dto.configuration || {}) as Prisma.InputJsonValue,
      },
    });

    // Create installation tracking record
    await this.db.pluginInstallation.create({
      data: {
        pluginId,
        version,
        tenantId,
        installedBy: userId,
      },
    });

    // Update plugin install count
    await this.db.plugin.update({
      where: { id: pluginId },
      data: {
        installCount: { increment: 1 },
      },
    });

    return tenantPlugin;
  }

  /**
   * Uninstall a plugin from a tenant
   */
  async uninstallPlugin(pluginId: string, tenantId: string) {
    const tenantPlugin = await this.db.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: {
          tenantId,
          pluginId,
        },
      },
    });

    if (!tenantPlugin) {
      throw new Error('Plugin is not installed for this tenant');
    }

    // Delete TenantPlugin record
    await this.db.tenantPlugin.delete({
      where: {
        tenantId_pluginId: {
          tenantId,
          pluginId,
        },
      },
    });

    // Mark installation as uninstalled
    await this.db.pluginInstallation.updateMany({
      where: {
        pluginId,
        tenantId,
        uninstalledAt: null,
      },
      data: {
        uninstalledAt: new Date(),
      },
    });

    // Update plugin install count
    await this.db.plugin.update({
      where: { id: pluginId },
      data: {
        installCount: { decrement: 1 },
      },
    });

    return { success: true };
  }

  /**
   * Get marketplace statistics
   */
  async getMarketplaceStats() {
    const [totalPlugins, publishedPlugins, stats, topCategories, recentlyPublished] =
      await Promise.all([
        this.db.plugin.count(),
        this.db.plugin.count({ where: { status: PluginStatus.PUBLISHED } }),
        this.db.plugin.aggregate({
          _sum: {
            downloadCount: true,
            installCount: true,
          },
          _avg: {
            averageRating: true,
          },
          where: {
            status: PluginStatus.PUBLISHED,
          },
        }),
        this.db.plugin.groupBy({
          by: ['category'],
          _count: true,
          where: {
            status: PluginStatus.PUBLISHED,
          },
          orderBy: {
            _count: {
              category: 'desc',
            },
          },
          take: 5,
        }),
        this.db.plugin.findMany({
          where: {
            status: PluginStatus.PUBLISHED,
          },
          orderBy: {
            publishedAt: 'desc',
          },
          take: 5,
        }),
      ]);

    return {
      totalPlugins,
      publishedPlugins,
      totalDownloads: stats._sum.downloadCount || 0,
      totalInstalls: stats._sum.installCount || 0,
      averageRating: stats._avg.averageRating || 0,
      topCategories: topCategories.map((cat) => ({
        category: cat.category,
        count: cat._count,
      })),
      recentlyPublished,
    };
  }

  /**
   * Get plugin analytics (for plugin authors)
   */
  async getPluginAnalytics(pluginId: string, timeRange: '7d' | '30d' | '90d' | 'all' = '30d') {
    const plugin = await this.db.plugin.findUnique({
      where: { id: pluginId },
      include: {
        versions: true,
        ratings: true,
        installations: true,
        _count: {
          select: {
            versions: true,
            ratings: true,
            installations: true,
          },
        },
      },
    });

    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found`);
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (timeRange) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    // Get installations in time range
    const installationsInRange = await this.db.pluginInstallation.count({
      where: {
        pluginId,
        installedAt: {
          gte: startDate,
        },
      },
    });

    // Get ratings in time range
    const ratingsInRange = await this.db.pluginRating.count({
      where: {
        pluginId,
        createdAt: {
          gte: startDate,
        },
      },
    });

    // Get rating distribution
    const ratingDistribution = await this.db.pluginRating.groupBy({
      by: ['rating'],
      _count: true,
      where: { pluginId },
    });

    return {
      plugin: {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        status: plugin.status,
        averageRating: plugin.averageRating,
        totalRatings: plugin.ratingCount,
        totalInstalls: plugin.installCount,
        totalDownloads: plugin.downloadCount,
      },
      timeRange,
      installationsInRange,
      ratingsInRange,
      ratingDistribution: ratingDistribution.reduce(
        (acc, item) => {
          acc[item.rating] = item._count;
          return acc;
        },
        {} as Record<number, number>
      ),
      versions: plugin.versions.map((v) => ({
        version: v.version,
        publishedAt: v.publishedAt,
        downloadCount: v.downloadCount,
        isLatest: v.isLatest,
      })),
    };
  }

  /**
   * Helper: Update plugin rating statistics
   */
  private async updatePluginRatingStats(pluginId: string) {
    const stats = await this.db.pluginRating.aggregate({
      where: { pluginId },
      _avg: {
        rating: true,
      },
      _count: true,
    });

    await this.db.plugin.update({
      where: { id: pluginId },
      data: {
        averageRating: stats._avg.rating || 0,
        ratingCount: stats._count,
      },
    });
  }
}

// Export singleton instance
export const marketplaceService = new MarketplaceService();
