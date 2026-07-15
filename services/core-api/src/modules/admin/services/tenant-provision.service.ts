// services/tenant-provision.service.ts
// Extends the existing tenant provisioning pipeline with pre-flight conflict
// detection (core row + PostgreSQL schema + Keycloak realm + MinIO bucket) and
// a platform audit log entry on success (S5-400 / Feature 005-04).
//
// The actual schema/realm/bucket/seed orchestration is REUSED from
// tenant-provisioning.ts — this module only wraps it with checks + audit.


import { provisionTenant, type ProvisioningResult } from '../../tenant/tenant-provisioning.js';
import { TenantConflictError, type TenantConflictType } from '../../../lib/app-error.js';
import { toSchemaName, toRealmName } from '../../../lib/tenant-schema-helpers.js';
import { realmExists } from '../../../lib/keycloak-admin.js';
import { bucketExists } from '../../../lib/minio-client.js';
import { logger } from '../../../lib/logger.js';

import { writeAuditEntry } from './audit-log.service.js';

import type { PrismaClient } from '@prisma/client';

export interface ProvisionWithAuditParams {
  slug: string;
  name: string;
  adminEmail: string;
}

export interface ProvisionWithAuditResult extends ProvisioningResult {}

interface ConflictCheck {
  type: TenantConflictType;
  message: string;
  exists: () => Promise<boolean>;
}

/**
 * Provisions a new tenant with pre-flight conflict detection and audit logging.
 *
 * Order of checks (fail fast, cheapest first):
 *   1. core.tenants row by slug        → tenant_slug_exists
 *   2. PostgreSQL schema tenant_<slug> → schema_exists
 *   3. Keycloak realm plexica-<slug>   → realm_exists
 *   4. MinIO bucket tenant-<slug>      → bucket_exists
 *
 * On success, writes a `tenant.provision` audit entry and returns the
 * provisioning result. actorId is the super-admin's Keycloak master realm sub.
 */
export async function provisionTenantWithAudit(
  prisma: PrismaClient,
  params: ProvisionWithAuditParams,
  actorId: string
): Promise<ProvisionWithAuditResult> {
  const { slug, name, adminEmail } = params;
  const schemaName = toSchemaName(slug);
  const realmName = toRealmName(slug);
  const minioBucket = `tenant-${slug}`;

  await assertNoConflicts(prisma, { slug, schemaName, realmName, minioBucket });

  logger.info({ slug, actorId }, 'Conflict checks passed — provisioning tenant');

  const result = await provisionTenant({ slug, name, adminEmail });

  await writeAuditEntry(prisma, {
    actorId,
    action: 'tenant.provision',
    resourceType: 'tenant',
    resourceId: result.tenantId,
    metadata: { slug, name }, // NO PII — adminEmail excluded (Security §6)
  });

  logger.info({ tenantId: result.tenantId, slug, actorId }, 'Tenant provisioned + audit logged');

  return result;
}

async function assertNoConflicts(
  prisma: PrismaClient,
  ctx: { slug: string; schemaName: string; realmName: string; minioBucket: string }
): Promise<void> {
  const checks: ConflictCheck[] = [
    {
      type: 'tenant_slug_exists',
      message: `Tenant with slug '${ctx.slug}' already exists in core.tenants`,
      exists: () => prisma.tenant.findUnique({ where: { slug: ctx.slug } }).then((t) => t !== null),
    },
    {
      type: 'schema_exists',
      message: `PostgreSQL schema '${ctx.schemaName}' already exists`,
      exists: () => schemaRowExists(prisma, ctx.schemaName),
    },
    {
      type: 'realm_exists',
      message: `Keycloak realm '${ctx.realmName}' already exists`,
      exists: () => realmExists(ctx.realmName),
    },
    {
      type: 'bucket_exists',
      message: `MinIO bucket '${ctx.minioBucket}' already exists`,
      exists: () => bucketExists(ctx.minioBucket),
    },
  ];

  for (const check of checks) {
    if (await check.exists()) {
      logger.warn({ conflictType: check.type, slug: ctx.slug }, 'Tenant provisioning conflict');
      throw new TenantConflictError(check.type, check.message);
    }
  }
}

async function schemaRowExists(prisma: PrismaClient, schemaName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists`,
    schemaName
  );
  return rows[0]?.exists === true;
}
