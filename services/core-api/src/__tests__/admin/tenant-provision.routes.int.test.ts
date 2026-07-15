// tenant-provision.routes.int.test.ts
// Integration tests for POST /api/v1/admin/tenants — tenant provisioning with
// pre-flight conflict detection + audit logging (S5-401 / Feature 005-04).
// Uses real PostgreSQL + Keycloak + MinIO (no mocks of core services).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { prisma } from '../../lib/database.js';
import { deleteBucket } from '../../lib/minio-client.js';
import { deleteRealm } from '../../lib/keycloak-admin.js';
import { toSchemaName } from '../../lib/tenant-schema-helpers.js';
import { tenantProvisionRoutes } from '../../modules/admin/routes/tenant-provision.routes.js';
import {
  createTestServer,
  isDbReachable,
  isKeycloakReachable,
  isMinioReachable,
  makeFullStub,
} from '../helpers/server.helpers.js';

import type { FastifyInstance } from 'fastify';
import type { TenantContext } from '../../lib/tenant-context-store.js';

const SUPER_ADMIN_ACTOR = '00000000-0000-0000-0000-000000000000';
const masterCtx: TenantContext = {
  slug: 'system', schemaName: 'core', realmName: 'master',
  tenantId: SUPER_ADMIN_ACTOR,
};

const SUFFIX = Date.now().toString(36);
const SLUG = `intprov-${SUFFIX}`;
const SCHEMA = toSchemaName(SLUG);
const SCHEMA_EDGE_SLUG = `intprov-sch-${SUFFIX}`;
const SCHEMA_EDGE = toSchemaName(SCHEMA_EDGE_SLUG);

let server: FastifyInstance;

beforeAll(async () => {
  const dbOk = await isDbReachable();
  const kcOk = await isKeycloakReachable();
  const minioOk = await isMinioReachable();
  if (!dbOk || !kcOk || !minioOk) {
    throw new Error(
      'PostgreSQL + Keycloak + MinIO must all be reachable for tenant provisioning integration tests.'
    );
  }
  // Pre-create a schema with no tenant row to exercise the schema_exists path.
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${SCHEMA_EDGE}"`);

  server = await createTestServer();
  server.addHook('preHandler', makeFullStub(SUPER_ADMIN_ACTOR, masterCtx, ['super_admin']));
  await server.register(tenantProvisionRoutes, { prefix: '/api/v1/admin' });
  await server.ready();
});

afterAll(async () => {
  for (const schema of [SCHEMA, SCHEMA_EDGE]) {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
  }
  await deleteRealm(`plexica-${SLUG}`).catch(() => {});
  await deleteBucket(`tenant-${SLUG}`).catch(() => {});
  await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: SLUG } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: SLUG } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: SCHEMA_EDGE_SLUG } }).catch(() => {});
  await prisma.$disconnect();
  await server.close();
});

describe('POST /api/v1/admin/tenants — provisioning', () => {
  it('happy path: provisions tenant → 201, tenant row present, audit logged', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/tenants',
      payload: { slug: SLUG, name: 'Integration Prov Org', adminEmail: `admin@${SLUG}.example` },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.slug).toBe(SLUG);
    expect(body.tenantId).toBeDefined();
    expect(body.schemaName).toBe(SCHEMA);
    expect(body.realmName).toBe(`plexica-${SLUG}`);

    const tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
    expect(tenant).not.toBeNull();
    expect(tenant?.status).toBe('active');

    const audit = await prisma.platformAuditLog.findFirst({
      where: { action: 'tenant.provision', resourceId: body.tenantId },
    });
    expect(audit).not.toBeNull();
  });

  it('edge: duplicate slug → 409 conflictType=tenant_slug_exists', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/tenants',
      payload: { slug: SLUG, name: 'Dup', adminEmail: `dup@${SLUG}.example` },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error.conflictType).toBe('tenant_slug_exists');
  });

  it('edge: schema already exists (no tenant row) → 409 conflictType=schema_exists', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/tenants',
      payload: {
        slug: SCHEMA_EDGE_SLUG, name: 'Schema Conflict',
        adminEmail: `sch@${SCHEMA_EDGE_SLUG}.example`,
      },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.payload);
    expect(body.error.conflictType).toBe('schema_exists');
  });

  it('edge: invalid body → 422', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/admin/tenants',
      payload: { slug: 'BAD!!', name: '', adminEmail: 'not-an-email' },
    });
    expect(res.statusCode).toBe(422);
  });
});
