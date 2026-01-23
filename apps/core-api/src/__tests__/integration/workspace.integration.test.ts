import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkspaceRole } from '@plexica/database';
import { WorkspaceService } from '../../modules/workspace/workspace.service.js';
import type { CreateWorkspaceDto, AddMemberDto } from '../../modules/workspace/dto/index.js';

// Mock tenant context and workspace operations
vi.mock('../../middleware/tenant-context.js', () => ({
  getTenantContext: vi.fn(() => ({
    tenantId: 'test-tenant-123',
    tenantSlug: 'test-tenant',
    schema: 'tenant_test_tenant_123',
  })),
  executeInTenantSchema: vi.fn((db, callback) => callback(db)),
}));

describe('Workspace Integration Tests', () => {
  let workspaceService: WorkspaceService;

  beforeEach(() => {
    workspaceService = new WorkspaceService();
  });

  describe('Create Workspace', () => {
    it('should create a workspace with the creator as admin', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        slug: 'test-workspace',
        name: 'Test Workspace',
        description: 'Test workspace description',
        settings: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [
          {
            userId: 'user-1',
            role: WorkspaceRole.ADMIN,
            joinedAt: new Date(),
            invitedBy: 'user-1',
            user: {
              id: 'user-1',
              email: 'admin@test.com',
              firstName: 'Admin',
              lastName: 'User',
            },
          },
        ],
        _count: { members: 1, teams: 0 },
      };

      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockWorkspace),
        },
      };

      // Mock the private db property
      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: CreateWorkspaceDto = {
        name: 'Test Workspace',
        slug: 'test-workspace',
        description: 'Test workspace description',
      };

      const result = await workspaceService.create(dto, 'user-1');

      expect(result).toBeDefined();
      expect(result.slug).toBe('test-workspace');
      expect(result.name).toBe('Test Workspace');
      expect(mockDb.workspace.create).toHaveBeenCalled();
    });

    it('should reject duplicate workspace slug within tenant', async () => {
      const mockExisting = {
        id: 'existing-1',
        slug: 'test-workspace',
        name: 'Existing',
      };

      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue(mockExisting),
        },
      };

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
      const mockWorkspace = {
        id: 'workspace-1',
        slug: 'test-workspace',
        name: 'Test Workspace',
        settings: { theme: 'dark', notifications: true },
        members: [],
        _count: { members: 1, teams: 0 },
      };

      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(mockWorkspace),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: CreateWorkspaceDto = {
        name: 'Test Workspace',
        slug: 'test-workspace',
        settings: { theme: 'dark', notifications: true },
      };

      const result = await workspaceService.create(dto, 'user-1');
      expect(result.settings).toEqual({ theme: 'dark', notifications: true });
    });
  });

  describe('Retrieve Workspaces', () => {
    it('should get all workspaces for a user', async () => {
      const mockWorkspaces = [
        {
          workspace: {
            id: 'workspace-1',
            slug: 'test-workspace',
            name: 'Test Workspace',
          },
          role: WorkspaceRole.ADMIN,
          joinedAt: new Date(),
        },
        {
          workspace: {
            id: 'workspace-2',
            slug: 'second-workspace',
            name: 'Second Workspace',
          },
          role: WorkspaceRole.MEMBER,
          joinedAt: new Date(),
        },
      ];

      const mockDb = {
        workspaceMember: {
          findMany: vi.fn().mockResolvedValue(mockWorkspaces),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.findAll('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe('test-workspace');
      expect(result[0].memberRole).toBe(WorkspaceRole.ADMIN);
    });

    it('should return empty array when user has no workspaces', async () => {
      const mockDb = {
        workspaceMember: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.findAll('user-no-workspaces');

      expect(result).toEqual([]);
    });

    it('should get workspace by ID with members and teams', async () => {
      const mockWorkspace = {
        id: 'workspace-1',
        slug: 'test-workspace',
        name: 'Test Workspace',
        members: [
          {
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
            createdAt: new Date(),
          },
        ],
      };

      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue(mockWorkspace),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.findOne('workspace-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('workspace-1');
      expect(result.members).toHaveLength(1);
      expect(result.teams).toHaveLength(1);
    });

    it('should throw error when workspace not found', async () => {
      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.findOne('non-existent')).rejects.toThrow(
        'Workspace non-existent not found'
      );
    });
  });

  describe('Update Workspace', () => {
    it('should update workspace details', async () => {
      const mockDb = {
        workspace: {
          update: vi.fn().mockResolvedValue({
            id: 'workspace-1',
            name: 'Updated Workspace',
            description: 'Updated description',
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.update('workspace-1', {
        name: 'Updated Workspace',
        description: 'Updated description',
      });

      expect(result.name).toBe('Updated Workspace');
      expect(result.description).toBe('Updated description');
    });

    it('should throw error when updating non-existent workspace', async () => {
      const mockDb = {
        workspace: {
          update: vi.fn().mockRejectedValue(new Error('Not found')),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.update('non-existent', { name: 'Updated' })).rejects.toThrow(
        'Workspace non-existent not found'
      );
    });

    it('should update workspace settings', async () => {
      const mockDb = {
        workspace: {
          update: vi.fn().mockResolvedValue({
            id: 'workspace-1',
            settings: { theme: 'light', privacy: 'public' },
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.update('workspace-1', {
        settings: { theme: 'light', privacy: 'public' },
      });

      expect(result.settings).toEqual({ theme: 'light', privacy: 'public' });
    });
  });

  describe('Membership Management', () => {
    it('should add a member to workspace', async () => {
      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'workspace-1',
            slug: 'test-workspace',
          }),
        },
        workspaceMember: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            userId: 'user-2',
            role: WorkspaceRole.MEMBER,
            user: {
              id: 'user-2',
              email: 'member@test.com',
              firstName: 'Member',
              lastName: 'User',
            },
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: AddMemberDto = { userId: 'user-2' };
      const result = await workspaceService.addMember('workspace-1', dto, 'user-1');

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-2');
      expect(result.role).toBe(WorkspaceRole.MEMBER);
    });

    it('should reject adding duplicate member', async () => {
      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({ id: 'workspace-1' }),
        },
        workspaceMember: {
          findUnique: vi.fn().mockResolvedValue({
            userId: 'user-2',
            role: WorkspaceRole.MEMBER,
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: AddMemberDto = { userId: 'user-2' };

      await expect(workspaceService.addMember('workspace-1', dto, 'user-1')).rejects.toThrow(
        'User is already a member of this workspace'
      );
    });

    it('should add member with specific role', async () => {
      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({ id: 'workspace-1' }),
        },
        workspaceMember: {
          findUnique: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            userId: 'user-2',
            role: WorkspaceRole.ADMIN,
            user: { id: 'user-2', email: 'admin@test.com' },
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const dto: AddMemberDto = { userId: 'user-2', role: WorkspaceRole.ADMIN };
      const result = await workspaceService.addMember('workspace-1', dto, 'user-1');

      expect(result.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should get membership information', async () => {
      const mockDb = {
        workspaceMember: {
          findUnique: vi.fn().mockResolvedValue({
            userId: 'user-1',
            role: WorkspaceRole.ADMIN,
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.getMembership('workspace-1', 'user-1');

      expect(result).toBeDefined();
      expect(result.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should return null for non-member', async () => {
      const mockDb = {
        workspaceMember: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.getMembership('workspace-1', 'non-member');

      expect(result).toBeNull();
    });

    it('should update member role', async () => {
      const mockDb = {
        workspaceMember: {
          update: vi.fn().mockResolvedValue({
            userId: 'user-2',
            role: WorkspaceRole.ADMIN,
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.updateMemberRole(
        'workspace-1',
        'user-2',
        WorkspaceRole.ADMIN
      );

      expect(result.role).toBe(WorkspaceRole.ADMIN);
    });

    it('should prevent removing last admin', async () => {
      const mockDb = {
        workspaceMember: {
          count: vi.fn().mockResolvedValue(1),
          findUnique: vi.fn().mockResolvedValue({
            role: WorkspaceRole.ADMIN,
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.removeMember('workspace-1', 'user-1')).rejects.toThrow(
        'Cannot remove the last admin from workspace'
      );
    });

    it('should allow removing non-admin member', async () => {
      const mockDb = {
        workspaceMember: {
          count: vi.fn().mockResolvedValue(2),
          findUnique: vi.fn().mockResolvedValue({
            role: WorkspaceRole.MEMBER,
          }),
          delete: vi.fn().mockResolvedValue({}),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.removeMember('workspace-1', 'user-2')).resolves.not.toThrow();
      expect(mockDb.workspaceMember.delete).toHaveBeenCalled();
    });

    it('should allow removing admin when multiple admins exist', async () => {
      const mockDb = {
        workspaceMember: {
          count: vi.fn().mockResolvedValue(2),
          findUnique: vi.fn().mockResolvedValue({
            role: WorkspaceRole.ADMIN,
          }),
          delete: vi.fn().mockResolvedValue({}),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.removeMember('workspace-1', 'user-1')).resolves.not.toThrow();
      expect(mockDb.workspaceMember.delete).toHaveBeenCalled();
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
      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue({ id: 'workspace-1' }),
        },
        team: {
          create: vi.fn().mockResolvedValue({
            id: 'team-2',
            name: 'Product',
            workspaceId: 'workspace-1',
            owner: { id: 'user-1', email: 'owner@test.com' },
          }),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      const result = await workspaceService.createTeam('workspace-1', {
        name: 'Product',
        description: 'Product team',
        ownerId: 'user-1',
      });

      expect(result.name).toBe('Product');
      expect(result.workspaceId).toBe('workspace-1');
    });

    it('should throw error creating team in non-existent workspace', async () => {
      const mockDb = {
        workspace: {
          findUnique: vi.fn().mockResolvedValue(null),
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
      const mockDb = {
        team: {
          count: vi.fn().mockResolvedValue(0),
        },
        workspace: {
          delete: vi.fn().mockResolvedValue({}),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.delete('workspace-1')).resolves.not.toThrow();
      expect(mockDb.workspace.delete).toHaveBeenCalled();
    });

    it('should prevent deleting workspace with teams', async () => {
      const mockDb = {
        team: {
          count: vi.fn().mockResolvedValue(2),
        },
      };

      vi.spyOn(workspaceService as any, 'db', 'get').mockReturnValue(mockDb);

      await expect(workspaceService.delete('workspace-1')).rejects.toThrow(
        'Cannot delete workspace with existing teams'
      );
    });
  });
});
