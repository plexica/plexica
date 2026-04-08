// tenant-provisioning.ts
// Orchestrates full tenant provisioning: PostgreSQL schema + Keycloak realm + MinIO bucket + seed data.
// Implements tracked rollback — compensates completed steps in reverse order on failure.

// TODO: Run 'pnpm db:generate' to generate tenant client types before Step 4 compiles.

// @ts-ignore — generated/tenant-client does not exist until after 'pnpm db:generate'
import { PrismaClient as TenantPrismaClient } from '../../../generated/tenant-client/index.js';
import { prisma } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';
import { ProvisioningFailedError } from '../../lib/app-error.js';
import { createTenantSchema } from '../../lib/tenant-schema.js';
import { createRealm, deleteRealm } from '../../lib/keycloak-admin.js';
import { createBucket, deleteBucket } from '../../lib/minio-client.js';
import { toRealmName, toSchemaName } from '../../lib/tenant-schema-helpers.js';

import { seedBuiltInTemplates } from './seed/003-built-in-templates.js';
import { seedDefaultBranding } from './seed/003-default-branding.js';

export interface ProvisioningParams {
  slug: string;
  name: string;
  adminEmail: string;
}

export interface ProvisioningResult {
  tenantId: string;
  slug: string;
  schemaName: string;
  realmName: string;
  minioBucket: string;
  /** Temporary password for the initial admin user. Must be changed on first login. */
  tempPassword: string;
}

type CompletedStep = 'schema' | 'realm' | 'bucket';

async function rollback(
  completedSteps: CompletedStep[],
  params: { slug: string; schemaName: string; realmName: string; minioBucket: string }
): Promise<void> {
  const { slug, schemaName, realmName, minioBucket } = params;

  for (const step of [...completedSteps].reverse()) {
    try {
      if (step === 'bucket') {
        await deleteBucket(minioBucket);
        logger.info({ minioBucket }, 'Rollback: MinIO bucket deleted');
      } else if (step === 'realm') {
        await deleteRealm(realmName);
        logger.info({ realmName }, 'Rollback: Keycloak realm deleted');
      } else if (step === 'schema') {
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await prisma.tenant.deleteMany({ where: { slug } });
        logger.info({ schemaName }, 'Rollback: PostgreSQL schema dropped');
      }
    } catch (rollbackErr) {
      logger.error({ step, err: String(rollbackErr) }, 'Rollback step failed');
    }
  }
}

export async function provisionTenant(params: ProvisioningParams): Promise<ProvisioningResult> {
  const { slug, name, adminEmail } = params;
  const schemaName = toSchemaName(slug);
  const realmName = toRealmName(slug);
  const minioBucket = `tenant-${slug}`;
  const completedSteps: CompletedStep[] = [];

  try {
    // Step 1: Create PostgreSQL schema + tenant record
    const schemaResult = await createTenantSchema({ slug, name });
    if (!schemaResult.success || schemaResult.tenantId === undefined) {
      throw new ProvisioningFailedError(schemaResult.error?.message ?? 'Schema creation failed');
    }
    completedSteps.push('schema');

    // Step 2: Create Keycloak realm
    const { tempPassword } = await createRealm({ realmName, adminEmail, tenantSlug: slug });
    completedSteps.push('realm');

    // Step 3: Create MinIO bucket + update tenant record
    await createBucket(minioBucket);
    // Update minio_bucket column — use raw SQL until `prisma generate` refreshes types
    await prisma.$executeRaw`
      UPDATE core.tenants SET minio_bucket = ${minioBucket} WHERE slug = ${slug}
    `;
    completedSteps.push('bucket');

    // Step 4: Seed initial tenant data (built-in templates + default branding).
    // A dedicated TenantPrismaClient is connected directly to the tenant schema so
    // that Prisma model names resolve against the tenant-client generated types.
    // The search_path is set via the ?schema= query parameter in the DATABASE_URL.
    const baseUrl = process.env['DATABASE_URL'] ?? '';
    const tenantUrl = baseUrl.includes('?')
      ? `${baseUrl}&schema=${schemaName}`
      : `${baseUrl}?schema=${schemaName}`;

    const tenantDb = new TenantPrismaClient({ datasources: { db: { url: tenantUrl } } });
    try {
      await seedBuiltInTemplates(tenantDb);

      await seedDefaultBranding(tenantDb);
      logger.info({ slug }, 'Tenant seed data applied');
    } finally {
      await tenantDb.$disconnect();
    }

    logger.info({ slug, realmName, minioBucket }, 'Tenant provisioned successfully');
    return {
      tenantId: schemaResult.tenantId,
      slug,
      schemaName,
      realmName,
      minioBucket,
      tempPassword,
    };
  } catch (err) {
    logger.error({ slug, completedSteps, err: String(err) }, 'Provisioning failed — rolling back');
    await rollback(completedSteps, { slug, schemaName, realmName, minioBucket });

    if (err instanceof ProvisioningFailedError) throw err;
    throw new ProvisioningFailedError(
      `Provisioning failed at step ${completedSteps[completedSteps.length - 1] ?? 'init'}: ${String(err)}`
    );
  }
}
