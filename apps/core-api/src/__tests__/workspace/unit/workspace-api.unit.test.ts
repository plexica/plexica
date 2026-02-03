import 'dotenv/config';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspaceRole } from '@plexica/database';
import { WorkspaceService } from '../../../modules/workspace/workspace.service.js';
import type { CreateWorkspaceDto, AddMemberDto } from '../../../modules/workspace/dto/index.js';

// Mock tenant context and workspace operations
vi.mock('../../../middleware/tenant-context.js', () => ({
  getTenantContext: vi.fn(() => ({
    tenantId: 'test-tenant-123',
    tenantSlug: 'test-tenant',
    schemaName: 'tenant_test_tenant_123',
    schema: 'tenant_test_tenant_123',
  })),
  executeInTenantSchema: vi.fn((db, callback) => callback(db)),
}));

/**
 * Helper to create mock database with all necessary methods for Prisma
 */
function createMockDb(overrides: any = {}): any {
  const mockTx = {
    $executeRaw: vi.fn().mockResolvedValue(undefined),
    $queryRaw: vi.fn().mockResolvedValue([]),
  };

  return {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workspace: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    workspaceMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    team: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $transaction: vi.fn(async (callback: any) => await callback(mockTx)),
    ...overrides,
  };
}

describe('Workspace Integration Tests', () => {
  let workspaceService: WorkspaceService;

  beforeEach(() => {
    workspaceService = new WorkspaceService();
  });

  describe('Create Workspace', () => {
    it('should create a workspace with the creator as admin', async () => {
      const mockDb = createMockDb({
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([]) // check slug uniqueness - not found
          .mockResolvedValueOnce([{ id: 'workspace-1' }]) // generate workspace ID
          .mockResolvedValueOnce([
            // fetch complete workspace with relations
            {
              id: 'workspace-1',
              tenant_id: 'test-tenant-123',
              slug: 'test-workspace',
              name: 'Test Workspace',
              description: 'Test workspace description',
              settings: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ]),
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ id: 'workspace-1' }]) // generate workspace ID
              .mockResolvedValueOnce([
                // fetch complete workspace with relations
                {
                  id: 'workspace-1',
                  tenant_id: 'test-tenant-123',
                  slug: 'test-workspace',
                  name: 'Test Workspace',
                  description: 'Test workspace description',
                  settings: {},
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ]),
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: CreateWorkspaceDto = {
        name: 'Test Workspace',
        slug: 'test-workspace',
        description: 'Test workspace description',
      };

      const result = await workspaceService.create(dto, 'user-1');

      expect(result).toBeDefined();
      expect(result?.slug).toBe('test-workspace');
      expect(result?.name).toBe('Test Workspace');
    });

    it('should reject duplicate workspace slug within tenant', async () => {
      const mockDb = createMockDb({
        $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'existing-1' }]), // check slug uniqueness - found existing
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: CreateWorkspaceDto = {
        name: 'Test Workspace',
        slug: 'test-workspace',
      };

      await expect(workspaceService.create(dto, 'user-1')).rejects.toThrow(
        "Workspace with slug 'test-workspace' already exists"
      );
    });

    it('should create workspace with custom settings', async () => {
      const mockDb = createMockDb({
        $queryRaw: vi
          .fn()
          .mockResolvedValueOnce([]) // check slug uniqueness - not found
          .mockResolvedValueOnce([{ id: 'workspace-1' }]) // generate workspace ID
          .mockResolvedValueOnce([
            // fetch complete workspace with relations
            {
              id: 'workspace-1',
              tenant_id: 'test-tenant-123',
              slug: 'test-workspace',
              name: 'Test Workspace',
              settings: { theme: 'dark', notifications: true },
              created_at: new Date(),
              updated_at: new Date(),
            },
          ]),
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ id: 'workspace-1' }]) // generate workspace ID
              .mockResolvedValueOnce([
                // fetch complete workspace with relations
                {
                  id: 'workspace-1',
                  tenant_id: 'test-tenant-123',
                  slug: 'test-workspace',
                  name: 'Test Workspace',
                  settings: { theme: 'dark', notifications: true },
                  created_at: new Date(),
                  updated_at: new Date(),
                },
              ]),
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: CreateWorkspaceDto = {
        name: 'Test Workspace',
        slug: 'test-workspace',
        settings: { theme: 'dark', notifications: true },
      };

      const result = await workspaceService.create(dto, 'user-1');
      expect(result?.settings).toEqual({ theme: 'dark', notifications: true });
    });
  });

  describe('Retrieve Workspaces', () => {
    it('should get all workspaces for a user', async () => {
      const mockWorkspaces = [
        {
          id: 'workspace-1',
          tenant_id: 'test-tenant-123',
          slug: 'test-workspace',
          name: 'Test Workspace',
          description: 'Test workspace',
          settings: {},
          created_at: new Date(),
          updated_at: new Date(),
          member_role: WorkspaceRole.ADMIN,
          joined_at: new Date(),
          member_count: 3,
          team_count: 2,
        },
        {
          id: 'workspace-2',
          tenant_id: 'test-tenant-123',
          slug: 'second-workspace',
          name: 'Second Workspace',
          description: 'Second workspace',
          settings: {},
          created_at: new Date(),
          updated_at: new Date(),
          member_role: WorkspaceRole.MEMBER,
          joined_at: new Date(),
          member_count: 2,
          team_count: 1,
        },
      ];

      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce(mockWorkspaces), // get workspaces
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.findAll('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe('test-workspace');
      expect(result[0].memberRole).toBe(WorkspaceRole.ADMIN);
    });

    it('should return empty array when user has no workspaces', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce([]), // get workspaces - empty
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.findAll('user-no-workspaces');

      expect(result).toEqual([]);
    });

    it('should get workspace by ID with members and teams', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        tenant_id: 'test-tenant-123',
        slug: 'test-workspace',
        name: 'Test Workspace',
        created_at: new Date(),
        updated_at: new Date(),
        members: [
          {
            id: 'wm-1',
            user_id: 'user-1',
            workspace_id: 'workspace-1',
            role: WorkspaceRole.ADMIN,
            user: {
              id: 'user-1',
              email: 'user@test.com',
              firstName: 'User',
              lastName: 'Test',
            },
          },
        ],
        teams: [
          {
            id: 'team-1',
            name: 'Engineering',
            description: 'Engineering team',
            workspaceId: 'workspace-1',
            createdAt: new Date(),
          },
        ],
      };

      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce([mockWorkspace]), // get workspace with members and teams
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.findOne('workspace-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('workspace-1');
      expect(result?.members).toHaveLength(1);
      expect(result?.teams).toHaveLength(1);
    });

    it('should throw error when workspace not found', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce([]), // get workspace - not found
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.findOne('non-existent')).rejects.toThrow(
        'Workspace non-existent not found'
      );
    });
  });

  describe('Update Workspace', () => {
    it('should update workspace details', async () => {
      const updatedWorkspace = {
        id: 'workspace-1',
        tenant_id: 'test-tenant-123',
        slug: 'test-workspace',
        name: 'Updated Workspace',
        description: 'Updated description',
        settings: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce([updatedWorkspace]), // update and get workspace
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.update('workspace-1', {
        name: 'Updated Workspace',
        description: 'Updated description',
      });

      expect(result?.name).toBe('Updated Workspace');
      expect(result?.description).toBe('Updated description');
    });

    it('should throw error when updating non-existent workspace', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce([]), // get workspace - not found
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.update('non-existent', { name: 'Updated' })).rejects.toThrow(
        'Workspace non-existent not found'
      );
    });

    it('should update workspace settings', async () => {
      const updatedWorkspace = {
        id: 'workspace-1',
        tenant_id: 'test-tenant-123',
        slug: 'test-workspace',
        name: 'Test Workspace',
        description: 'Test description',
        settings: { theme: 'light', privacy: 'public' },
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce([updatedWorkspace]), // update and get workspace
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.update('workspace-1', {
        settings: { theme: 'light', privacy: 'public' },
      });

      expect(result?.settings).toEqual({ theme: 'light', privacy: 'public' });
    });
  });

  describe('Membership Management', () => {
    it('should add a member to workspace', async () => {
      const mockDb = createMockDb({
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-2',
            keycloakId: 'kc-2',
            email: 'member@test.com',
            firstName: 'Member',
            lastName: 'User',
          }),
        },
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ id: 'workspace-1' }]) // workspace check
              .mockResolvedValueOnce([]) // user is not a member
              .mockResolvedValueOnce([
                {
                  workspace_id: 'workspace-1',
                  user_id: 'user-2',
                  role: WorkspaceRole.MEMBER,
                  invited_by: 'user-1',
                  joined_at: new Date(),
                  user_email: 'member@test.com',
                  user_first_name: 'Member',
                  user_last_name: 'User',
                },
              ]), // return member
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: AddMemberDto = { userId: 'user-2' };
      const result = await workspaceService.addMember('workspace-1', dto, 'user-1');

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-2');
      expect(result.role).toBe(WorkspaceRole.MEMBER);
    });

    it('should reject adding duplicate member', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ id: 'workspace-1' }]) // get workspace
              .mockResolvedValueOnce([{ user_id: 'user-2', role: WorkspaceRole.MEMBER }]), // user is already a member
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: AddMemberDto = { userId: 'user-2' };

      await expect(workspaceService.addMember('workspace-1', dto, 'user-1')).rejects.toThrow(
        'User is already a member of this workspace'
      );
    });

    it('should add member with specific role', async () => {
      const mockDb = createMockDb({
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-2',
            keycloakId: 'kc-user-2',
            email: 'admin@test.com',
            firstName: 'Admin',
            lastName: 'User',
          }),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ id: 'workspace-1', tenant_id: 'test-tenant-123' }]) // get workspace
              .mockResolvedValueOnce([]) // user is not a member
              .mockResolvedValueOnce([
                {
                  workspace_id: 'workspace-1',
                  user_id: 'user-2',
                  role: WorkspaceRole.ADMIN,
                  invited_by: 'user-1',
                  joined_at: new Date(),
                  user_email: 'admin@test.com',
                  user_first_name: 'Admin',
                  user_last_name: 'User',
                },
              ]), // return member
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: AddMemberDto = { userId: 'user-2', role: WorkspaceRole.ADMIN };
      const result = await workspaceService.addMember('workspace-1', dto, 'user-1');

      expect(result?.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should get membership information', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ user_id: 'user-1', role: WorkspaceRole.ADMIN }]), // get member
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.getMembership('workspace-1', 'user-1');

      expect(result).toBeDefined();
      expect(result?.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should return null for non-member', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi.fn().mockResolvedValueOnce([]), // get member - empty result
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.getMembership('workspace-1', 'non-member');

      expect(result).toBeNull();
    });

    it('should update member role', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([
                {
                  workspace_id: 'workspace-1',
                  user_id: 'user-2',
                  role: WorkspaceRole.MEMBER,
                  invited_by: 'user-1',
                  joined_at: new Date(),
                },
              ]) // get current member
              .mockResolvedValueOnce([
                {
                  workspace_id: 'workspace-1',
                  user_id: 'user-2',
                  role: WorkspaceRole.ADMIN,
                  invited_by: 'user-1',
                  joined_at: new Date(),
                },
              ]), // get updated member (after update)
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.updateMemberRole(
        'workspace-1',
        'user-2',
        WorkspaceRole.ADMIN
      );

      expect(result?.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should prevent removing last admin', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ count: 1 }]) // count admins - only 1
              .mockResolvedValueOnce([
                { workspace_id: 'workspace-1', user_id: 'user-1', role: WorkspaceRole.ADMIN },
              ]), // get member - is admin
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.removeMember('workspace-1', 'user-1')).rejects.toThrow(
        'Cannot remove the last admin from workspace'
      );
    });

    it('should allow removing non-admin member', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ count: 2 }]) // count admins
              .mockResolvedValueOnce([
                { workspace_id: 'workspace-1', user_id: 'user-2', role: WorkspaceRole.MEMBER },
              ]), // get member - is not admin
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.removeMember('workspace-1', 'user-2')).resolves.not.toThrow();
    });

    it('should allow removing admin when multiple admins exist', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ count: 2 }]) // count admins - multiple
              .mockResolvedValueOnce([
                { workspace_id: 'workspace-1', user_id: 'user-1', role: WorkspaceRole.ADMIN },
              ]), // get member - is admin
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.removeMember('workspace-1', 'user-1')).resolves.not.toThrow();
    });
  });

  describe('Team Management', () => {
    it('should get teams in workspace', async () => {
      const mockDb = {
        team: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 'team-1',
              name: 'Engineering',
              description: 'Engineering team',
              owner: { id: 'user-1', email: 'owner@test.com' },
              _count: { members: 3 },
            },
          ]),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.getTeams('workspace-1');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Engineering');
    });

    it('should create team in workspace', async () => {
      const mockDb = createMockDb({
        workspace: {
          findFirst: vi.fn().mockResolvedValue({ id: 'workspace-1', tenantId: 'test-tenant-123' }),
          findMany: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          updateMany: vi.fn(),
          deleteMany: vi.fn(),
          count: vi.fn(),
        },
        team: {
          create: vi.fn().mockResolvedValue({
            id: 'team-1',
            workspaceId: 'workspace-1',
            name: 'Product',
            description: 'Product team',
            ownerId: 'user-1',
            owner: { id: 'user-1', email: 'owner@test.com', firstName: 'Owner', lastName: 'User' },
          }),
          findMany: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
          count: vi.fn(),
        },
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.createTeam('workspace-1', {
        name: 'Product',
        description: 'Product team',
        ownerId: 'user-1',
      });

      expect(result?.name).toBe('Product');
      expect(result?.workspaceId).toBe('workspace-1');
    });

    it('should throw error creating team in non-existent workspace', async () => {
      const mockDb = {
        workspace: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(
        workspaceService.createTeam('non-existent', {
          name: 'Team',
          ownerId: 'user-1',
        })
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('Delete Workspace', () => {
    it('should delete workspace with no teams', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ id: 'workspace-1' }]) // verify workspace exists
              .mockResolvedValueOnce([{ count: 0 }]), // check team count - no teams
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.delete('workspace-1')).resolves.not.toThrow();
    });

    it('should prevent deleting workspace with teams', async () => {
      const mockDb = createMockDb({
        $transaction: vi.fn(async (callback: any) => {
          const mockTx = {
            $executeRaw: vi.fn().mockResolvedValue(undefined),
            $queryRaw: vi
              .fn()
              .mockResolvedValueOnce([{ id: 'workspace-1' }]) // verify workspace exists
              .mockResolvedValueOnce([{ count: 2 }]), // check team count - has teams
          };
          return await callback(mockTx);
        }),
      });

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.delete('workspace-1')).rejects.toThrow(
        'Cannot delete workspace with existing teams'
      );
    });
  });
});
