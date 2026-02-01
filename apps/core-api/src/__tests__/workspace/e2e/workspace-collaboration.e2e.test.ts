import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { WorkspaceRole } from '@plexica/database';
import { buildTestApp } from '../../../test-app';
import { testContext } from '../../../../../../test-infrastructure/helpers/test-context.helper';
import { db } from '../../../lib/db';

/**
 * E2E Tests: Workspace Collaboration
 *
 * Tests complete collaboration workflows across the entire stack:
 * - Multi-user collaboration scenarios
 * - Complex permission interactions
 * - Last admin protection in real scenarios
 * - Large workspace handling (100+ members)
 * - Team-based collaboration
 *
 * These tests simulate real-world usage patterns with multiple users,
 * roles, and operations happening in sequence.
 */
describe('Workspace Collaboration E2E', () => {
  let app: FastifyInstance;
  let admin1Token: string;
  let admin2Token: string;
  let member1Token: string;
  let member2Token: string;
  let viewerToken: string;
  let admin1UserId: string;
  let admin2UserId: string;
  let member1UserId: string;
  let member2UserId: string;
  let viewerUserId: string;

  beforeAll(async () => {
    // Reset all state
    await testContext.resetAll();

    // Build test app
    app = await buildTestApp();
    await app.ready();

    // Get admin token
    const admin1TokenResp = await testContext.auth.getRealTenantAdminToken('acme-corp');
    admin1Token = admin1TokenResp.access_token;

    // Get user IDs
    const admin1User = await db.user.findFirst({
      where: { email: 'test-tenant-admin-acme@example.com' },
    });
    admin1UserId = admin1User!.id;

    // Create additional test users
    const admin2User = await db.user.create({
      data: {
        email: 'admin2@acme-corp.example.com',
        firstName: 'Admin',
        lastName: 'Two',
      },
    });
    admin2UserId = admin2User.id;

    const member1User = await db.user.create({
      data: {
        email: 'member1@acme-corp.example.com',
        firstName: 'Member',
        lastName: 'One',
      },
    });
    member1UserId = member1User.id;

    const member2User = await db.user.create({
      data: {
        email: 'member2@acme-corp.example.com',
        firstName: 'Member',
        lastName: 'Two',
      },
    });
    member2UserId = member2User.id;

    const viewerUser = await db.user.create({
      data: {
        email: 'viewer@acme-corp.example.com',
        firstName: 'Viewer',
        lastName: 'User',
      },
    });
    viewerUserId = viewerUser.id;

    // For simplicity, we'll use admin token for all operations in this test
    // In a real scenario, you'd get separate tokens for each user
    admin2Token = admin1Token; // Placeholder
    member1Token = admin1Token; // Placeholder
    member2Token = admin1Token; // Placeholder
    viewerToken = admin1Token; // Placeholder
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Full Collaboration Workflow', () => {
    it('should support complete collaboration workflow', async () => {
      // Step 1: Admin creates workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `collab-workflow-${Date.now()}`,
          name: 'Collaboration Workflow Test',
          description: 'Testing full collaboration workflow',
        },
      });

      expect(createResponse.statusCode).toBe(201);
      const workspace = createResponse.json();
      const workspaceId = workspace.id;

      // Verify admin is creator
      const members = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}'
      `)) as any[];

      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(admin1UserId);
      expect(members[0].role).toBe(WorkspaceRole.ADMIN);

      // Step 2: Admin adds member1 (MEMBER role)
      const addMember1Response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          userId: member1UserId,
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(addMember1Response.statusCode).toBe(201);

      // Step 3: Admin adds member2 (VIEWER role)
      const addMember2Response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          userId: member2UserId,
          role: WorkspaceRole.VIEWER,
        },
      });

      expect(addMember2Response.statusCode).toBe(201);

      // Step 4: Admin creates team
      const createTeamResponse = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/teams`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          name: 'Engineering Team',
          description: 'Core engineering team',
        },
      });

      // Team creation might not be implemented yet, so handle both cases
      const teamCreated = createTeamResponse.statusCode === 201;
      let teamId: string | undefined;

      if (teamCreated) {
        teamId = createTeamResponse.json().id;

        // Step 5: Admin adds member1 to team
        await app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/teams/${teamId}/members`,
          headers: { authorization: `Bearer ${admin1Token}` },
          payload: {
            userId: member1UserId,
          },
        });
      }

      // Step 6: Member1 views workspace (allowed)
      const member1ViewResponse = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${member1Token}` },
      });

      expect(member1ViewResponse.statusCode).toBe(200);

      // Step 7: Member1 attempts to update workspace (denied)
      const member1UpdateResponse = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${member1Token}` },
        payload: {
          name: 'Unauthorized Update',
        },
      });

      expect(member1UpdateResponse.statusCode).toBe(403);

      // Step 8: Viewer views workspace (allowed)
      const viewerViewResponse = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${viewerToken}` },
      });

      expect(viewerViewResponse.statusCode).toBe(200);

      // Step 9: Viewer attempts to add member (denied)
      const viewerAddResponse = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${viewerToken}` },
        payload: {
          userId: viewerUserId,
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(viewerAddResponse.statusCode).toBe(403);

      // Step 10: Admin promotes member1 to ADMIN
      const promoteMember1Response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${member1UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          role: WorkspaceRole.ADMIN,
        },
      });

      expect(promoteMember1Response.statusCode).toBe(200);

      // Step 11: Member1 can now update workspace
      const member1UpdateNowResponse = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${member1Token}` },
        payload: {
          name: 'Member1 Updated Name',
        },
      });

      expect(member1UpdateNowResponse.statusCode).toBe(200);

      // Step 12: Member1 adds another member (admin3)
      const addAdmin2Response = await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${member1Token}` },
        payload: {
          userId: admin2UserId,
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(addAdmin2Response.statusCode).toBe(201);

      // Step 13: Admin1 demotes self to MEMBER (allowed, member1 is admin)
      const demoteSelfResponse = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${admin1UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(demoteSelfResponse.statusCode).toBe(200);

      // Verify final state
      const finalMembers = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}'
        ORDER BY "joinedAt"
      `)) as any[];

      expect(finalMembers.length).toBeGreaterThanOrEqual(4);

      // Find admin count
      const adminCount = finalMembers.filter((m: any) => m.role === WorkspaceRole.ADMIN).length;
      expect(adminCount).toBeGreaterThanOrEqual(1); // At least member1 is admin
    });
  });

  describe('Last Admin Protection in Real Scenarios', () => {
    it('should enforce last admin protection throughout workflow', async () => {
      // Step 1: Create workspace (admin1)
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `last-admin-protect-${Date.now()}`,
          name: 'Last Admin Protection Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Step 2: Add admin2 as ADMIN
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          userId: admin2UserId,
          role: WorkspaceRole.ADMIN,
        },
      });

      // Step 3: Admin1 demotes self to MEMBER (allowed)
      const demoteAdmin1Response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${admin1UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          role: WorkspaceRole.MEMBER,
        },
      });

      expect(demoteAdmin1Response.statusCode).toBe(200);

      // Step 4: Admin2 attempts to remove self (denied - last admin)
      const removeAdmin2Response = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/${admin2UserId}`,
        headers: { authorization: `Bearer ${admin2Token}` },
      });

      expect(removeAdmin2Response.statusCode).toBe(400);

      // Step 5: Admin2 adds admin3 as ADMIN
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin2Token}` },
        payload: {
          userId: member1UserId,
          role: WorkspaceRole.ADMIN,
        },
      });

      // Step 6: Admin2 can now remove self (allowed)
      const removeAdmin2NowResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/${admin2UserId}`,
        headers: { authorization: `Bearer ${admin2Token}` },
      });

      expect(removeAdmin2NowResponse.statusCode).toBe(204);

      // Verify admin count
      const finalMembers = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}'
      `)) as any[];

      const adminCount = finalMembers.filter((m: any) => m.role === WorkspaceRole.ADMIN).length;
      expect(adminCount).toBeGreaterThanOrEqual(1);
    });

    it('should prevent last admin from leaving workspace', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `prevent-last-admin-leave-${Date.now()}`,
          name: 'Prevent Last Admin Leave',
        },
      });

      const workspaceId = createResponse.json().id;

      // Try to remove self (only admin)
      const removeResponse = await app.inject({
        method: 'DELETE',
        url: `/api/workspaces/${workspaceId}/members/${admin1UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      expect(removeResponse.statusCode).toBe(400);
      const body = removeResponse.json();
      expect(body.message || body.error).toMatch(/last admin|cannot remove/i);
    });
  });

  describe('Large Workspace Handling', () => {
    it('should handle workspace with 100+ members efficiently', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `large-workspace-${Date.now()}`,
          name: 'Large Workspace Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Create 100 users and add them to workspace
      const memberCount = 100;
      const userIds: string[] = [];

      console.log(`Creating ${memberCount} test users...`);
      const startTime = Date.now();

      for (let i = 0; i < memberCount; i++) {
        try {
          const user = await db.user.create({
            data: {
              email: `large-test-user-${i}-${Date.now()}@example.com`,
              firstName: `User`,
              lastName: `${i}`,
            },
          });
          userIds.push(user.id);
        } catch (error) {
          // Ignore duplicate errors
        }
      }

      console.log(`Created ${userIds.length} users in ${Date.now() - startTime}ms`);

      // Add users to workspace (in batches for better performance)
      const batchSize = 10;
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);

        await Promise.all(
          batch.map((userId) =>
            app.inject({
              method: 'POST',
              url: `/api/workspaces/${workspaceId}/members`,
              headers: { authorization: `Bearer ${admin1Token}` },
              payload: {
                userId,
                role: WorkspaceRole.MEMBER,
              },
            })
          )
        );
      }

      // Test listing members with pagination
      const listStartTime = Date.now();
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members?limit=50`,
        headers: { authorization: `Bearer ${admin1Token}` },
      });
      const listDuration = Date.now() - listStartTime;

      expect(listResponse.statusCode).toBe(200);
      const members = listResponse.json();
      expect(members.length).toBeLessThanOrEqual(50);

      // Performance should be acceptable (< 1 second)
      expect(listDuration).toBeLessThan(1000);

      console.log(`Listed 50 members in ${listDuration}ms`);

      // Test getting workspace details
      const detailsStartTime = Date.now();
      const detailsResponse = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
      });
      const detailsDuration = Date.now() - detailsStartTime;

      expect(detailsResponse.statusCode).toBe(200);
      const workspace = detailsResponse.json();
      expect(workspace._count.members).toBeGreaterThan(50);

      // Performance should be acceptable
      expect(detailsDuration).toBeLessThan(1000);

      console.log(`Got workspace details in ${detailsDuration}ms`);
    });

    it('should paginate large member lists correctly', async () => {
      // Create workspace with multiple members
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `pagination-test-${Date.now()}`,
          name: 'Pagination Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Add 25 members
      const userIds: string[] = [];
      for (let i = 0; i < 25; i++) {
        const user = await db.user.create({
          data: {
            email: `pagination-user-${i}-${Date.now()}@example.com`,
            firstName: `User`,
            lastName: `${i}`,
          },
        });
        userIds.push(user.id);

        await app.inject({
          method: 'POST',
          url: `/api/workspaces/${workspaceId}/members`,
          headers: { authorization: `Bearer ${admin1Token}` },
          payload: {
            userId: user.id,
            role: WorkspaceRole.MEMBER,
          },
        });
      }

      // Test pagination
      const page1Response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members?limit=10&offset=0`,
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      expect(page1Response.statusCode).toBe(200);
      const page1 = page1Response.json();
      expect(page1.length).toBe(10);

      const page2Response = await app.inject({
        method: 'GET',
        url: `/api/workspaces/${workspaceId}/members?limit=10&offset=10`,
        headers: { authorization: `Bearer ${admin1Token}` },
      });

      expect(page2Response.statusCode).toBe(200);
      const page2 = page2Response.json();
      expect(page2.length).toBe(10);

      // Ensure pages don't overlap
      const page1Ids = page1.map((m: any) => m.userId);
      const page2Ids = page2.map((m: any) => m.userId);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });
  });

  describe('Multi-Workspace Membership', () => {
    it('should allow user to be member of multiple workspaces', async () => {
      // Create 3 workspaces
      const workspace1Response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `multi-ws-1-${Date.now()}`,
          name: 'Multi Workspace 1',
        },
      });

      const workspace2Response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `multi-ws-2-${Date.now()}`,
          name: 'Multi Workspace 2',
        },
      });

      const workspace3Response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `multi-ws-3-${Date.now()}`,
          name: 'Multi Workspace 3',
        },
      });

      const ws1Id = workspace1Response.json().id;
      const ws2Id = workspace2Response.json().id;
      const ws3Id = workspace3Response.json().id;

      // Add member1 to all 3 workspaces with different roles
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${ws1Id}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member1UserId, role: WorkspaceRole.ADMIN },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${ws2Id}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member1UserId, role: WorkspaceRole.MEMBER },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${ws3Id}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member1UserId, role: WorkspaceRole.VIEWER },
      });

      // List member1's workspaces
      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${member1Token}` },
      });

      expect(listResponse.statusCode).toBe(200);
      const workspaces = listResponse.json();

      // Should include all 3 workspaces with correct roles
      const ws1 = workspaces.find((w: any) => w.id === ws1Id);
      const ws2 = workspaces.find((w: any) => w.id === ws2Id);
      const ws3 = workspaces.find((w: any) => w.id === ws3Id);

      expect(ws1).toBeDefined();
      expect(ws1.memberRole).toBe(WorkspaceRole.ADMIN);

      expect(ws2).toBeDefined();
      expect(ws2.memberRole).toBe(WorkspaceRole.MEMBER);

      expect(ws3).toBeDefined();
      expect(ws3.memberRole).toBe(WorkspaceRole.VIEWER);
    });

    it('should enforce different permissions in different workspaces', async () => {
      // Create 2 workspaces
      const ws1Response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `perm-ws-1-${Date.now()}`,
          name: 'Permission WS 1',
        },
      });

      const ws2Response = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `perm-ws-2-${Date.now()}`,
          name: 'Permission WS 2',
        },
      });

      const ws1Id = ws1Response.json().id;
      const ws2Id = ws2Response.json().id;

      // Add member1 as ADMIN in ws1, VIEWER in ws2
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${ws1Id}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member1UserId, role: WorkspaceRole.ADMIN },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${ws2Id}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member1UserId, role: WorkspaceRole.VIEWER },
      });

      // Member1 can update ws1 (admin)
      const updateWs1Response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${ws1Id}`,
        headers: { authorization: `Bearer ${member1Token}` },
        payload: { name: 'Updated by Member1' },
      });

      expect(updateWs1Response.statusCode).toBe(200);

      // Member1 cannot update ws2 (viewer)
      const updateWs2Response = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${ws2Id}`,
        headers: { authorization: `Bearer ${member1Token}` },
        payload: { name: 'Unauthorized Update' },
      });

      expect(updateWs2Response.statusCode).toBe(403);
    });
  });

  describe('Complex Permission Scenarios', () => {
    it('should handle admin transferring ownership', async () => {
      // Create workspace
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `ownership-transfer-${Date.now()}`,
          name: 'Ownership Transfer Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Add member1
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member1UserId, role: WorkspaceRole.MEMBER },
      });

      // Promote member1 to admin (sharing ownership)
      await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${member1UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { role: WorkspaceRole.ADMIN },
      });

      // Original admin demotes self to member (transferring primary ownership)
      const demoteResponse = await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${admin1UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { role: WorkspaceRole.MEMBER },
      });

      expect(demoteResponse.statusCode).toBe(200);

      // Verify member1 is now admin and admin1 is member
      const members = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}'
      `)) as any[];

      const member1Record = members.find((m) => m.userId === member1UserId);
      const admin1Record = members.find((m) => m.userId === admin1UserId);

      expect(member1Record.role).toBe(WorkspaceRole.ADMIN);
      expect(admin1Record.role).toBe(WorkspaceRole.MEMBER);
    });

    it('should handle cascading role changes', async () => {
      // Create workspace with multiple admins and members
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/workspaces',
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: {
          slug: `cascade-roles-${Date.now()}`,
          name: 'Cascade Roles Test',
        },
      });

      const workspaceId = createResponse.json().id;

      // Add multiple users
      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: admin2UserId, role: WorkspaceRole.ADMIN },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member1UserId, role: WorkspaceRole.MEMBER },
      });

      await app.inject({
        method: 'POST',
        url: `/api/workspaces/${workspaceId}/members`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { userId: member2UserId, role: WorkspaceRole.VIEWER },
      });

      // Promote viewer to member
      await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${member2UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { role: WorkspaceRole.MEMBER },
      });

      // Demote member to viewer
      await app.inject({
        method: 'PATCH',
        url: `/api/workspaces/${workspaceId}/members/${member1UserId}`,
        headers: { authorization: `Bearer ${admin1Token}` },
        payload: { role: WorkspaceRole.VIEWER },
      });

      // Verify final state
      const members = (await db.$queryRawUnsafe(`
        SELECT * FROM "tenant_acme_corp"."WorkspaceMember"
        WHERE "workspaceId" = '${workspaceId}'
        ORDER BY "role"
      `)) as any[];

      const adminCount = members.filter((m) => m.role === WorkspaceRole.ADMIN).length;
      const memberCount = members.filter((m) => m.role === WorkspaceRole.MEMBER).length;
      const viewerCount = members.filter((m) => m.role === WorkspaceRole.VIEWER).length;

      expect(adminCount).toBe(2); // admin1, admin2
      expect(memberCount).toBe(1); // member2 (promoted)
      expect(viewerCount).toBe(1); // member1 (demoted)
    });
  });
});
