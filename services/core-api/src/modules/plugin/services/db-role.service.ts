// services/db-role.service.ts
// CRITICAL #1 — Restricted PostgreSQL role per plugin installation.
//
// Plugin containers must NEVER receive the platform's DATABASE_URL (which has
// admin access to every schema). Instead we provision a dedicated, restricted
// LOGIN role `plugin_{installId}` scoped to the tenant schema and the plugin's
// declared tables only. The connection string is encrypted at rest in
// plugin_container_config.envOverrides and handed to the container in clear
// (the container needs the real value to connect).

import { randomBytes } from 'node:crypto';

import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';
import { toSchemaName } from '../../../lib/tenant-schema-helpers.js';
import { PluginInstallError } from '../errors.js';

import {
  buildPluginDatabaseUrl,
  configuredPluginDbTransport,
  encryptPluginDatabaseUrl,
} from './plugin-db-credentials.js';

import type { DeclaredTable } from '../schema/manifest.js';

export { dropPluginRole, revokeCreateOnSchema } from './db-role-cleanup.service.js';

const PG_IDENT = /^[a-z0-9_]+$/;
const TABLE_NAME = /^[a-z][a-z0-9_]{1,63}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PluginRole {
  roleName: string;
  schemaName: string;
  /** Plain connection string — pass to the container Env, never persist as-is. */
  connectionString: string;
  /** Encrypted env blob — safe to store in plugin_container_config.envOverrides. */
  encryptedEnvOverrides: Record<string, string>;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function randomPassword(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Provisions a restricted PostgreSQL role for a plugin installation:
 *   CREATE ROLE plugin_{installId} LOGIN PASSWORD '{random}'
 *   GRANT USAGE ON SCHEMA tenant_{slug} TO plugin_{installId}
 *   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_{slug}.{declaredTable} ...
 *   REVOKE ALL ON SCHEMA core FROM plugin_{installId}
 * Returns the role name, the plain connection string (for the container Env)
 * and the encrypted env blob (for plugin_container_config.envOverrides).
 */
export async function createPluginRole(
  installId: string,
  tenantSlug: string,
  declaredTables: DeclaredTable[]
): Promise<PluginRole> {
  // installId is a UUID (contains hyphens). We transform it into a valid
  // PostgreSQL identifier by replacing hyphens with underscores, then validate
  // the RESULTING role name — not the raw UUID — against PG_IDENT.
  if (!UUID_REGEX.test(installId)) {
    throw new PluginInstallError(`Invalid installId (expected UUID): "${installId}"`);
  }
  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  if (!PG_IDENT.test(roleName)) {
    throw new PluginInstallError(`Invalid role name derived from installId: "${roleName}"`);
  }
  if (!declaredTables.every((t) => TABLE_NAME.test(t.name))) {
    throw new PluginInstallError('Invalid declared table name — must be snake_case');
  }

  const schemaName = toSchemaName(tenantSlug);
  const password = randomPassword();

  const stmts: string[] = [
    `CREATE ROLE ${quoteIdent(roleName)} LOGIN PASSWORD '${password.replace(/'/g, "''")}'`,
    `GRANT USAGE ON SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(roleName)}`,
    `REVOKE ALL ON SCHEMA core FROM ${quoteIdent(roleName)}`,
  ];
  // NOTE: DML grants on declared tables are deferred to grantTablePrivileges(),
  // which must run AFTER runPluginMigrations() creates the tables. Granting here
  // would fail (relation does not exist) and leave the install stuck at
  // `installing`. See install.routes.ts for the post-migration grant call.

  try {
    for (const sql of stmts) {
      await prisma.$executeRawUnsafe(sql);
    }
  } catch (err: unknown) {
    // Best-effort cleanup of a half-created role before surfacing the error.
    try {
      await prisma.$executeRawUnsafe(
        `REVOKE ALL ON SCHEMA ${quoteIdent(schemaName)} FROM ${quoteIdent(roleName)}`
      );
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdent(roleName)}`);
    } catch {
      /* ignore */
    }
    throw new PluginInstallError(
      `Failed to create restricted plugin DB role: ${(err as Error)?.message ?? err}`
    );
  }

  const connectionString = buildPluginDatabaseUrl(
    process.env['DATABASE_URL'] ?? '',
    roleName,
    password,
    schemaName,
    configuredPluginDbTransport()
  );
  logger.info(
    { roleName, schemaName, tableCount: declaredTables.length },
    'Created restricted plugin DB role'
  );

  return {
    roleName,
    schemaName,
    connectionString,
    encryptedEnvOverrides: { DATABASE_URL: encryptPluginDatabaseUrl(connectionString) },
  };
}

/**
 * Grants DML (SELECT/INSERT/UPDATE/DELETE) on the plugin's declared tables to
 * the restricted role. MUST be called AFTER runPluginMigrations() has created
 * the tables — granting on non-existent tables throws and would leave the
 * install stuck. Idempotent per table (GRANT is a no-op if already granted).
 */
export async function grantTablePrivileges(
  installId: string,
  tenantSlug: string,
  declaredTables: DeclaredTable[]
): Promise<void> {
  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  const schemaName = toSchemaName(tenantSlug);
  if (!declaredTables.every((t) => TABLE_NAME.test(t.name))) {
    throw new PluginInstallError('Invalid declared table name — must be snake_case');
  }
  for (const t of declaredTables) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE ${quoteIdent(schemaName)}.${quoteIdent(t.name)} OWNER TO CURRENT_USER`
    );
    await prisma.$executeRawUnsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${quoteIdent(schemaName)}.${quoteIdent(t.name)} TO ${quoteIdent(roleName)}`
    );
  }
  logger.info(
    { roleName, schemaName, tableCount: declaredTables.length },
    'Granted DML on plugin tables to restricted role'
  );
}

/**
 * Grants CREATE on the tenant schema to the plugin role so it can run its
 * declared migrations. Must be paired with revokeCreateOnSchema after the
 * migrations complete — the runtime container must NOT hold DDL privileges.
 */
export async function grantCreateOnSchema(installId: string, tenantSlug: string): Promise<string> {
  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  const schemaName = toSchemaName(tenantSlug);
  await prisma.$executeRawUnsafe(
    `GRANT CREATE ON SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(roleName)}`
  );
  // Allow the platform admin role to SET ROLE plugin_xxx when running migrations.
  await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(roleName)} TO CURRENT_USER`).catch(() => {
    /* superusers do not need membership; ignore */
  });
  return roleName;
}
