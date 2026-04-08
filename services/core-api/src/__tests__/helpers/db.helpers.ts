// db.helpers.ts
// Database seeding and cleanup helpers for integration tests (Spec 003, Phase 18).
// Extracted to keep test files under the 200-line constitution limit (Rule 4).
//
// NOTE: Seeding helpers that write to tenant-schema tables (userProfile, workspace, etc.)
// use a dedicated TenantPrismaClient with ?schema=<schemaName> in the connection URL.
// The core `prisma` client only knows about core-schema models (Tenant, TenantConfig, …)
// and cannot access tenant-schema models — see Decision Log ID-001.
//
// NOTE: applyTenantMigrations() runs the migration SQL files directly via raw SQL because
// `prisma migrate deploy` does not support multi-schema deployments where _prisma_migrations
// lives in a different schema than the target schema. All migration files use IF NOT EXISTS
// so this helper is idempotent.

import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// @ts-ignore — generated at build time via 'pnpm db:generate'
import { PrismaClient as TenantPrismaClient } from '../../../generated/tenant-client/index.js';
import { prisma } from '../../lib/database.js';
import { toSchemaName, toRealmName } from '../../lib/tenant-schema-helpers.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to migration SQL files, relative to this helper.
// db.helpers.ts lives at src/__tests__/helpers/ → 3 levels up reaches services/core-api/
const MIGRATIONS_DIR = resolve(__dirname, '../../../prisma/migrations');

const TENANT_MIGRATION_FILES = ['003_core_features/migration.sql'];

export interface SeedTenantResult {
  tenantContext: TenantContext;
  tenantId: string;
}

/**
 * Builds a TenantPrismaClient connected to the given tenant's schema.
 * Caller is responsible for calling $disconnect() when done.
 */
function buildTenantClient(schemaName: string): InstanceType<typeof TenantPrismaClient> {
  const baseUrl = process.env['DATABASE_URL'] ?? '';
  const tenantUrl = baseUrl.includes('?')
    ? `${baseUrl}&schema=${schemaName}`
    : `${baseUrl}?schema=${schemaName}`;
  return new TenantPrismaClient({ datasources: { db: { url: tenantUrl } } });
}

/**
 * Applies tenant-schema DDL migrations to a freshly created schema.
 * Uses raw SQL with IF NOT EXISTS — safe to call multiple times (idempotent).
 * Runs inside a transaction with SET LOCAL search_path so the connection
 * pool is not polluted (same pattern as withTenantDb).
 */
async function applyTenantMigrations(schemaName: string): Promise<void> {
  for (const relPath of TENANT_MIGRATION_FILES) {
    const sqlPath = resolve(MIGRATIONS_DIR, relPath);
    const rawSql = readFileSync(sqlPath, 'utf8');

    // Strip SQL line comments and split into individual statements.
    // Each statement is executed separately because $executeRawUnsafe
    // does not support multiple statements in one call on all drivers.
    const cleanSql = rawSql.replace(/--.*$/gm, '').trim();
    const statements = cleanSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    await prisma.$transaction(async (tx) => {
      // schemaName contains only [a-z0-9_] — safe for $executeRawUnsafe (ID-001 pattern)
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}",public`);
      for (const stmt of statements) {
        await tx.$executeRawUnsafe(stmt);
      }
    });
  }
}

/**
 * Seeds a tenant row + schema for integration tests, then applies tenant DDL migrations.
 * Idempotent — skips creation if the tenant already exists.
 */
export async function seedTenant(slug: string): Promise<SeedTenantResult> {
  const schemaName = toSchemaName(slug);
  const realmName = toRealmName(slug);

  let tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (tenant === null) {
    await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: { slug, name: slug, status: 'active' },
      });
      tenant = created;
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      await tx.tenantConfig.create({
        data: { tenantId: created.id, keycloakRealm: realmName },
      });
    });
    tenant = await prisma.tenant.findUnique({ where: { slug } });

    // Apply tenant-specific DDL (creates user_profile, workspace, etc.)
    await applyTenantMigrations(schemaName);
  }

  if (tenant === null) throw new Error(`Failed to seed tenant: ${slug}`);

  const tenantContext: TenantContext = {
    tenantId: tenant.id,
    slug: tenant.slug,
    schemaName,
    realmName,
  };

  return { tenantContext, tenantId: tenant.id };
}

/**
 * Removes a tenant, its config, and its schema.
 * Safe to call even if the tenant does not exist.
 */
export async function cleanupTenant(slug: string): Promise<void> {
  const schemaName = toSchemaName(slug);
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await prisma.tenantConfig.deleteMany({ where: { tenant: { slug } } });
    await prisma.tenant.deleteMany({ where: { slug } });
  } catch {
    // Best-effort cleanup — test isolation is maintained by unique slug per test file
  }
}

