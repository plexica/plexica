// services/db-role.service.ts
// CRITICAL #1 — Restricted PostgreSQL role per plugin installation.
//
// Plugin containers must NEVER receive the platform's DATABASE_URL (which has
// admin access to every schema). Instead we provision a dedicated, restricted
// LOGIN role `plugin_{installId}` scoped to the tenant schema and the plugin's
// declared tables only. The connection string is encrypted at rest in
// plugin_container_config.envOverrides and handed to the container in clear
// (the container needs the real value to connect).

import crypto from 'node:crypto';

import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';
import { toSchemaName } from '../../../lib/tenant-schema-helpers.js';
import { PluginInstallError } from '../errors.js';

import type { DeclaredTable } from '../schema/manifest.js';

const PG_IDENT = /^[a-z0-9_]+$/;
const TABLE_NAME = /^[a-z][a-z0-9_]{1,63}$/;

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
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Derives a 32-byte AES key for encrypting connection strings at rest.
 * Production MUST set PLUGIN_DB_ENCRYPTION_KEY (64 hex chars). In dev we fall
 * back to a key derived from DATABASE_URL so installs still work, with a warning.
 */
function encryptionKey(): Buffer {
  const envKey = process.env['PLUGIN_DB_ENCRYPTION_KEY'];
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey)) {
    return Buffer.from(envKey, 'hex');
  }
  if (process.env['NODE_ENV'] === 'production') {
    throw new PluginInstallError(
      'PLUGIN_DB_ENCRYPTION_KEY (64 hex chars) is required in production to encrypt plugin DB credentials',
    );
  }
  logger.warn(
    'PLUGIN_DB_ENCRYPTION_KEY not set — deriving a dev-only key from DATABASE_URL. Do NOT use in production.',
  );
  return crypto.createHash('sha256').update(process.env['DATABASE_URL'] ?? 'plexica-dev').digest();
}

function encrypt(plaintext: string): string {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function parseDbUrl(url: string): { host: string; port: string; dbname: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PluginInstallError('DATABASE_URL is not a valid URL — cannot build plugin connection string');
  }
  return { host: parsed.hostname || 'localhost', port: parsed.port || '5432', dbname: parsed.pathname.replace(/^\//, '') || 'postgres' };
}

function buildConnectionString(roleName: string, password: string, schemaName: string): string {
  const { host, port, dbname } = parseDbUrl(process.env['DATABASE_URL'] ?? '');
  const enc = (s: string) => encodeURIComponent(s);
  return `postgresql://${enc(roleName)}:${enc(password)}@${host}:${port}/${dbname}?schema=${enc(schemaName)}`;
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
  declaredTables: DeclaredTable[],
): Promise<PluginRole> {
  if (!PG_IDENT.test(installId)) {
    throw new PluginInstallError(`Invalid installId for role name: "${installId}"`);
  }
  if (!declaredTables.every((t) => TABLE_NAME.test(t.name))) {
    throw new PluginInstallError('Invalid declared table name — must be snake_case');
  }

  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  const schemaName = toSchemaName(tenantSlug);
  const password = randomPassword();

  const stmts: string[] = [
    `CREATE ROLE ${quoteIdent(roleName)} LOGIN PASSWORD '${password.replace(/'/g, "''")}'`,
    `GRANT USAGE ON SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(roleName)}`,
    `REVOKE ALL ON SCHEMA core FROM ${quoteIdent(roleName)}`,
  ];
  for (const t of declaredTables) {
    stmts.push(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${quoteIdent(schemaName)}.${quoteIdent(t.name)} TO ${quoteIdent(roleName)}`,
    );
  }

  try {
    for (const sql of stmts) {
      await prisma.$executeRawUnsafe(sql);
    }
  } catch (err: any) {
    // Best-effort cleanup of a half-created role before surfacing the error.
    try {
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdent(roleName)}`);
    } catch {
      /* ignore */
    }
    throw new PluginInstallError(`Failed to create restricted plugin DB role: ${err?.message ?? err}`);
  }

  const connectionString = buildConnectionString(roleName, password, schemaName);
  logger.info({ roleName, schemaName, tableCount: declaredTables.length }, 'Created restricted plugin DB role');

  return {
    roleName,
    schemaName,
    connectionString,
    encryptedEnvOverrides: { DATABASE_URL: encrypt(connectionString) },
  };
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
    `GRANT CREATE ON SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(roleName)}`,
  );
  // Allow the platform admin role to SET ROLE plugin_xxx when running migrations.
  await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(roleName)} TO CURRENT_USER`).catch(() => {
    /* superusers do not need membership; ignore */
  });
  return roleName;
}

export async function revokeCreateOnSchema(installId: string, tenantSlug: string): Promise<void> {
  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  const schemaName = toSchemaName(tenantSlug);
  await prisma.$executeRawUnsafe(
    `REVOKE CREATE ON SCHEMA ${quoteIdent(schemaName)} FROM ${quoteIdent(roleName)}`,
  ).catch((err: any) => {
    logger.warn({ err: err?.message, roleName }, 'Failed to revoke CREATE on schema from plugin role');
  });
}

/**
 * Drops the restricted role and its privileges. Called on uninstall.
 */
export async function dropPluginRole(installId: string, tenantSlug: string): Promise<void> {
  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  const schemaName = toSchemaName(tenantSlug);
  await prisma.$executeRawUnsafe(
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${quoteIdent(schemaName)} FROM ${quoteIdent(roleName)}`,
  ).catch(() => {
    /* ignore */
  });
  await prisma.$executeRawUnsafe(
    `REVOKE USAGE ON SCHEMA ${quoteIdent(schemaName)} FROM ${quoteIdent(roleName)}`,
  ).catch(() => {
    /* ignore */
  });
  await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdent(roleName)}`);
  logger.info({ roleName }, 'Dropped restricted plugin DB role');
}
