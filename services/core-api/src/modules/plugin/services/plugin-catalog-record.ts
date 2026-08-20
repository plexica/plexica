// Public admin catalog projection for core.plugins.

import type { Plugin, PluginStatus, ReviewStatus } from '@plexica/api-types';
import type { Prisma } from '@prisma/client';

export const PLUGIN_CATALOG_SELECT = {
  id: true,
  slug: true,
  name: true,
  version: true,
  description: true,
  status: true,
  reviewStatus: true,
  author: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PluginSelect;

type PluginCatalogRow = Prisma.PluginGetPayload<{ select: typeof PLUGIN_CATALOG_SELECT }>;

export type PluginCatalogRecord = Omit<Plugin, 'installedCount' | 'createdAt' | 'updatedAt'> & {
  createdAt: Date;
  updatedAt: Date;
};

function parsePluginStatus(value: string): PluginStatus {
  switch (value) {
    case 'draft':
    case 'published':
    case 'unpublished':
    case 'deprecated':
      return value;
    default:
      throw new Error('Invalid plugin status stored in database');
  }
}

function parseReviewStatus(value: string): ReviewStatus {
  switch (value) {
    case 'none':
    case 'pending':
    case 'approved':
    case 'rejected':
      return value;
    default:
      throw new Error('Invalid plugin review status stored in database');
  }
}

export function toPluginCatalogRecord(row: PluginCatalogRow): PluginCatalogRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    version: row.version,
    description: row.description ?? '',
    status: parsePluginStatus(row.status),
    reviewStatus: parseReviewStatus(row.reviewStatus),
    author: row.author,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
