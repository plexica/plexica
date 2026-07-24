import { prisma } from '../../../lib/database.js';
import { logger } from '../../../lib/logger.js';
import { toSchemaName } from '../../../lib/tenant-schema-helpers.js';
import { PluginInstallError } from '../errors.js';

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function revokeCreateOnSchema(installId: string, tenantSlug: string): Promise<void> {
  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  const schemaName = toSchemaName(tenantSlug);
  await prisma.$executeRawUnsafe(
    `REVOKE CREATE ON SCHEMA ${quoteIdent(schemaName)} FROM ${quoteIdent(roleName)}`,
  );
  const rows = await prisma.$queryRawUnsafe<Array<{ hasCreate: boolean }>>(
    `SELECT has_schema_privilege($1, $2, 'CREATE') AS "hasCreate"`,
    roleName,
    schemaName,
  );
  if (rows[0]?.hasCreate !== false) {
    throw new PluginInstallError(`Plugin database role still has CREATE on schema ${schemaName}`);
  }
}

export async function dropPluginRole(installId: string, tenantSlug: string): Promise<void> {
  const roleName = `plugin_${installId.replace(/-/g, '_')}`;
  const schemaName = toSchemaName(tenantSlug);
  await prisma.$executeRawUnsafe(
    `REVOKE ALL ON ALL TABLES IN SCHEMA ${quoteIdent(schemaName)} FROM ${quoteIdent(roleName)}`,
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe(
    `REVOKE ALL ON SCHEMA ${quoteIdent(schemaName)} FROM ${quoteIdent(roleName)}`,
  ).catch(() => undefined);
  await prisma.$executeRawUnsafe(`REASSIGN OWNED BY ${quoteIdent(roleName)} TO CURRENT_USER`).catch(() => undefined);
  await prisma.$executeRawUnsafe(`DROP OWNED BY ${quoteIdent(roleName)}`).catch(() => undefined);
  await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdent(roleName)}`);
  logger.info({ roleName }, 'Dropped restricted plugin DB role');
}
