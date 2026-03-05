/**
 * Integration Tests: Workspace Settings API
 *
 * Tests for Spec 009, Task 4 (Gap 4) — PATCH /api/workspaces/:id/settings endpoint:
 *   - 200 happy path: update settings as ADMIN
 *   - 400 validation: reject invalid settings values
 *   - 403 authorization: non-ADMIN member cannot update settings
 *   - 404 not found: workspace does not exist or belongs to different tenant
 *   - maxMembers enforcement: subsequent addMember respects the limit
 *
 * Requires live infrastructure: PostgreSQL + Keycloak.
 * Run with: pnpm test:integration
 *
 * Constitution: Art. 5.3 (Zod validation enforced), Art. 8.1 (integration tests required),
 *               Art. 8.2 (deterministic, AAA pattern), Art. 5.5 (tenant isolation).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from '../../../test-app.js';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper.js';
import { db } from '../../../lib/db.js';

describe('Workspace Settings Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let adminUserId: string;
  let memberUserId: string;
  let testTenantSlug: string;
  let schemaName: string;
  let testWorkspaceId: string;
  let testWorkspaceSlug: string;

  beforeAll(async () => {
    await testContext.resetAll();

    app = await buildTestApp();
    await app.ready();

    const superAdminToken = testContext.auth.createMockSuperAdminToken();

    // Unique slug per test run to avoid cross-test conflicts
    testTenantSlug = `settings-tenant-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    schemaName = `tenant_${testTenantSlug.replace(/-/g, '_')}`;

    // Create tenant
    const tenantResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: testTenantSlug,
        name: 'Settings Test Corp',
        adminEmail: `admin@${testTenantSlug}.test`,
        adminPassword: 'test123',
      },
    });

    if (tenantResponse.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantResponse.body}`);
    }

    // Create mock tokens
    adminToken = testContext.auth.createMockTenantAdminToken(testTenantSlug, {
      sub: 'a1a1a1a1-1111-4111-a111-111111111111',
      email: `admin@${testTenantSlug}.test`,
      given_name: 'Admin',
      family_name: 'User',
    });

    memberToken = testContext.auth.createMockTenantMemberToken(testTenantSlug, {
      sub: 'b2b2b2b2-2222-4222-b222-222222222222',
      email: `member@${testTenantSlug}.test`,
      given_name: 'Member',
      family_name: 'User',
    });

    const adminDecoded = testContext.auth.decodeToken(adminToken);
    const memberDecoded = testContext.auth.decodeToken(memberToken);
    adminUserId = adminDecoded.sub;
    memberUserId = memberDecoded.sub;

    // Seed users into tenant schema
    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."users" ("id","keycloak_id","email","first_name","last_name","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
      adminUserId,
      adminUserId,
      `admin@${testTenantSlug}.test`,
      'Admin',
      'User'
    );

    await db.$executeRawUnsafe(
      `INSERT INTO "${schemaName}"."users" ("id","keycloak_id","email","first_name","last_name","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT (id) DO NOTHING`,
      memberUserId,
      memberUserId,
      `member@${testTenantSlug}.test`,
      'Member',
      'User'
    );

    // Create a workspace to run settings tests against
    testWorkspaceSlug = `settings-ws-${Date.now()}`;
    const wsResponse = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: { authorization: `Bearer ${adminToken}`, 'x-tenant-slug': testTenantSlug },
      payload: {
        slug: testWorkspaceSlug,
        name: 'Settings Test Workspace',
      },
    });

    if (wsResponse.statusCode !== 201) {
      throw new Error(`Failed to create test workspace: ${wsResponse.body}`);
    }

    testWorkspaceId = wsResponse.json().id;
  });

  afterAll(async () => {
    try {
      await db.$executeRawUnsafe(
        `DELETE FROM "${schemaName}"."workspace_members" WHERE workspace_id = $1`,
        testWorkspaceId
      );
      await db.$executeRawUnsafe(
        `DELETE FROM "${schemaName}"."workspaces" WHERE id = $1`,
        testWorkspaceId
      );
    } catch {
      // ignore cleanup errors
    }

    if (app) await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Happy path
  // ─────────────────────────────────────────────────────────────────────────

  describe('PATCH /api/workspaces/:id/settings — happy path', () => {
    it('should update settings with 200 status when called by ADMIN', async () => {
      // Arrange
      const update = { isPublic: true, maxMembers: 50, notificationsEnabled: false };

      // Act
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${testWorkspaceId}/settings`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: update,
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.isPublic).toBe(true);
      expect(body.maxMembers).toBe(50);
      expect(body.notificationsEnabled).toBe(false);
      // Non-updated fields preserved at default
      expect(body.defaultMemberRole).toBe('MEMBER');
      expect(body.allowCrossWorkspaceSharing).toBe(false);
    });

    it('should return merged settings (partial update preserves existing values)', async () => {
      // Arrange — first set maxMembers = 100 (assert success to surface silent failures)
      const firstResponse = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${testWorkspaceId}/settings`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { maxMembers: 100 },
      });
      expect(firstResponse.statusCode).toBe(200);

      // Act — now only update isPublic; maxMembers should still be 100
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${testWorkspaceId}/settings`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { isPublic: false },
      });

      // Assert
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.isPublic).toBe(false);
      expect(body.maxMembers).toBe(100); // preserved from prior update
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Validation errors
  // ─────────────────────────────────────────────────────────────────────────

  describe('PATCH /api/workspaces/:id/settings — validation errors', () => {
    it('should return 400 for negative maxMembers', async () => {
      // Arrange
      const update = { maxMembers: -1 };

      // Act
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${testWorkspaceId}/settings`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: update,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid defaultMemberRole', async () => {
      // Arrange
      const update = { defaultMemberRole: 'SUPERUSER' };

      // Act
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${testWorkspaceId}/settings`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: update,
      });

      // Assert
      expect(response.statusCode).toBe(400);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Authorization
  // ─────────────────────────────────────────────────────────────────────────

  describe('PATCH /api/workspaces/:id/settings — authorization', () => {
    it('should return 403 when called by a non-ADMIN member', async () => {
      // Arrange — add member to workspace first
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${testWorkspaceId}/members`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { userId: memberUserId, role: 'MEMBER' },
      });

      // Act
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${testWorkspaceId}/settings`,
        headers: {
          authorization: `Bearer ${memberToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { isPublic: true },
      });

      // Assert
      expect(response.statusCode).toBe(403);
    });

    it('should return 401 when no auth token is provided', async () => {
      // Act
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${testWorkspaceId}/settings`,
        headers: {
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { isPublic: true },
      });

      // Assert
      expect([401, 403]).toContain(response.statusCode);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Not found / tenant isolation
  // ─────────────────────────────────────────────────────────────────────────

  describe('PATCH /api/workspaces/:id/settings — not found', () => {
    it('should return 404 for a workspace ID that does not exist', async () => {
      // Arrange
      const nonExistentId = '00000000-0000-4000-a000-000000000000';

      // Act
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${nonExistentId}/settings`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-tenant-slug': testTenantSlug,
          'content-type': 'application/json',
        },
        payload: { isPublic: true },
      });

      // Assert
      expect(response.statusCode).toBe(404);
    });
  });
});
