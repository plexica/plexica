// services/registry.service.ts
// CRUD for core.plugins + core.plugin_versions.

import { PluginNotFoundError, PluginConflictError } from '../errors.js';

import type { PrismaClient } from '@prisma/client';
import type { RegisterPluginInput } from '../schema/api.js';
import type { Manifest } from '../schema/manifest.js';

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

export interface PaginatedPlugins {
  data: PluginRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export async function createPlugin(
  prisma: PrismaClient,
  data: RegisterPluginInput,
  createdBy: string
): Promise<PluginRecord> {
  const existing = await prisma.plugin.findUnique({ where: { slug: data.slug } });
  if (existing) {
    throw new PluginConflictError(`Plugin with slug "${data.slug}" already exists`);
  }

  return prisma.plugin.create({
    data: {
      slug: data.slug,
      name: data.name,
      version: data.manifest.version,
      author: data.manifest.author,
      iconUrl: data.manifest.icon ?? null,
      categories: data.manifest.categories,
      manifest: data.manifest as unknown as Record<string, unknown>,
      status: 'draft',
      registryUrl: data.registryUrl,
      imageName: data.imageName,
      imageTag: data.imageTag,
      imageDigest: data.imageDigest ?? null,
      pullPolicy: data.pullPolicy,
      registryCredentialsSecret: data.registryCredentialsSecret ?? null,
      createdByKeycloakId: createdBy,
    },
  }) as unknown as PluginRecord;
}

export async function findPluginBySlug(
  prisma: PrismaClient,
  slug: string
): Promise<PluginRecord | null> {
  const plugin = await prisma.plugin.findUnique({ where: { slug } });
  return plugin as unknown as PluginRecord | null;
}

export async function findPluginById(
  prisma: PrismaClient,
  id: string
): Promise<PluginRecord | null> {
  const plugin = await prisma.plugin.findUnique({ where: { id } });
  return plugin as unknown as PluginRecord | null;
}

export async function listPlugins(
  prisma: PrismaClient,
  options: PluginListOptions = {}
): Promise<PaginatedPlugins> {
  const { search, status, category, page = 1, pageSize = 20 } = options;
  const where: Record<string, unknown> = {};

  if (status) where.status = status;
  if (search) where.slug = { contains: search } as Record<string, unknown>;
  if (category) where.categories = { has: category };

  const [data, total] = await Promise.all([
    prisma.plugin.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.plugin.count({ where }),
  ]);

  return {
    data: data as unknown as PluginRecord[],
    total,
    page,
    pageSize,
  };
}

export async function updatePluginStatus(
  prisma: PrismaClient,
  slug: string,
  status: string
): Promise<PluginRecord> {
  const plugin = await prisma.plugin.findUnique({ where: { slug } });
  if (!plugin) throw new PluginNotFoundError(slug);

  return prisma.plugin.update({
    where: { slug },
    data: { status },
  }) as unknown as PluginRecord;
}

export async function addPluginVersion(
  prisma: PrismaClient,
  pluginId: string,
  version: string,
  manifest: Manifest,
  imageDigest?: string
): Promise<void> {
  await prisma.pluginVersion.create({
    data: {
      pluginId,
      version,
      manifest: manifest as unknown as Record<string, unknown>,
      imageDigest: imageDigest ?? null,
    },
  });
}

export async function listPluginVersions(
  prisma: PrismaClient,
  pluginId: string
): Promise<Array<{ version: string; createdAt: Date }>> {
  return prisma.pluginVersion.findMany({
    where: { pluginId },
    select: { version: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}
