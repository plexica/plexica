// services/registry.service.ts
// CRUD for core.plugins + core.plugin_versions.

import { PluginNotFoundError, PluginConflictError } from '../errors.js';
import { buildPaginatedResult, type PaginatedResult } from '../../../lib/pagination.js';

import { PLUGIN_CATALOG_SELECT, toPluginCatalogRecord } from './plugin-catalog-record.js';

import type { Prisma } from '@prisma/client';
import type { CoreDbClient } from '../../../lib/database.js';
import type { RegisterPluginInput } from '../schema/api.js';
import type { Manifest } from '../schema/manifest.js';
import type { PluginCatalogRecord } from './plugin-catalog-record.js';

/** Internal registry record for mutations and lookups, not a public API projection. */
export interface PluginRecord {
  id: string;
  slug: string;
  name: string;
  version: string;
  author: string;
  iconUrl: string | null;
  categories: string[];
  manifest: Manifest;
  status: string;
  registryUrl: string;
  imageName: string;
  imageTag: string;
  imageDigest: string | null;
  pullPolicy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PluginListOptions {
  search?: string;
  status?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

// Generated core-schema row for core.plugins. PluginRecord is a deliberate
// projection of it: it omits operational/review/secret columns (description,
// reviewStatus/reviewNotes/reviewedAt/reviewedBy, registryCredentialsSecret,
// createdByKeycloakId) and narrows the two JSON columns to domain types.
type PluginRow = Prisma.PluginGetPayload<{}>;

/**
 * Maps a generated Plugin row to the PluginRecord domain shape.
 *
 * `manifest` and `categories` are `JsonValue` in the generated client; they
 * are written only from Zod-validated input (registerPluginSchema at the API
 * boundary, manifestSchema.safeParse in cli/seed-plugins.ts), so narrowing
 * them back is safe. Same idiom as user-profile/repository.ts rowToDto().
 */
function toPluginRecord(row: PluginRow): PluginRecord {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    version: row.version,
    author: row.author,
    iconUrl: row.iconUrl,
    categories: row.categories as string[],
    manifest: row.manifest as unknown as Manifest,
    status: row.status,
    registryUrl: row.registryUrl,
    imageName: row.imageName,
    imageTag: row.imageTag,
    imageDigest: row.imageDigest,
    pullPolicy: row.pullPolicy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type PaginatedPlugins = PaginatedResult<PluginCatalogRecord>;

export async function createPlugin(
  prisma: CoreDbClient,
  data: RegisterPluginInput,
  createdBy: string
): Promise<PluginRecord> {
  const existing = await prisma.plugin.findUnique({ where: { slug: data.slug } });
  if (existing) {
    throw new PluginConflictError(`Plugin with slug "${data.slug}" already exists`);
  }

  const created = await prisma.plugin.create({
    data: {
      slug: data.slug,
      name: data.name,
      description: data.manifest.description,
      version: data.manifest.version,
      author: data.manifest.author,
      iconUrl: data.manifest.icon ?? null,
      categories: data.manifest.categories,
      // Manifest (Zod-validated domain type) → Prisma JSON column input.
      manifest: data.manifest as unknown as Prisma.InputJsonValue,
      status: 'draft',
      registryUrl: data.registryUrl,
      imageName: data.imageName,
      imageTag: data.imageTag,
      imageDigest: data.imageDigest ?? null,
      pullPolicy: data.pullPolicy,
      registryCredentialsSecret: data.registryCredentialsSecret ?? null,
      createdByKeycloakId: createdBy,
    },
  });
  return toPluginRecord(created);
}

export async function findPluginBySlug(
  prisma: CoreDbClient,
  slug: string
): Promise<PluginRecord | null> {
  const plugin = await prisma.plugin.findUnique({ where: { slug } });
  return plugin === null ? null : toPluginRecord(plugin);
}

export async function listPlugins(
  prisma: CoreDbClient,
  options: PluginListOptions = {}
): Promise<PaginatedPlugins> {
  const { search, status, category, page = 1, pageSize = 20 } = options;
  const where: Prisma.PluginWhereInput = {};

  if (status) where.status = status;
  if (search) where.slug = { contains: search };
  // categories is a Json column — `array_contains`, not the scalar-list `has`.
  if (category) where.categories = { array_contains: category };

  const [data, total] = await Promise.all([
    prisma.plugin.findMany({
      where,
      select: PLUGIN_CATALOG_SELECT,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.plugin.count({ where }),
  ]);

  return buildPaginatedResult(data.map(toPluginCatalogRecord), total, { page, pageSize });
}

export async function updatePluginStatus(
  prisma: CoreDbClient,
  slug: string,
  status: string
): Promise<PluginRecord> {
  const plugin = await prisma.plugin.findUnique({ where: { slug } });
  if (!plugin) throw new PluginNotFoundError(slug);

  const updated = await prisma.plugin.update({
    where: { slug },
    data: { status },
  });
  return toPluginRecord(updated);
}

export async function listPluginVersions(
  prisma: CoreDbClient,
  pluginId: string
): Promise<Array<{ version: string; createdAt: Date }>> {
  return prisma.pluginVersion.findMany({
    where: { pluginId },
    select: { version: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}
