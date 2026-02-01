import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WorkspaceRole } from '@plexica/database';
import { buildTestApp } from '../../../test-app';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { db } from '../../../lib/db';

/**
 * Integration Tests: Workspace Members
 *
 * Tests member management operations with real database and authentication:
 * - Add members to workspace
 * - Update member roles
 * - Remove members
 * - List members
 * - Last admin protection
 *
 * These tests use real Keycloak tokens and verify database state.
 */
describe('Workspace Members Integration', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let memberToken: string;
  let viewerToken: string;
  let workspaceId: string;
  let adminUserId: string;
  let memberUserId: string;
  let viewerUserId: string;
  let extraUserId: string;

  beforeAll(async () => {
    // Reset all state
    await testContext.resetAll();

    // Build test app
    app = await buildTestApp();
    await app.ready();

    // Get super admin token to create tenant
    const superAdminResp = await testContext.auth.getRealSuperAdminToken();
    const superAdminToken = superAdminResp.access_token;

    // Create test tenant
    const tenantResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/tenants',
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        'content-type': 'application/json',
      },
      payload: {
        slug: 'acme',
        name: 'ACME Corporation',
        adminEmail: 'admin@acme.test',
        adminPassword: 'test123',
      },
    });

    if (tenantResponse.statusCode !== 201) {
      throw new Error(`Failed to create test tenant: ${tenantResponse.body}`);
    }

    // Get tokens for different users
    const adminTokenResp = await testContext.auth.getRealTenantAdminToken('acme');
    adminToken = adminTokenResp.access_token;

    const memberTokenResp = await testContext.auth.getRealTenantMemberToken('acme');
    memberToken = memberTokenResp.access_token;

    // Decode tokens to get user IDs
    const adminDecoded = testContext.auth.decodeToken(adminToken);
    const memberDecoded = testContext.auth.decodeToken(memberToken);

    adminUserId = adminDecoded.sub;
    memberUserId = memberDecoded.sub;

    // Create a workspace as admin
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-tenant-id': 'acme',
      },
      payload: {
        slug: 'members-test-workspace',
        name: 'Members Test Workspace',
        description: 'Workspace for testing member operations',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const workspace = createResponse.json();
    workspaceId = workspace.id;

    // Create additional test user ID (mock for now)
    extraUserId = 'extra-user-id-123';
    viewerUserId = 'viewer-user-id-456';
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/workspaces/:id/members - Add Member', () => {
    it('should add member with default role (MEMBER)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberUserId,
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(201);
      const member = response.json();

      expect(member.userId).toBe(memberUserId);
      expect(member.role).toBe(WorkspaceRole.MEMBER);
      expect(member.workspaceId).toBe(workspaceId);

      // Verify in database
      const dbMember = await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${memberUserId}'
      `);

      expect(dbMember).toHaveLength(1);
    });

    it('should add member with VIEWER role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: viewerUserId,
          role: WorkspaceRole.VIEWER,
        },
      });

      expect(response.statusCode).toBe(201);
      const member = response.json();

      expect(member.userId).toBe(viewerUserId);
      expect(member.role).toBe(WorkspaceRole.VIEWER);
    });

    it('should add member with ADMIN role', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: extraUserId,
          role: WorkspaceRole.ADMIN,
        },
      });

      expect(response.statusCode).toBe(201);
      const member = response.json();

      expect(member.userId).toBe(extraUserId);
      expect(member.role).toBe(WorkspaceRole.ADMIN);

      // Verify in database
      const dbMember = await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${extraUserId}'
      `);

      expect(dbMember).toHaveLength(1);
      expect((dbMember as any)[0].role).toBe(WorkspaceRole.ADMIN);
    });

    it('should reject duplicate member (409)', async () => {
      // Try to add memberUserId again (already added above)
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberUserId,
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json();
      expect(body.message || body.error).toMatch(/already.*member|duplicate/i);
    });

    it('should reject non-admin user (403)', async () => {
      // Create a new user to add
      const newUser = await db.user.create({
        data: {
          email: 'new-member@example.com',
          firstName: 'New',
          lastName: 'Member',
          passwordHash: 'hashed',
        },
      });

      // Try to add member as non-admin
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          userId: newUser.id,
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should reject invalid user ID (404)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: 'non-existent-user-id',
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.message || body.error).toMatch(/user.*not found/i);
    });

    it('should reject invalid workspace ID (404)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/workspaces/non-existent-workspace/members',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: memberUserId,
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should validate role enum', async () => {
      const newUser = await db.user.create({
        data: {
          email: 'invalid-role-test@example.com',
          firstName: 'Invalid',
          lastName: 'Role',
          passwordHash: 'hashed',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          userId: newUser.id,
          role: 'INVALID_ROLE',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should require userId in payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: WorkspaceRole.MEMBER,
          // userId missing
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/workspaces/:id/members - List Members', () => {
    it('should list all members (any role can view)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const members = response.json();

      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeGreaterThan(0);

      // Should include user details
      members.forEach((member: any) => {
        expect(member).toHaveProperty('userId');
        expect(member).toHaveProperty('role');
        expect(member).toHaveProperty('user');
        expect(member.user).toHaveProperty('email');
        expect(member.user).toHaveProperty('firstName');
        expect(member.user).toHaveProperty('lastName');
      });
    });

    it('should allow member to view members', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(response.statusCode).toBe(200);
      const members = response.json();
      expect(Array.isArray(members)).toBe(true);
    });

    it('should filter members by role', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members?role=ADMIN`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const members = response.json();

      expect(Array.isArray(members)).toBe(true);
      members.forEach((member: any) => {
        expect(member.role).toBe(WorkspaceRole.ADMIN);
      });
    });

    it('should paginate results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members?limit=2&offset=0`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const members = response.json();

      expect(Array.isArray(members)).toBe(true);
      expect(members.length).toBeLessThanOrEqual(2);
    });

    it('should return 404 for non-existent workspace', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/workspaces/non-existent/members',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 for non-member', async () => {
      // Get token for user not in workspace
      const outsiderToken = await testContext.auth.getRealSuperAdminToken();

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${outsiderToken.access_token}` },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/workspaces/:id/members/:userId - Get Member', () => {
    it('should get specific member details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members/${memberUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const member = response.json();

      expect(member.userId).toBe(memberUserId);
      expect(member.role).toBe(WorkspaceRole.MEMBER);
      expect(member).toHaveProperty('user');
      expect(member.user).toHaveProperty('email');
      expect(member).toHaveProperty('joinedAt');
    });

    it('should include full user profile', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members/${memberUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const member = response.json();

      expect(member.user).toHaveProperty('id');
      expect(member.user).toHaveProperty('email');
      expect(member.user).toHaveProperty('firstName');
      expect(member.user).toHaveProperty('lastName');
    });

    it('should return 404 for non-member', async () => {
      const nonMember = await db.user.create({
        data: {
          email: 'non-member@example.com',
          firstName: 'Non',
          lastName: 'Member',
          passwordHash: 'hashed',
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members/${nonMember.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should allow any member to view other members', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('PATCH /api/workspaces/:id/members/:userId - Update Member Role', () => {
    it('should update member role (ADMIN action)', async () => {
      // Promote member to admin
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${memberUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: WorkspaceRole.ADMIN,
        },
      });

      expect(response.statusCode).toBe(200);
      const updatedMember = response.json();

      expect(updatedMember.userId).toBe(memberUserId);
      expect(updatedMember.role).toBe(WorkspaceRole.ADMIN);

      // Verify in database
      const dbMember = await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${memberUserId}'
      `);

      expect((dbMember as any)[0].role).toBe(WorkspaceRole.ADMIN);
    });

    it('should demote admin to member when other admins exist', async () => {
      // Demote extraUserId (who is admin) to member
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${extraUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(200);
      const updatedMember = response.json();

      expect(updatedMember.role).toBe(WorkspaceRole.MEMBER);
    });

    it('should prevent demoting last admin', async () => {
      // First, ensure only adminUserId is admin
      // Get all admins
      const admins = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "role" = 'ADMIN'
      `)) as any[];

      // Demote all except adminUserId
      for (const admin of admins) {
        if (admin.userId !== adminUserId) {
          await db.$executeRawUnsafe(`
            UPDATE "tenant_acme_corp"."WorkspaceMember"
            SET "role" = 'MEMBER'
            WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${admin.userId}'
          `);
        }
      }

      // Now try to demote last admin
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message || body.error).toMatch(/last admin|cannot demote/i);
    });

    it('should allow admin to demote self if others exist', async () => {
      // First promote memberUserId to admin
      await db.$executeRawUnsafe(`
        UPDATE "tenant_acme_corp"."WorkspaceMember"
        SET "role" = 'ADMIN'
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${memberUserId}'
      `);

      // Now admin can demote self
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(response.statusCode).toBe(200);

      // Restore admin status for other tests
      await db.$executeRawUnsafe(`
        UPDATE "tenant_acme_corp"."WorkspaceMember"
        SET "role" = 'ADMIN'
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${adminUserId}'
      `);
    });

    it('should validate new role', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${memberUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: 'INVALID_ROLE',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${viewerUserId}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          role: WorkspaceRole.ADMIN,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-existent member', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/non-existent-user`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: WorkspaceRole.ADMIN,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/workspaces/:id/members/:userId - Remove Member', () => {
    let removableUserId: string;

    beforeAll(async () => {
      // Create a user specifically for removal tests
      const removableUser = await db.user.create({
        data: {
          email: 'removable@example.com',
          firstName: 'Removable',
          lastName: 'User',
          passwordHash: 'hashed',
        },
      });
      removableUserId = removableUser.id;

      // Add to workspace
      await db.$executeRawUnsafe(`
        INSERT INTO "tenant_acme_corp"."WorkspaceMember" ("workspaceId", "userId", "role", "invitedBy", "joinedAt")
        VALUES ('${workspaceId}', '${removableUserId}', 'MEMBER', '${adminUserId}', NOW())
      `);
    });

    it('should remove member (ADMIN action)', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/${removableUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify removal in database
      const dbMember = await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}' AND "userId" = '${removableUserId}'
      `);

      expect(dbMember).toHaveLength(0);
    });

    it('should prevent removing last admin', async () => {
      // Ensure adminUserId is the only admin
      await db.$executeRawUnsafe(`
        UPDATE "tenant_acme_corp"."WorkspaceMember"
        SET "role" = 'MEMBER'
        WHERE "workspaceId" = '${workspaceId}' AND "role" = 'ADMIN' AND "userId" != '${adminUserId}'
      `);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/${adminUserId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message || body.error).toMatch(/last admin|cannot remove/i);
    });

    it('should cascade delete team memberships', async () => {
      // Create a team
      const team = (await db.$queryRawUnsafe(`
        INSERT INTO "tenant_acme_corp"."Team" ("id", "workspaceId", "name", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), '${workspaceId}', 'Test Team', NOW(), NOW())
        RETURNING *
      `)) as any[];

      const teamId = team[0].id;

      // Add member to team
      const testUser = await db.user.create({
        data: {
          email: 'cascade-test@example.com',
          firstName: 'Cascade',
          lastName: 'Test',
          passwordHash: 'hashed',
        },
      });

      await db.$executeRawUnsafe(`
        INSERT INTO "tenant_acme_corp"."WorkspaceMember" ("workspaceId", "userId", "role", "invitedBy", "joinedAt")
        VALUES ('${workspaceId}', '${testUser.id}', 'MEMBER', '${adminUserId}', NOW())
      `);

      await db.$executeRawUnsafe(`
        INSERT INTO "tenant_acme_corp"."TeamMember" ("teamId", "userId", "role", "joinedAt")
        VALUES ('${teamId}', '${testUser.id}', 'MEMBER', NOW())
      `);

      // Remove workspace member
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/${testUser.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(204);

      // Verify team membership is also removed
      const teamMemberships = await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."TeamMember"
        WHERE "teamId" = '${teamId}' AND "userId" = '${testUser.id}'
      `);

      expect(teamMemberships).toHaveLength(0);
    });

    it('should return 403 for non-admin', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/${viewerUserId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 for non-member', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/non-existent-user`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Member Count Tracking', () => {
    it('should track member count correctly', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(response.statusCode).toBe(200);
      const workspace = response.json();

      expect(workspace).toHaveProperty('_count');
      expect(workspace._count).toHaveProperty('members');
      expect(workspace._count.members).toBeGreaterThan(0);

      // Verify count matches actual members
      const members = (await db.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}'
      `)) as any[];

      expect(workspace._count.members).toBe(parseInt(members[0].count));
    });
  });
});
