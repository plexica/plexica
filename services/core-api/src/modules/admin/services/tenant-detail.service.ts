// services/tenant-detail.service.ts
// Aggregates a single tenant's info with cross-schema counts and recent
// platform audit entries (S5-300 / Feature 005-03).
//
// Cross-schema reads use raw SQL against the tenant's PostgreSQL schema
// (tenant_<slug>). The schema name is derived from core.tenants.slug via
// toSchemaName() and is re-validated against a strict regex before any
// interpolation — it is never user input (Security §3, no SQL injection).
//
// The core PrismaClient only models the core schema, so tenant-schema
// tables (user_profile, workspaces, plugin_installations) are read via
// $queryRawUnsafe with a validated, non-user-controlled schema identifier.


import { toSchemaName } from '../../../lib/tenant-schema-helpers.js';
import { NotFoundError } from '../../../lib/app-error.js';

import { queryAuditLog } from './audit-log.service.js';

import type { PrismaClient, Prisma } from '@prisma/client';
import type { AuditEntry } from '../schemas/audit-schemas.js';

// Schema names produced by toSchemaName() are `tenant_<slug-with-underscores>`.
// Re-validate before interpolation as defence-in-depth (slug comes from DB, not
// user input, but a corrupted row must never yield an injectable identifier).
const SCHEMA_NAME_REGEX = /^tenant_[a-z0-9_]+$/;

const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  minioBucket: true,
} as const satisfies Prisma.TenantSelect;

export interface TenantDetailPluginInstallation {
  pluginSlug: string;
  status: string;
  installedAt: string;
}

export interface TenantDetailResponse {
  tenant: {
    id: string;
    slug: string;
    name: string;
    status: string;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    minioBucket: string | null;
  };
  userCount: number;
  workspaceCount: number;
  pluginInstallations: TenantDetailPluginInstallation[];
  recentAudit: AuditEntry[];
}

type CountRow = { count: number };

interface PluginInstallRow {
  plugin_slug: string;
  status: string;
  installed_at: Date;
}

/**
 * Returns the aggregated detail view for a single tenant, including
 * cross-schema counts (users, workspaces), plugin installations, and the
 * 10 most recent platform audit entries for that tenant.
 *
 * @throws {NotFoundError} if no tenant exists with the given id.
 */
export async function getTenantDetail(
  prisma: PrismaClient,
  id: string
): Promise<TenantDetailResponse> {
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: TENANT_SELECT,
  });

  if (!tenant) {
    throw new NotFoundError(`Tenant ${id} not found`);
  }

  const schemaName = toSchemaName(tenant.slug);
  if (!SCHEMA_NAME_REGEX.test(schemaName)) {
    // Defence-in-depth: a corrupted slug must never reach SQL interpolation.
    throw new Error(`Invalid derived schema name: ${schemaName}`);
  }

  // Cross-schema counts + plugin installations. Schema name is validated and
  // non-user-controlled, so $queryRawUnsafe is safe here. Table and column
  // names are static literals.
  const [userRows, workspaceRows, installRows, auditRes] = await Promise.all([
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::int AS count FROM "${schemaName}".user_profile`
    ),
    prisma.$queryRawUnsafe<CountRow[]>(
      `SELECT COUNT(*)::int AS count FROM "${schemaName}".workspace`
    ),
    prisma.$queryRawUnsafe<PluginInstallRow[]>(
      `SELECT p.slug AS plugin_slug, pi.status, pi.installed_at FROM "${schemaName}".plugin_installations pi JOIN core.plugins p ON p.id = pi.plugin_id LIMIT 50`
    ),
    queryAuditLog(prisma, { tenantId: id, page: 1, pageSize: 10 }),
  ]);

  const userCount = userRows[0]?.count ?? 0;
  const workspaceCount = workspaceRows[0]?.count ?? 0;

  const pluginInstallations: TenantDetailPluginInstallation[] = installRows.map(
    (row) => ({
      pluginSlug: row.plugin_slug,
      status: row.status,
      installedAt: row.installed_at.toISOString(),
    })
  );

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      version: tenant.version,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      minioBucket: tenant.minioBucket,
    },
    userCount,
    workspaceCount,
    pluginInstallations,
    recentAudit: auditRes.data,
  };
}
