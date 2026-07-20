// services/tenant-list.service.ts
// Search/filter/paginate tenants in the core schema (S5-200).
//
// Uses the Prisma singleton via the withCoreDb wrapper (route layer).
// No tenant context — admin reads from the global core.tenants table.

import type { PrismaClient, Prisma } from '@prisma/client';
import type { TenantListItem, TenantListResponse } from '../schemas/tenant-schemas.js';

export interface TenantListOptions {
  search?: string;
  status?: 'active' | 'suspended' | 'pending_deletion' | 'deleted';
  page: number;
  pageSize: number;
}

// Select only the public tenant fields — prevents leaking config/bucket data.
const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  createdAt: true,
  version: true,
} as const satisfies Prisma.TenantSelect;

export async function listTenants(
  prisma: PrismaClient,
  options: TenantListOptions
): Promise<TenantListResponse> {
  const { search, status, page, pageSize } = options;

  const where: Prisma.TenantWhereInput = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    // Case-insensitive contains on name OR slug (PostgreSQL ILIKE under the hood).
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { slug: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      select: TENANT_SELECT,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenant.count({ where }),
  ]);

  const data: TenantListItem[] = rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    version: row.version,
  }));

  return { data, total, page, pageSize };
}
