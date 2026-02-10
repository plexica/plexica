/**
 * Marketplace Validation Schemas (M2.4)
 *
 * Zod schemas for validating marketplace operations:
 * - Plugin publishing
 * - Rating & reviews
 * - Search & filtering
 * - Version management
 */

import { z } from 'zod';

/**
 * Plugin Categories
 */
export const PluginCategorySchema = z.enum([
  'crm',
  'analytics',
  'billing',
  'marketing',
  'productivity',
  'communication',
  'integration',
  'security',
  'reporting',
  'automation',
  'other',
]);

export type PluginCategory = z.infer<typeof PluginCategorySchema>;

/**
 * Plugin Status
 */
export const PluginStatusSchema = z.enum([
  'DRAFT',
  'PENDING_REVIEW',
  'PUBLISHED',
  'DEPRECATED',
  'REJECTED',
]);

export type PluginStatus = z.infer<typeof PluginStatusSchema>;

/**
 * Semver version validation
 */
export const SemverSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9\-\.]+)?(\+[a-zA-Z0-9\-\.]+)?$/, {
    message: 'Must be a valid semver version (e.g., "1.0.0", "1.2.3-beta.1")',
  });

/**
 * Plugin Search Query
 */
export const SearchPluginsSchema = z.object({
  query: z.string().optional(),
  category: PluginCategorySchema.optional(),
  status: PluginStatusSchema.optional().default('PUBLISHED'),
  minRating: z.number().min(0).max(5).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'rating', 'downloads', 'installs', 'publishedAt']).default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type SearchPluginsDto = z.infer<typeof SearchPluginsSchema>;

/**
 * Publish Plugin - Create/Update
 */
export const PublishPluginSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  version: SemverSchema,
  description: z.string().min(10).max(500),
  longDescription: z.string().min(50).max(5000).optional(),
  category: PluginCategorySchema,
  author: z.string().min(1).max(200),
  authorEmail: z.string().email(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().min(1).max(100),
  icon: z.string().url().optional(),
  screenshots: z.array(z.string().url()).max(10).optional().default([]),
  demoUrl: z.string().url().optional(),
  manifest: z.record(z.string(), z.unknown()), // Plugin manifest JSON
  changelog: z.string().max(2000).optional(),
  assetUrl: z.string().url().optional(), // CDN URL for plugin bundle
});

export type PublishPluginDto = z.infer<typeof PublishPluginSchema>;

/**
 * Update Plugin Metadata (without publishing new version)
 */
export const UpdatePluginMetadataSchema = z.object({
  description: z.string().min(10).max(500).optional(),
  longDescription: z.string().min(50).max(5000).optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  icon: z.string().url().optional(),
  screenshots: z.array(z.string().url()).max(10).optional(),
  demoUrl: z.string().url().optional(),
});

export type UpdatePluginMetadataDto = z.infer<typeof UpdatePluginMetadataSchema>;

/**
 * Submit Plugin for Review
 */
export const SubmitForReviewSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export type SubmitForReviewDto = z.infer<typeof SubmitForReviewSchema>;

/**
 * Review Plugin (Super Admin)
 */
export const ReviewPluginSchema = z.object({
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(1000).optional(), // Required for reject
});

export type ReviewPluginDto = z.infer<typeof ReviewPluginSchema>;

/**
 * Rate Plugin
 */
export const RatePluginSchema = z.object({
  rating: z.number().int().min(1).max(5),
  review: z.string().max(2000).optional(),
});

export type RatePluginDto = z.infer<typeof RatePluginSchema>;

/**
 * Update Rating
 */
export const UpdateRatingSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  review: z.string().max(2000).optional(),
});

export type UpdateRatingDto = z.infer<typeof UpdateRatingSchema>;

/**
 * Mark Rating Helpful/Not Helpful
 */
export const VoteRatingSchema = z.object({
  helpful: z.boolean(), // true = helpful, false = not helpful
});

export type VoteRatingDto = z.infer<typeof VoteRatingSchema>;

/**
 * Install Plugin
 */
export const InstallPluginSchema = z.object({
  version: SemverSchema.optional(), // Install specific version, or latest
  configuration: z.record(z.string(), z.unknown()).default({}),
});

export type InstallPluginDto = z.infer<typeof InstallPluginSchema>;

/**
 * Uninstall Plugin
 */
export const UninstallPluginSchema = z.object({
  deleteData: z.boolean().default(false), // Whether to delete plugin data
});

export type UninstallPluginDto = z.infer<typeof UninstallPluginSchema>;

/**
 * Publish New Version
 */
export const PublishVersionSchema = z.object({
  version: SemverSchema,
  changelog: z.string().min(10).max(2000),
  manifest: z.record(z.string(), z.unknown()),
  assetUrl: z.string().url().optional(),
  setAsLatest: z.boolean().default(true),
});

export type PublishVersionDto = z.infer<typeof PublishVersionSchema>;

/**
 * Get Plugin Versions
 */
export const GetVersionsSchema = z.object({
  includeDeprecated: z.boolean().default(false),
});

export type GetVersionsDto = z.infer<typeof GetVersionsSchema>;

/**
 * Get Plugin Ratings
 */
export const GetRatingsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'rating', 'helpful']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  minRating: z.number().int().min(1).max(5).optional(),
});

export type GetRatingsDto = z.infer<typeof GetRatingsSchema>;

/**
 * Marketplace Stats Response
 */
export const MarketplaceStatsSchema = z.object({
  totalPlugins: z.number(),
  publishedPlugins: z.number(),
  totalDownloads: z.number(),
  totalInstalls: z.number(),
  averageRating: z.number(),
  topCategories: z.array(
    z.object({
      category: PluginCategorySchema,
      count: z.number(),
    })
  ),
  recentlyPublished: z.array(z.unknown()).optional(),
});

export type MarketplaceStatsDto = z.infer<typeof MarketplaceStatsSchema>;

/**
 * Plugin Analytics (for plugin authors)
 */
export const PluginAnalyticsSchema = z.object({
  timeRange: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
});

export type PluginAnalyticsDto = z.infer<typeof PluginAnalyticsSchema>;
