import { randomUUID } from 'node:crypto';

import { adminFetch, getAdminToken } from '../../../../e2e/keycloak/admin-api.js';

export function setCoreServiceDefaults(): void {
  process.env['NODE_ENV'] ??= 'test';
  process.env['DATABASE_URL'] ??= 'postgresql://plexica:changeme@localhost:5432/plexica';
  process.env['KEYCLOAK_URL'] ??= process.env['PLAYWRIGHT_KEYCLOAK_URL'] ?? 'http://localhost:8080';
  process.env['KEYCLOAK_ADMIN_USER'] ??= 'admin';
  process.env['KEYCLOAK_ADMIN_PASSWORD'] ??= 'changeme';
  process.env['REDIS_URL'] ??= 'redis://localhost:6379';
  process.env['MINIO_ENDPOINT'] ??= 'http://localhost:9000';
  process.env['MINIO_ACCESS_KEY'] ??= 'minioadmin';
  process.env['MINIO_SECRET_KEY'] ??= 'changeme';
  process.env['KAFKA_BROKERS'] ??= 'localhost:19092';
}

export async function postgresSchemaExists(schemaName: string): Promise<boolean> {
  setCoreServiceDefaults();
  const { prisma } = await import('../../../../services/core-api/src/lib/database.js');
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ${schemaName}) AS exists
  `;
  return rows[0]?.exists ?? false;
}

export async function keycloakRealmExists(realmName: string): Promise<boolean> {
  const token = await getAdminToken();
  const response = await adminFetch(token, `/admin/realms/${encodeURIComponent(realmName)}`, 'GET');
  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`Keycloak realm existence check failed with status ${response.status}`);
}

export async function minioBucketExists(bucketName: string): Promise<boolean> {
  setCoreServiceDefaults();
  const { bucketExists } = await import('../../../../services/core-api/src/lib/minio-client.js');
  return bucketExists(bucketName);
}

export async function seedTenantDeletionResidue(
  tenantId: string,
  tenantSlug: string,
  schemaName: string
): Promise<string[]> {
  setCoreServiceDefaults();
  const [{ prisma }, { redis }] = await Promise.all([
    import('../../../../services/core-api/src/lib/database.js'),
    import('../../../../services/core-api/src/lib/redis.js'),
  ]);
  const installId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${schemaName}".plugin_installations
      (id, plugin_id, tenant_slug, status, installed_by)
      VALUES ($1::uuid, $2::uuid, $3, 'active', $4::uuid)`,
    installId,
    randomUUID(),
    tenantSlug,
    randomUUID()
  );
  const keys = [
    `abac:${tenantSlug}:${randomUUID()}:${randomUUID()}`,
    `plugin:vis:${installId}:${randomUUID()}`,
    `plugin:cb:${installId}`,
    `tenant:${tenantId}:settings`,
    `metrics:${tenantSlug}:users`,
    `cache:${tenantSlug}:config`,
  ];
  await redis.mset(keys.flatMap((key) => [key, 'e2e-sensitive-value']));
  return keys;
}

export async function readGdprResidue(
  tenantId: string,
  redisKeys: string[]
): Promise<{
  configCount: number;
  tenant: {
    slug: string;
    name: string;
    minioBucket: string | null;
    deletionContext: unknown;
  } | null;
  auditMetadata: string;
  redisValues: Array<string | null>;
}> {
  setCoreServiceDefaults();
  const [{ prisma }, { redis }] = await Promise.all([
    import('../../../../services/core-api/src/lib/database.js'),
    import('../../../../services/core-api/src/lib/redis.js'),
  ]);
  const [configCount, tenant, audits, redisValues] = await Promise.all([
    prisma.tenantConfig.count({ where: { tenantId } }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, name: true, minioBucket: true, deletionContext: true },
    }),
    prisma.platformAuditLog.findMany({ where: { tenantId }, select: { metadata: true } }),
    redis.mget(redisKeys),
  ]);
  return {
    configCount,
    tenant,
    auditMetadata: JSON.stringify(audits.map((audit) => audit.metadata)),
    redisValues,
  };
}
