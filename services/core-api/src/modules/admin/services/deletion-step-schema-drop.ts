// deletion-step-schema-drop.ts
// Deletion saga step handler: DROP SCHEMA (ADR-022 Decision 1).
// Drops the tenant's PostgreSQL schema with CASCADE. Forward-only —
// once dropped, the data is gone (GDPR erasure). Throws on failure so the
// saga executor records the error and retries with backoff.

import { logger } from '../../../lib/logger.js';

import type { PrismaClient } from '@prisma/client';

// Defence-in-depth: validate the derived schema name matches the exact shape
// produced by toSchemaName before interpolating into DDL. PostgreSQL schema
// names cannot be parameterised, so a strict allowlist regex is the guard.
const SCHEMA_NAME_REGEX = /^tenant_[a-z0-9_]{1,55}$/;

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

  logger.info({ tenantId }, 'Tenant PostgreSQL schema dropped');
}
