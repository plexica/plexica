// tenant-provisioning.test.ts
// Integration tests for full tenant provisioning with rollback.
// Skips when Keycloak or MinIO are not reachable.
//
// M-4 fix: added EC-04 test — MinIO bucket creation fails after schema + realm
// succeed → both realm and schema must be rolled back. Uses vi.spyOn to inject
// a MinIO failure without needing MinIO to be down while Keycloak is up.

import { afterAll, describe, expect, it, vi } from 'vitest';

import { config } from '../lib/config.js';
import { prisma } from '../lib/database.js';
import { provisionTenant } from '../modules/tenant/tenant-provisioning.js';
import * as minioClient from '../lib/minio-client.js';

const TEST_SLUG = 'provision-test-org';
const TEST_SCHEMA = 'tenant_provision_test_org';

async function isKeycloakReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.KEYCLOAK_URL}/realms/master`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function isMinioReachable(): Promise<boolean> {
  try {
    // Use new URL() to correctly join base + path, avoiding the double-protocol
    // bug that occurred when MINIO_ENDPOINT was already a full URL (http://...).
    const url = new URL('/minio/health/live', config.MINIO_ENDPOINT).toString();
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status === 200;
  } catch {
    return false;
  }
}

async function isDbReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const keycloakOk = await isKeycloakReachable();
const minioOk = await isMinioReachable();
const allServicesOk = keycloakOk && minioOk;
const dbOk = await isDbReachable();

afterAll(async () => {
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${TEST_SCHEMA}" CASCADE`);
    await prisma.tenantConfig.deleteMany({ where: { tenant: { slug: TEST_SLUG } } });
    await prisma.tenant.deleteMany({ where: { slug: TEST_SLUG } });
  } catch {
    /* ignore — DB may not be running */
  }
  await prisma.$disconnect();
});

describe('Tenant provisioning', () => {
  it.skipIf(!allServicesOk)(
    'happy path: provisions schema + realm + bucket (NFR-05 < 30s)',
    async () => {
      const start = Date.now();
      const result = await provisionTenant({
        slug: TEST_SLUG,
        name: 'Provision Test Org',
        adminEmail: 'admin@provision-test.example',
      });
      const elapsed = Date.now() - start;

      expect(result.tenantId).toBeDefined();
      expect(result.slug).toBe(TEST_SLUG);
      expect(result.schemaName).toBe(TEST_SCHEMA);
      expect(result.realmName).toMatch(/plexica-/);
      expect(result.minioBucket).toBeDefined();
      expect(elapsed).toBeLessThan(30_000);
    }
  );

  it.skipIf(!allServicesOk)('prevents duplicate provisioning (ALREADY_EXISTS)', async () => {
    await expect(
      provisionTenant({ slug: TEST_SLUG, name: 'Duplicate', adminEmail: 'admin@dup.example' })
    ).rejects.toThrow();
  });

  // EC-03: schema rolled back when Keycloak creation fails.
  // Requires DB but NOT Keycloak.
  it.skipIf(!dbOk || keycloakOk)(
    'rollback EC-03: schema dropped when Keycloak realm creation fails',
    async () => {
      const slug = 'rollback-test-no-kc';
      const schema = 'tenant_rollback_test_no_kc';
      try {
        await expect(
          provisionTenant({ slug, name: 'Rollback', adminEmail: 'x@x.com' })
        ).rejects.toThrow();

        const rows = await prisma.$queryRaw<Array<{ schema_name: string }>>`
          SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}
        `;
        expect(rows).toHaveLength(0);
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        expect(tenant).toBeNull();
      } finally {
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await prisma.tenant.deleteMany({ where: { slug } });
      }
    }
  );

  // M-4 / EC-04: MinIO bucket creation fails after schema + realm succeed.
  // All three rollback steps (bucket → realm → schema) must execute in reverse order.
  // Uses vi.spyOn to inject MinIO failure without taking MinIO offline.
  it.skipIf(!keycloakOk || !dbOk)(
    'rollback EC-04: realm and schema dropped when MinIO bucket creation fails',
    async () => {
      const slug = 'rollback-test-no-minio';
      const schema = 'tenant_rollback_test_no_minio';
      const realmName = `plexica-${slug}`;

      // Inject MinIO failure for this test only
      const createBucketSpy = vi
        .spyOn(minioClient, 'createBucket')
        .mockRejectedValueOnce(new Error('MinIO connection refused (injected for EC-04 test)'));

      try {
        await expect(
          provisionTenant({ slug, name: 'No MinIO', adminEmail: 'x@x.com' })
        ).rejects.toThrow();

        // Verify PostgreSQL schema was dropped (schema rollback)
        const schemaRows = await prisma.$queryRaw<Array<{ schema_name: string }>>`
          SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}
        `;
        expect(schemaRows).toHaveLength(0);

        // Verify tenant record was removed (schema rollback)
        const tenant = await prisma.tenant.findUnique({ where: { slug } });
        expect(tenant).toBeNull();

        // Verify Keycloak realm was deleted (realm rollback)
        // Use admin API with admin credentials from config
        const tokenRes = await fetch(
          `${config.KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'password',
              client_id: 'admin-cli',
              username: config.KEYCLOAK_ADMIN_USER,
              password: config.KEYCLOAK_ADMIN_PASSWORD,
            }).toString(),
          }
        );
        if (tokenRes.ok) {
          const { access_token } = (await tokenRes.json()) as { access_token: string };
          const realmRes = await fetch(`${config.KEYCLOAK_URL}/admin/realms/${realmName}`, {
            headers: { Authorization: `Bearer ${access_token}` },
          });
          // 404 = realm was cleaned up
          expect(realmRes.status).toBe(404);
        }
      } finally {
        createBucketSpy.mockRestore();
        await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
        await prisma.tenantConfig.deleteMany({ where: { tenant: { slug } } }).catch(() => {});
        await prisma.tenant.deleteMany({ where: { slug } }).catch(() => {});
      }
    }
  );

  it('rejects invalid slug format', async () => {
    await expect(
      provisionTenant({ slug: 'INVALID!!', name: 'Bad', adminEmail: 'x@x.com' })
    ).rejects.toThrow();
  });
});
