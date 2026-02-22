/**
 * Tenant Lifecycle E2E Tests (T001-26)
 *
 * Tests the full tenant lifecycle via the admin API:
 * - Suspension flow: create → suspend → verify SUSPENDED status
 * - Deletion flow: create → delete → verify PENDING_DELETION + deletionScheduledAt
 * - Reactivation flow: PENDING_DELETION → activate → verify SUSPENDED
 * - Full reactivation: SUSPENDED → activate → verify ACTIVE
 * - Resend invitation flow
 * - Idempotency guards (double-delete, double-suspend)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { TenantStatus } from '@plexica/database';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { buildTestApp } from '../../../test-app';
import { db } from '../../../lib/db';
import { redis } from '../../../lib/redis';

/** Seed a tenant directly in the DB, bypassing provisioning, for lifecycle tests. */
async function seedTenant(slug: string, status: TenantStatus = TenantStatus.ACTIVE) {
  return db.tenant.create({
    data: {
      slug,
      name: `Lifecycle Test: ${slug}`,
      status,
      settings: { adminEmail: `admin@${slug}.test` },
      theme: {},
    },
  });
}

describe('Tenant Lifecycle E2E', () => {
  let app: FastifyInstance;
  let superAdminToken: string;
  const ts = Date.now();

  beforeAll(async () => {
    app = await buildTestApp();
    await app.ready();
    superAdminToken = testContext.auth.createMockSuperAdminToken();
  }, 30000);

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
    try {
      await redis.quit();
    } catch {
      /* ignore already-closed */
    }
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Suspension flow
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Suspension flow', () => {
    it('suspends an ACTIVE tenant and returns SUSPENDED status', async () => {
      const tenant = await seedTenant(`lc-suspend-${ts}`);

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/suspend`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe(TenantStatus.SUSPENDED);

      // Verify DB was updated
      const dbTenant = await db.tenant.findUnique({ where: { id: tenant.id } });
      expect(dbTenant?.status).toBe(TenantStatus.SUSPENDED);
    });

    it('returns 404 when suspending a non-existent tenant', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/non-existent-id-00000/suspend`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 401 when trying to suspend without auth', async () => {
      const tenant = await seedTenant(`lc-suspend-noauth-${ts}`);

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/suspend`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Deletion flow
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Deletion flow', () => {
    it('marks an ACTIVE tenant as PENDING_DELETION with a 30-day countdown', async () => {
      const tenant = await seedTenant(`lc-delete-${ts}`);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('PENDING_DELETION');
      expect(body.deletionScheduledAt).toBeDefined();

      // Verify the scheduled date is ~30 days from now (within 2 min tolerance)
      const scheduledAt = new Date(body.deletionScheduledAt).getTime();
      const expectedAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(scheduledAt - expectedAt)).toBeLessThan(120_000); // ±2 min

      // Verify DB was updated
      const dbTenant = await db.tenant.findUnique({ where: { id: tenant.id } });
      expect(dbTenant?.status).toBe(TenantStatus.PENDING_DELETION);
    });

    it('returns 400 when deleting a tenant that is already PENDING_DELETION', async () => {
      const tenant = await seedTenant(`lc-dbl-del-${ts}`, TenantStatus.PENDING_DELETION);

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).toMatch(/already|pending/i);
    });

    it('returns 404 when deleting a non-existent tenant', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tenants/non-existent-id-99999`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Reactivation flow
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Reactivation flow', () => {
    it('activates a SUSPENDED tenant and returns ACTIVE status', async () => {
      const tenant = await seedTenant(`lc-reactivate-${ts}`, TenantStatus.SUSPENDED);

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe(TenantStatus.ACTIVE);

      // Verify DB
      const dbTenant = await db.tenant.findUnique({ where: { id: tenant.id } });
      expect(dbTenant?.status).toBe(TenantStatus.ACTIVE);
    });

    it('activates a PENDING_DELETION tenant (first step: → SUSPENDED)', async () => {
      const tenant = await seedTenant(`lc-cancel-del-${ts}`, TenantStatus.PENDING_DELETION);

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      // Per spec: PENDING_DELETION → SUSPENDED (not directly to ACTIVE)
      expect(body.status).toBe(TenantStatus.SUSPENDED);

      // deletionScheduledAt should be cleared
      expect(body.deletionScheduledAt).toBeNull();
    });

    it('returns 400 when activating a tenant that is already ACTIVE', async () => {
      const tenant = await seedTenant(`lc-already-active-${ts}`, TenantStatus.ACTIVE);

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      // Should reject the invalid status transition
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 when activating a non-existent tenant', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/non-existent-id-11111/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Full lifecycle: ACTIVE → SUSPENDED → DELETE → REACTIVATE → ACTIVE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Complete lifecycle sequence', () => {
    it('walks through the full tenant lifecycle state machine', async () => {
      const tenant = await seedTenant(`lc-full-${ts}`, TenantStatus.ACTIVE);

      // Step 1: Suspend
      const suspendRes = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/suspend`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(suspendRes.statusCode).toBe(200);
      expect(JSON.parse(suspendRes.body).status).toBe(TenantStatus.SUSPENDED);

      // Step 2: Schedule deletion
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(deleteRes.statusCode).toBe(200);
      expect(JSON.parse(deleteRes.body).status).toBe('PENDING_DELETION');

      // Step 3: Cancel deletion (activate: PENDING_DELETION → SUSPENDED)
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(cancelRes.statusCode).toBe(200);
      const cancelBody = JSON.parse(cancelRes.body);
      expect(cancelBody.status).toBe(TenantStatus.SUSPENDED);
      expect(cancelBody.deletionScheduledAt).toBeNull();

      // Step 4: Reactivate (SUSPENDED → ACTIVE)
      const reactivateRes = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/activate`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });
      expect(reactivateRes.statusCode).toBe(200);
      expect(JSON.parse(reactivateRes.body).status).toBe(TenantStatus.ACTIVE);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Resend invitation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Resend invitation flow', () => {
    it('returns 404 when resending invite to a non-existent tenant', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/non-existent-id-22222/resend-invite`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when tenant has no adminEmail configured', async () => {
      // Seed tenant without adminEmail in settings
      const tenant = await db.tenant.create({
        data: {
          slug: `lc-no-email-${ts}`,
          name: 'No Email Tenant',
          status: TenantStatus.ACTIVE,
          settings: {}, // no adminEmail
          theme: {},
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/resend-invite`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).toMatch(/email|no admin/i);
    });

    it('returns 400 when invitation has already been accepted', async () => {
      const tenant = await db.tenant.create({
        data: {
          slug: `lc-accepted-${ts}`,
          name: 'Accepted Invitation Tenant',
          status: TenantStatus.ACTIVE,
          settings: {
            adminEmail: `admin-accepted-${ts}@example.com`,
            invitationStatus: 'accepted',
          },
          theme: {},
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/resend-invite`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      const bodyStr = JSON.stringify(body).toLowerCase();
      expect(bodyStr).toMatch(/accepted|already/i);
    });

    it('returns 401 for unauthenticated resend invite request', async () => {
      const tenant = await seedTenant(`lc-invite-noauth-${ts}`);

      const res = await app.inject({
        method: 'POST',
        url: `/api/admin/tenants/${tenant.id}/resend-invite`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Tenant detail retrieval
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Tenant detail (GET /api/admin/tenants/:id)', () => {
    it('retrieves full tenant details by ID', async () => {
      const tenant = await seedTenant(`lc-detail-${ts}`);

      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/tenants/${tenant.id}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.id).toBe(tenant.id);
      expect(body.slug).toBe(tenant.slug);
      expect(body.name).toBe(tenant.name);
      expect(body.status).toBe(TenantStatus.ACTIVE);
    });

    it('returns 404 for non-existent tenant', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/admin/tenants/non-existent-id-33333`,
        headers: { authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
