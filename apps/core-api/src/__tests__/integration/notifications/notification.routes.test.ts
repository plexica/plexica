// File: apps/core-api/src/__tests__/integration/notifications/notification.routes.test.ts
// Spec 007 T007-41: Integration tests for Notification REST endpoints
//
// Covers:
//   POST  /api/v1/notifications           (admin-only — send single)
//   POST  /api/v1/notifications/bulk      (admin-only — send bulk)
//   GET   /api/v1/notifications           (any auth — list own notifications)
//   PATCH /api/v1/notifications/:id/read  (any auth — mark as read)
//   POST  /api/v1/notifications/mark-all-read (any auth)
//
// Pattern: buildTestApp() + app.inject() + mock tokens (workspace-crud pattern)
// Constitution Art. 5.2: no PII in assertions
// Constitution Art. 6.2: error responses are { error: { code, message } }

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

describe('Notification Routes Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let testTenantSlug: string;
  let tenantId: string;
  let adminUserId: string;
  let memberUserId: string;

  beforeAll(async () => {
    await testContext.resetAll();

    app = await buildTestApp();
    await app.ready();

    const superAdminToken = testContext.auth.createMockSuperAdminToken();
    testTenantSlug = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const tenantRes = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: { authorization: `Bearer ${superAdminToken}`, 'content-type': 'application/json' },
      payload: {
        slug: testTenantSlug,
        name: 'Notification Test Tenant',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'Test1234!',
      },
    });

    if (tenantRes.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantRes.body}`);
    }
    tenantId = tenantRes.json().id;

    adminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug, {
      sub: 'c3c3c3c3-3333-4333-c333-333333333333',
      email: `admin@${testTenantSlug}.test`,
    });
    memberToken = testContext.auth.createMockTenantMemberToken(testTenantSlug, {
      sub: 'd4d4d4d4-4444-4444-d444-444444444444',
      email: `member@${testTenantSlug}.test`,
    });

    adminUserId = testContext.auth.decodeToken(adminToken).sub;
    memberUserId = testContext.auth.decodeToken(memberToken).sub;
  });

  afterAll(async () => {
    // Clean up notifications created during tests
    try {
      await (db as any).notification.deleteMany({ where: { tenantId } });
    } catch {
      // ignore cleanup errors
    }
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/notifications — send single (admin-only)
  // -------------------------------------------------------------------------
  describe('POST /api/v1/notifications', () => {
    it('should send an IN_APP notification and return 201 when called by admin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          tenantId,
          userId: memberUserId,
          channel: 'IN_APP',
          title: 'Welcome',
          body: 'You have been added to the tenant.',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json).toHaveProperty('id');
      expect(json.channel).toBe('IN_APP');
    });

    it('should return 403 when called by a regular member', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          tenantId,
          userId: memberUserId,
          channel: 'IN_APP',
          title: 'Test',
          body: 'Not allowed',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          // missing: tenantId, userId, title, body, channel
          channel: 'IN_APP',
        },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications',
        headers: {
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { tenantId, userId: memberUserId, channel: 'IN_APP', title: 'T', body: 'B' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/notifications/bulk — send bulk (admin-only)
  // -------------------------------------------------------------------------
  describe('POST /api/v1/notifications/bulk', () => {
    it('should enqueue bulk notifications and return 202', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/bulk',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: [
          { tenantId, userId: adminUserId, channel: 'IN_APP', title: 'Bulk 1', body: 'Body 1' },
          { tenantId, userId: memberUserId, channel: 'IN_APP', title: 'Bulk 2', body: 'Body 2' },
        ],
      });

      expect(res.statusCode).toBe(202);
      const json = res.json();
      expect(json).toHaveProperty('count', 2);
    });

    it('should return 400 when body is not an array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/bulk',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { tenantId, userId: adminUserId, channel: 'IN_APP', title: 'x', body: 'y' },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when any item fails validation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/bulk',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: [
          { tenantId, userId: adminUserId, channel: 'IN_APP', title: 'Valid', body: 'ok' },
          { tenantId, channel: 'IN_APP' /* missing userId, title, body */ },
        ],
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/notifications — list own notifications
  // -------------------------------------------------------------------------
  describe('GET /api/v1/notifications', () => {
    it('should return notifications list for the authenticated user (200)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('notifications');
      expect(json).toHaveProperty('unreadCount');
      expect(json).toHaveProperty('count');
      expect(Array.isArray(json.notifications)).toBe(true);
    });

    it('should support ?unread=true filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications?unread=true',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      // All returned notifications should be unread (status !== READ)
      for (const n of json.notifications) {
        expect(n.status).not.toBe('READ');
      }
    });

    it('should support pagination via ?limit= and ?offset=', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications?limit=1&offset=0',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.notifications.length).toBeLessThanOrEqual(1);
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { 'x-tenant-slug': testTenantSlug },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/v1/notifications/:id/read — mark as read
  // -------------------------------------------------------------------------
  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('should mark a notification as read (200) and return updated unread count', async () => {
      // First send a notification to member so we can mark it read
      const sendRes = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: {
          tenantId,
          userId: memberUserId,
          channel: 'IN_APP',
          title: 'Mark Read Test',
          body: 'Please read me.',
        },
      });
      expect(sendRes.statusCode).toBe(201);
      const notifId = sendRes.json().id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${notifId}/read`,
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('notification');
      expect(json.notification.status).toBe('READ');
      expect(json).toHaveProperty('unreadCount');
      expect(typeof json.unreadCount).toBe('number');
    });

    it('should return 404 for a notification not owned by the user', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/notifications/00000000-0000-4000-0000-000000000099/read',
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(404);
      const json = res.json();
      expect(json.error.code).toBe('NOTIFICATION_NOT_FOUND');
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/notifications/mark-all-read
  // -------------------------------------------------------------------------
  describe('POST /api/v1/notifications/mark-all-read', () => {
    it('should mark all notifications as read and return count (200)', async () => {
      // Send a couple of notifications to admin first
      await app.inject({
        method: 'POST',
        url: '/api/v1/notifications',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { tenantId, userId: adminUserId, channel: 'IN_APP', title: 'A1', body: 'B1' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/mark-all-read',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json).toHaveProperty('count');
      expect(typeof json.count).toBe('number');
    });
  });
});
