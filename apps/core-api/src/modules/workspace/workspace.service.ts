import { PrismaClient, WorkspaceRole } from '@plexica/database';
import { db } from '../../lib/db.js';
import { getTenantContext, executeInTenantSchema } from '../../middleware/tenant-context.js';
import type { CreateWorkspaceDto, UpdateWorkspaceDto, AddMemberDto } from './dto/index.js';

/**
 * Workspace Service
 *
 * Handles all workspace-related operations including:
 * - Workspace CRUD
 * - Membership management
 * - Role-based access control
 */
export class WorkspaceService {
  private db: PrismaClient;

  constructor() {
    this.db = db;
  }

  /**
   * Create a new workspace with the creator as admin
   */
  async create(dto: CreateWorkspaceDto, creatorId: string) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      // Check slug uniqueness within tenant
      const existing = await client.workspace.findFirst({
        where: {
          tenantId: tenantContext.tenantId,
          slug: dto.slug,
        },
      });

      if (existing) {
        throw new Error(`Workspace with slug '${dto.slug}' already exists in this tenant`);
      }

      // Create workspace with creator as admin
      const workspace = await client.workspace.create({
        data: {
          tenantId: tenantContext.tenantId,
          slug: dto.slug,
          name: dto.name,
          description: dto.description,
          settings: dto.settings || {},
          members: {
            create: {
              userId: creatorId,
              role: WorkspaceRole.ADMIN,
              invitedBy: creatorId,
            },
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          _count: {
            select: { members: true, teams: true },
          },
        },
      });

      // TODO: Publish event 'core.workspace.created'
      // await this.eventBus.publish({
      //   type: 'core.workspace.created',
      //   aggregateId: workspace.id,
      //   data: { workspaceId: workspace.id, slug: workspace.slug, createdBy: creatorId }
      // });

      return workspace;
    });
  }

  /**
   * Get all workspaces where user is a member
   */
  async findAll(userId: string) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      // Get all workspaces where user is a member, filtered by tenant
      const memberships = await client.workspaceMember.findMany({
        where: {
          userId,
          workspace: {
            tenantId: tenantContext.tenantId,
          },
        },
        include: {
          workspace: {
            include: {
              _count: {
                select: { members: true, teams: true },
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      });

      return memberships.map((m: any) => ({
        ...m.workspace,
        memberRole: m.role,
        joinedAt: m.joinedAt,
      }));
    });
  }

  /**
   * Get workspace by ID with full details
   */
  async findOne(id: string) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      const workspace = await client.workspace.findFirst({
        where: {
          id,
          tenantId: tenantContext.tenantId,
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
            orderBy: { joinedAt: 'asc' },
          },
          teams: {
            select: {
              id: true,
              name: true,
              description: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { members: true, teams: true },
          },
        },
      });

      if (!workspace) {
        throw new Error(
          `Workspace ${id} not found or does not belong to tenant ${tenantContext.tenantId}`
        );
      }

      return workspace;
    });
  }

  /**
   * Update workspace details (name, description, settings)
   */
  async update(id: string, dto: UpdateWorkspaceDto) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      try {
        const workspace = await client.workspace.updateMany({
          where: {
            id,
            tenantId: tenantContext.tenantId,
          },
          data: {
            name: dto.name,
            description: dto.description,
            settings: dto.settings,
          },
        });

        if (workspace.count === 0) {
          throw new Error(
            `Workspace ${id} not found or does not belong to tenant ${tenantContext.tenantId}`
          );
        }

        // Fetch updated workspace to return
        const updated = await client.workspace.findFirst({
          where: { id, tenantId: tenantContext.tenantId },
        });

        // TODO: Publish event 'core.workspace.updated'
        // await this.eventBus.publish({
        //   type: 'core.workspace.updated',
        //   aggregateId: id,
        //   data: { workspaceId: id, changes: dto }
        // });

        return updated;
      } catch (error) {
        throw new Error(
          `Failed to update workspace: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Delete workspace (only if no teams exist)
   */
  async delete(id: string): Promise<void> {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    await executeInTenantSchema(this.db, async (client) => {
      // First verify workspace belongs to tenant
      const workspace = await client.workspace.findFirst({
        where: { id, tenantId: tenantContext.tenantId },
      });

      if (!workspace) {
        throw new Error(
          `Workspace ${id} not found or does not belong to tenant ${tenantContext.tenantId}`
        );
      }

      // Check if workspace has teams
      const teamCount = await client.team.count({
        where: { workspaceId: id },
      });

      if (teamCount > 0) {
        throw new Error('Cannot delete workspace with existing teams. Move or delete teams first.');
      }

      await client.workspace.deleteMany({
        where: {
          id,
          tenantId: tenantContext.tenantId,
        },
      });

      // TODO: Publish event 'core.workspace.deleted'
      // await this.eventBus.publish({
      //   type: 'core.workspace.deleted',
      //   aggregateId: id,
      //   data: { workspaceId: id }
      // });
    });
  }

  /**
   * Get workspace membership for a user
   * Returns null if user is not a member
   */
  async getMembership(workspaceId: string, userId: string) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    // TODO: Implement Redis caching
    // const cacheKey = `workspace:${workspaceId}:member:${userId}`;
    // const cached = await this.cache.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    return executeInTenantSchema(this.db, async (client) => {
      const membership = await client.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      // TODO: Cache membership for 5 minutes
      // if (membership) {
      //   await this.cache.set(cacheKey, JSON.stringify(membership), 300);
      // }

      return membership;
    });
  }

  /**
   * Add a member to a workspace
   */
  async addMember(workspaceId: string, dto: AddMemberDto, invitedBy: string) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      // Check workspace exists and belongs to tenant
      const workspace = await client.workspace.findFirst({
        where: {
          id: workspaceId,
          tenantId: tenantContext.tenantId,
        },
      });

      if (!workspace) {
        throw new Error(
          `Workspace ${workspaceId} not found or does not belong to tenant ${tenantContext.tenantId}`
        );
      }

      // Check if user already member
      const existing = await client.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: dto.userId,
          },
        },
      });

      if (existing) {
        throw new Error('User is already a member of this workspace');
      }

      const member = await client.workspaceMember.create({
        data: {
          workspaceId,
          userId: dto.userId,
          role: dto.role || WorkspaceRole.MEMBER,
          invitedBy,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // TODO: Invalidate cache and publish event
      // await this.cache.del(`workspace:${workspaceId}:member:${dto.userId}`);
      // await this.eventBus.publish({
      //   type: 'core.workspace.member.added',
      //   aggregateId: workspaceId,
      //   data: { workspaceId, userId: dto.userId, role: member.role, invitedBy }
      // });

      return member;
    });
  }

  /**
   * Update a member's role in a workspace
   */
  async updateMemberRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      const member = await client.workspaceMember.update({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
        data: { role },
      });

      // TODO: Invalidate cache and publish event
      // await this.cache.del(`workspace:${workspaceId}:member:${userId}`);
      // await this.eventBus.publish({
      //   type: 'core.workspace.member.role_updated',
      //   aggregateId: workspaceId,
      //   data: { workspaceId, userId, newRole: role }
      // });

      return member;
    });
  }

  /**
   * Remove a member from a workspace
   * Prevents removing the last admin
   */
  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    await executeInTenantSchema(this.db, async (client) => {
      // Check if user is last admin
      const adminCount = await client.workspaceMember.count({
        where: {
          workspaceId,
          role: WorkspaceRole.ADMIN,
        },
      });

      const member = await client.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      if (member?.role === WorkspaceRole.ADMIN && adminCount === 1) {
        throw new Error('Cannot remove the last admin from workspace');
      }

      await client.workspaceMember.delete({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      // TODO: Invalidate cache and publish event
      // await this.cache.del(`workspace:${workspaceId}:member:${userId}`);
      // await this.eventBus.publish({
      //   type: 'core.workspace.member.removed',
      //   aggregateId: workspaceId,
      //   data: { workspaceId, userId }
      // });
    });
  }

  /**
   * Get all teams in a workspace
   */
  async getTeams(workspaceId: string) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      return client.team.findMany({
        where: { workspaceId },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              members: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Create a new team in a workspace
   */
  async createTeam(
    workspaceId: string,
    data: {
      name: string;
      description?: string;
      ownerId: string;
    }
  ) {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    return executeInTenantSchema(this.db, async (client) => {
      // Verify workspace exists and belongs to tenant
      const workspace = await client.workspace.findFirst({
        where: {
          id: workspaceId,
          tenantId: tenantContext.tenantId,
        },
      });

      if (!workspace) {
        throw new Error(
          `Workspace not found or does not belong to tenant ${tenantContext.tenantId}`
        );
      }

      // Create the team
      const team = await client.team.create({
        data: {
          workspaceId,
          name: data.name,
          description: data.description,
          ownerId: data.ownerId,
        },
        include: {
          owner: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // TODO: Publish event
      // await this.eventBus.publish({
      //   type: 'core.workspace.team.created',
      //   aggregateId: workspaceId,
      //   data: { workspaceId, teamId: team.id, name: data.name }
      // });

      return team;
    });
  }
}

// Export singleton instance
export const workspaceService = new WorkspaceService();
