/**
 * Tenant Lifecycle Integration Tests (T001-16)
 *
 * Tests covering the full tenant lifecycle:
 * - Slug availability check
 * - Soft delete (PENDING_DELETION) with deletionScheduledAt
 * - Double-deletion guard
 * - Reactivation: PENDING_DELETION → SUSPENDED (not ACTIVE)
 * - Reactivation: SUSPENDED → ACTIVE
 * - GET /admin/tenants filter by PENDING_DELETION / DELETED + deletionScheduledAt in response
 * - Super Admin access to SUSPENDED tenant (no 403)
 * - Theme validation on PATCH
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app.js';
import { db } from '../../../lib/db.js';
import { redis } from '../../../lib/redis.js';
import { keycloakService } from '../../../services/keycloak.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a tenant directly in the DB (bypasses provisioning, for lifecycle tests) */
async function createTestTenant(slug: string, status = 'ACTIVE') {
  return db.tenant.create({
    data: {
      slug,
      name: `Test ${slug}`,
      status: status as any,
      settings: { adminEmail: `admin@${slug}.test` },
      theme: {},
    },
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Tenant Lifecycle Integration', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  let regularUserToken: string;

  beforeAll(async () => {
    await testContext.resetAll();
    app = await buildTestApp();
    await app.ready();

    superAdminToken = testContext.auth.createMockSuperAdminToken();
    regularUserToken = testContext.auth.createMockTenantAdminToken('acme');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await redis.flushdb();

    // Clean up test tenants (keep seed 'acme')
    const toDelete = await db.tenant.findMany({
      where: { slug: { not: 'acme' } },
      select: { slug: true },
    });

    await Promise.allSettled(
      toDelete.map(async ({ slug }) => {
        try {
          await keycloakService.deleteRealm(slug);
        } catch {
          /* ignore */
        }
        const schemaName = `tenant_${slug.replace(/-/g, '_')}`;
        try {
          await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        } catch {
          /* ignore */
        }
      })
    );

    await db.tenant.deleteMany({ where: { slug: { not: 'acme' } } });
  });

  // =========================================================================
  // GET /api/admin/tenants/check-slug
  // =========================================================================

  describe('GET /api/admin/tenants/check-slug', () => {
    it('should return available: true for an unused slug', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants/check-slug?slug=brand-new-slug',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.slug).toBe('brand-new-slug');
      expect(data.available).toBe(true);
    });

    it('should return available: false for an existing slug', async () => {
      await createTestTenant('taken-slug');

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants/check-slug?slug=taken-slug',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.slug).toBe('taken-slug');
      expect(data.available).toBe(false);
    });

    it('should return 400 for an invalid slug format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants/check-slug?slug=Invalid-Uppercase',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for a slug starting with a hyphen', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants/check-slug?slug=-starts-with-hyphen',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require super-admin authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants/check-slug?slug=some-slug',
      });

      expect([401, 403]).toContain(response.statusCode);
    });
  });

  // =========================================================================
  // DELETE /api/admin/tenants/:id  (soft delete)
  // =========================================================================

  describe('DELETE /api/admin/tenants/:id', () => {
    it('should set status to PENDING_DELETION with deletionScheduledAt ~30 days out', async () => {
      const tenant = await createTestTenant('to-be-deleted');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.status).toBe('PENDING_DELETION');
      expect(data.deletionScheduledAt).toBeDefined();

      // Verify the scheduled date is approximately 30 days from now
      const scheduledAt = new Date(data.deletionScheduledAt);
      const thirtyDaysOut = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const delta = Math.abs(scheduledAt.getTime() - thirtyDaysOut);
      expect(delta).toBeLessThan(60_000); // within 1 minute

      // Verify DB state
      const updated = await db.tenant.findUnique({ where: { id: tenant.id } });
      expect(updated?.status).toBe('PENDING_DELETION');
      expect(updated?.deletionScheduledAt).not.toBeNull();
    });

    it('should return 400 when tenant is already PENDING_DELETION', async () => {
      const tenant = await createTestTenant('double-delete-guard', 'PENDING_DELETION');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error.code).toBe('ALREADY_PENDING_DELETION');
    });

    it('should return 404 for a non-existent tenant', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/admin/tenants/non-existent-id-00000000',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 404 for a DELETED tenant', async () => {
      const tenant = await createTestTenant('already-deleted', 'DELETED');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /api/admin/tenants/:id/activate  (reactivation)
  // =========================================================================

  describe('POST /api/admin/tenants/:id/activate', () => {
    it('should transition PENDING_DELETION → SUSPENDED (not ACTIVE)', async () => {
      const tenant = await createTestTenant('pending-deletion-tenant', 'PENDING_DELETION');

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.status).toBe('SUSPENDED');

      // Verify deletionScheduledAt is cleared
      const updated = await db.tenant.findUnique({ where: { id: tenant.id } });
      expect(updated?.status).toBe('SUSPENDED');
      expect(updated?.deletionScheduledAt).toBeNull();
    });

    it('should transition SUSPENDED → ACTIVE', async () => {
      const tenant = await createTestTenant('suspended-tenant', 'SUSPENDED');

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.status).toBe('ACTIVE');
    });

    it('should return 400 for invalid status transition (e.g. ACTIVE)', async () => {
      const tenant = await createTestTenant('active-tenant', 'ACTIVE');

      const response = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should return 404 for non-existent tenant', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/tenants/non-existent-id/activate',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // GET /api/admin/tenants — filter + deletionScheduledAt in response
  // =========================================================================

  describe('GET /api/admin/tenants', () => {
    it('should filter by PENDING_DELETION status', async () => {
      await createTestTenant('active-one', 'ACTIVE');
      await createTestTenant('pending-one', 'PENDING_DELETION');

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants?status=PENDING_DELETION',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      const slugs = data.data.map((t: any) => t.slug);
      expect(slugs).toContain('pending-one');
      expect(slugs).not.toContain('active-one');
      expect(slugs).not.toContain('acme');
    });

    it('should include deletionScheduledAt field on every tenant in the list', async () => {
      await createTestTenant('has-no-deletion', 'ACTIVE');

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data.length).toBeGreaterThan(0);
      for (const tenant of data.data) {
        expect(tenant).toHaveProperty('deletionScheduledAt');
      }
    });

    it('should accept DELETED as a valid status filter', async () => {
      await createTestTenant('deleted-one', 'DELETED');

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenants?status=DELETED',
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      const slugs = data.data.map((t: any) => t.slug);
      expect(slugs).toContain('deleted-one');
    });
  });

  // =========================================================================
  // PATCH /api/admin/tenants/:id — theme validation
  // =========================================================================

  describe('PATCH /api/admin/tenants/:id (theme validation)', () => {
    it('should accept a valid theme object', async () => {
      const tenant = await createTestTenant('theme-test-tenant');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          theme: {
            primaryColor: '#1a2b3c',
            secondaryColor: '#ffffff',
            accentColor: '#abcdef',
            fontFamily: 'Inter',
          },
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should reject an invalid hex color', async () => {
      const tenant = await createTestTenant('theme-invalid-color');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          theme: {
            primaryColor: 'not-a-color',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error.code).toBe('THEME_VALIDATION');
    });

    it('should reject customCss exceeding 10240 bytes', async () => {
      const tenant = await createTestTenant('theme-big-css');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          theme: {
            customCss: 'a'.repeat(10241),
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error.code).toBe('THEME_VALIDATION');
    });

    it('should reject an invalid URL for logoUrl', async () => {
      const tenant = await createTestTenant('theme-invalid-url');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          theme: {
            logoUrl: 'not-a-url',
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const data = JSON.parse(response.body);
      expect(data.error.code).toBe('THEME_VALIDATION');
    });

    it('should accept a partial theme update (subset of fields)', async () => {
      const tenant = await createTestTenant('theme-partial');

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        payload: {
          theme: {
            fontFamily: 'Roboto',
          },
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // Tenant context middleware: Super Admin bypass for SUSPENDED
  // =========================================================================

  describe('Tenant context middleware', () => {
    it('Super Admin should receive 200 (not 403) on a SUSPENDED tenant', async () => {
      await createTestTenant('super-admin-bypass', 'SUSPENDED');

      // Access tenant-scoped endpoint as super admin
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'x-tenant-slug': 'super-admin-bypass',
        },
      });

      // Super admin should NOT get 403
      expect(response.statusCode).not.toBe(403);
    });

    it('Regular user should receive 403 on a SUSPENDED tenant', async () => {
      await createTestTenant('suspended-for-user', 'SUSPENDED');

      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
          'x-tenant-slug': 'suspended-for-user',
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('All users should receive 404 on a DELETED tenant', async () => {
      await createTestTenant('deleted-for-all', 'DELETED');

      const superResponse = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          'x-tenant-slug': 'deleted-for-all',
        },
      });
      expect(superResponse.statusCode).toBe(404);

      const userResponse = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
          'x-tenant-slug': 'deleted-for-all',
        },
      });
      expect(userResponse.statusCode).toBe(404);
    });
  });
});