/**
 * Seeds a minimal user_profile row inside a tenant schema.
 * If `userId` is provided it is used as the internal PK (useful when tests
 * need `req.user.id` and `created_by` to match the same UUID).
 * Returns the internal profile userId.
 */
export async function seedUserProfile(
  tenantContext: TenantContext,
  keycloakUserId: string,
  email: string,
  displayName: string | null = null,
  userId?: string
): Promise<string> {
  const internalId = userId ?? randomUUID();
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    const row = await tenantDb.userProfile.upsert({
      where: { keycloakUserId },
      create: {
        userId: internalId,
        keycloakUserId,
        email,
        displayName,
        timezone: 'UTC',
        language: 'en',
        status: 'active',
      },
      update: {},
      select: { userId: true },
    });
    return (row as { userId: string }).userId;
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Seeds a workspace inside a tenant schema.
 * Returns the workspace id, slug, and materializedPath.
 */
export async function seedWorkspace(
  tenantContext: TenantContext,
  name: string,
  createdBy: string,
  parentId: string | null = null,
  parentPath: string | null = null
): Promise<{ id: string; slug: string; materializedPath: string }> {
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const materializedPath = parentPath !== null ? `${parentPath}/${slug}` : `/${slug}`;

  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    const row = await tenantDb.workspace.create({
      data: {
        name,
        slug,
        description: null,
        parentId,
        materializedPath,
        status: 'active',
        createdBy,
        version: 1,
      },
      select: { id: true, slug: true, materializedPath: true },
    });
    return row as { id: string; slug: string; materializedPath: string };
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Seeds a workspace_member row for a given user in a given workspace.
 */
export async function seedWorkspaceMember(
  tenantContext: TenantContext,
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member' | 'viewer'
): Promise<void> {
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    await tenantDb.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, role },
      update: { role },
    });
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Wipes all workspace-related rows in a tenant schema.
 * Used in beforeEach to ensure test isolation.
 */
export async function wipeTenantWorkspaces(tenantContext: TenantContext): Promise<void> {
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    await tenantDb.auditLog.deleteMany({});
    await tenantDb.invitation.deleteMany({});
    await tenantDb.workspaceMember.deleteMany({});
    await tenantDb.workspace.deleteMany({});
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Wipes all user_profile rows in a tenant schema.
 * Used in beforeEach alongside wipeTenantWorkspaces for full isolation.
 */
export async function wipeTenantUsers(tenantContext: TenantContext): Promise<void> {
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    await tenantDb.userProfile.deleteMany({});
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Wipes all audit_log rows in a tenant schema.
 * Used in beforeEach for audit log tests.
 */
export async function wipeTenantAuditLog(tenantContext: TenantContext): Promise<void> {
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    await tenantDb.auditLog.deleteMany({});
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Seeds an audit log entry in a tenant schema.
 * Returns the created entry id.
 */
export async function seedAuditLog(
  tenantContext: TenantContext,
  actorId: string,
  actionType: string
): Promise<string> {
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    const row = await tenantDb.auditLog.create({
      data: { actorId, actionType, targetType: 'workspace' },
      select: { id: true },
    });
    return (row as { id: string }).id;
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Seeds an invitation row directly in a tenant schema.
 * Used by tests that need to bypass the API (e.g. expired/already-accepted tokens).
 */
export async function seedInvitation(
  tenantContext: TenantContext,
  data: {
    email: string;
    workspaceId: string;
    role: string;
    invitedBy: string;
    token: string;
    status: string;
    expiresAt: Date;
  }
): Promise<string> {
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    const row = await tenantDb.invitation.create({
      data,
      select: { id: true },
    });
    return (row as { id: string }).id;
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Queries abac_decision_log rows in a tenant schema.
 * Used by abac-decision-log.test.ts to verify that the ABAC engine wrote log entries.
 */
export async function queryAbacDecisionLog(
  tenantContext: TenantContext,
  filter: { userId?: string; action?: string; resourceId?: string }
): Promise<
  Array<{
    userId: string;
    action: string;
    resourceId: string | null;
    decision: string;
    createdAt: Date;
  }>
> {
  const tenantDb = buildTenantClient(tenantContext.schemaName);
  try {
    const rows = await tenantDb.abacDecisionLog.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows as Array<{
      userId: string;
      action: string;
      resourceId: string | null;
      decision: string;
      createdAt: Date;
    }>;
  } finally {
    await tenantDb.$disconnect();
  }
}

/**
 * Builds a TenantPrismaClient connected to the given tenant's schema.
 * Exported for tests that need to call evaluate() directly (e.g. abac.test.ts).
 * Caller is responsible for calling $disconnect() when done.
 */
export function buildTenantClientForCtx(
  tenantContext: TenantContext
): InstanceType<typeof TenantPrismaClient> {
  return buildTenantClient(tenantContext.schemaName);
}
