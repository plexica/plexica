// tenant-schema.ts
// Tenant schema creation utility.
// Creates a new tenant record + PostgreSQL schema in a single transaction.

import { prisma } from './database.js';
import { logger } from './logger.js';
import {
  validateSlug,
  toSchemaName,
  toRealmName,
  isAlreadyExistsError,
  type TenantCreationError,
} from './tenant-schema-helpers.js';

export interface TenantCreationResult {
  success: boolean;
  tenantId?: string;
  schemaName?: string;
  error?: TenantCreationError;
}

export async function createTenantSchema(slug: string): Promise<TenantCreationResult> {
  // Step 1: Validate slug format
  const validation = validateSlug(slug);
  if (!validation.valid) {
    return {
      success: false,
      error: { code: 'INVALID_SLUG', message: validation.error },
    };
  }

  const schemaName = toSchemaName(slug);
  const realmName = toRealmName(slug);

  // Step 2: Check for existing tenant
  try {
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing !== null) {
      return {
        success: false,
        error: {
          code: 'ALREADY_EXISTS',
          message: `Schema ${schemaName} already exists`,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'DB_CONNECTION',
        message: `Database connection failed: ${String(error)}`,
      },
    };
  }

  // Step 3: Create tenant in a transaction
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Insert tenant record
      const tenant = await tx.tenant.create({
        data: { slug, name: slug, status: 'active' },
      });

      // Create the tenant schema using raw SQL
      await tx.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

      // Insert tenant config
      await tx.tenantConfig.create({
        data: { tenantId: tenant.id, keycloakRealm: realmName },
      });

      return tenant;
    });

    logger.info({ slug, schemaName, tenantId: result.id }, 'Tenant schema created');
    return { success: true, tenantId: result.id, schemaName };
  } catch (error) {
    logger.error({ slug, error: String(error) }, 'Tenant schema creation failed');
    if (isAlreadyExistsError(error)) {
      return {
        success: false,
        error: { code: 'ALREADY_EXISTS', message: `Schema ${schemaName} already exists` },
      };
    }
    return {
      success: false,
      error: { code: 'MIGRATION_FAILED', message: `Migration failed: ${String(error)}` },
    };
  }
}
