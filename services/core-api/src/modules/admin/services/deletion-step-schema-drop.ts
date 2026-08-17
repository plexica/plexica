// deletion-step-schema-drop.ts
// Deletion saga step handler: DROP SCHEMA (ADR-022 Decision 1).
// Drops the tenant's PostgreSQL schema with CASCADE. Forward-only —
// once dropped, the data is gone (GDPR erasure). Throws on failure so the
// saga executor records the error and retries with backoff.

import { logger } from '../../../lib/logger.js';
import { invalidateTenantDbClient } from '../../../lib/tenant-database.js';
import { SCHEMA_NAME_REGEX } from '../../../lib/tenant-schema-helpers.js';

import type { PrismaClient } from '@prisma/client';

// SCHEMA_NAME_REGEX (canonical, lib/tenant-schema-helpers.ts) is the
// defence-in-depth guard: validate the derived schema name matches the exact
// shape produced by toSchemaName before interpolating into DDL. PostgreSQL
// schema names cannot be parameterised, so a strict allowlist regex is the
// guard.

/**
 * Drops the PostgreSQL schema `tenant_<slug>` (hyphens → underscores) with
 * CASCADE. Idempotent — `IF EXISTS` makes it succeed if the schema is already
 * gone. Throws on any failure.
 */
export async function executeSchemaDrop(
  prisma: PrismaClient,
  tenantId: string,
  schemaName: string
): Promise<void> {
  if (!SCHEMA_NAME_REGEX.test(schemaName)) {
    throw new Error('Refusing to drop invalid tenant schema identifier');
  }

  logger.info({ tenantId }, 'Dropping tenant PostgreSQL schema');

  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

  // ADR-027: evict the cached TenantPrismaClient for this schema. A cached
  // client holding pooled connections to a dropped schema would fail on its
  // next use. Done AFTER the drop so a client recreated during the drop
  // window is removed too. Never throws (disconnect failures are logged).
  await invalidateTenantDbClient(schemaName);

  logger.info({ tenantId }, 'Tenant PostgreSQL schema dropped');
}
