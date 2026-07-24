// Durable resource identifiers captured before any destructive saga step.

import { z } from 'zod';

import { toRealmName, toSchemaName } from '../../../lib/tenant-schema-helpers.js';

import type { PrismaClient, Prisma } from '@prisma/client';

const SCHEMA_NAME_REGEX = /^tenant_[a-z0-9_]{1,55}$/;

export const DeletionContextSchema = z.object({
  tenantSlug: z.string().min(1).max(63),
  schemaName: z.string().regex(SCHEMA_NAME_REGEX),
  realmName: z.string().min(1).max(255),
  bucketName: z.string().min(1).max(255),
  pluginInstallIds: z.array(z.string().uuid()),
});

export type DeletionContext = z.infer<typeof DeletionContextSchema>;

async function readPluginInstallIds(prisma: PrismaClient, schemaName: string): Promise<string[]> {
  const relation = `${schemaName}.plugin_installations`;
  const exists = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
    'SELECT to_regclass($1)::text AS name',
    relation
  );
  if (exists[0]?.name === null || exists[0] === undefined) return [];
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id::text AS id FROM "${schemaName}".plugin_installations`
  );
  return rows.map((row) => row.id);
}

export async function captureDeletionContext(
  prisma: PrismaClient,
  tenantId: string
): Promise<DeletionContext> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true, minioBucket: true, config: { select: { keycloakRealm: true } } },
  });
  if (tenant === null) throw new Error('Tenant not found while capturing deletion context');

  const schemaName = toSchemaName(tenant.slug);
  if (!SCHEMA_NAME_REGEX.test(schemaName)) throw new Error('Invalid tenant schema identifier');

  return {
    tenantSlug: tenant.slug,
    schemaName,
    realmName: tenant.config?.keycloakRealm ?? toRealmName(tenant.slug),
    bucketName: tenant.minioBucket ?? `tenant-${tenant.slug}`,
    pluginInstallIds: await readPluginInstallIds(prisma, schemaName),
  };
}

export async function ensureDeletionContext(
  prisma: PrismaClient,
  tenantId: string,
  stored: Prisma.JsonValue | null
): Promise<DeletionContext> {
  const parsed = DeletionContextSchema.safeParse(stored);
  if (parsed.success) return parsed.data;

  const captured = await captureDeletionContext(prisma, tenantId);
  await prisma.tenant.updateMany({
    where: { id: tenantId, status: 'pending_deletion' },
    data: { deletionContext: captured },
  });
  return captured;
}
