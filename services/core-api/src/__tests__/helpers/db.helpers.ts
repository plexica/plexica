// db.helpers.ts
// Database seeding and cleanup helpers for integration tests (Spec 003, Phase 18).
// Extracted to keep test files under the 200-line constitution limit (Rule 4).

import { prisma } from '../../lib/database.js';
import { toSchemaName, toRealmName } from '../../lib/tenant-schema-helpers.js';
import { withTenantDb } from '../../lib/tenant-database.js';

import type { Prisma } from '@prisma/client';
import type { TenantContext } from '../../lib/tenant-context-store.js';

export interface SeedTenantResult {
  tenantContext: TenantContext;
  tenantId: string;
}

/**
 * Seeds a tenant row + schema for integration tests.
 * Idempotent — skips creation if the tenant already exists.
 */
export async function seedTenant(slug: string): Promise<SeedTenantResult> {
  const schemaName = toSchemaName(slug);
  const realmName = toRealmName(slug);

  let tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (tenant === null) {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
 * Returns the internal profile id.
 */
export async function seedUserProfile(
  tenantContext: TenantContext,
  keycloakUserId: string,
  email: string,
  displayName: string | null = null
): Promise<string> {
  const row = await withTenantDb(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tx as any).userProfile.upsert({
      where: { keycloakUserId },
      create: {
        keycloakUserId,
        email,
        displayName,
        timezone: 'UTC',
        language: 'en',
        status: 'active',
      },
      update: {},
      select: { id: true },
    });
  }, tenantContext);
  return (row as { id: string }).id;
}

/**
 * Seeds a workspace inside a tenant schema.
 * Returns the workspace id.
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

  const row = await withTenantDb(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tx as any).workspace.create({
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
  }, tenantContext);

  return row as { id: string; slug: string; materializedPath: string };
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
  await withTenantDb(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (tx as any).workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: { workspaceId, userId, role },
      update: { role },
    });
  }, tenantContext);
}

/**
 * Wipes all workspace-related rows in a tenant schema.
 * Used in beforeEach to ensure test isolation.
 */
export async function wipeTenantWorkspaces(tenantContext: TenantContext): Promise<void> {
  await withTenantDb(async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tx as any;
    await t.auditLogEntry.deleteMany({});
    await t.invitation.deleteMany({});
    await t.workspaceMember.deleteMany({});
    await t.workspace.deleteMany({});
  }, tenantContext);
}
