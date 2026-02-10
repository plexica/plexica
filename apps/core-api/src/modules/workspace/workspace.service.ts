import { PrismaClient, WorkspaceRole, Prisma } from '@plexica/database';
import { db } from '../../lib/db.js';
import { getTenantContext, type TenantContext } from '../../middleware/tenant-context.js';
import type { CreateWorkspaceDto, UpdateWorkspaceDto, AddMemberDto } from './dto/index.js';

/**
 * Row types for raw SQL query results.
 * These match the column names returned by the SELECT statements below.
 */

/** Basic workspace columns */
interface WorkspaceRow {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  settings: unknown;
  created_at: Date;
  updated_at: Date;
}

/** Workspace with JSON-aggregated members/teams and counts (used by create/findOne) */
interface WorkspaceDetailRow extends WorkspaceRow {
  members: unknown[] | null;
  teams?: unknown[] | null;
  member_count: number;
  team_count: number;
}

/** Workspace list row with the requesting user's membership info */
interface WorkspaceListRow extends WorkspaceRow {
  member_role: string;
  joined_at: Date;
  member_count: string | number;
  team_count: string | number;
}

/** Row with only an id column */
interface IdRow {
  id: string;
}

/** Row with only a count column */
interface CountRow {
  count: number;
}

/** Workspace member row (raw column names) */
interface MembershipRow {
  workspace_id: string;
  user_id: string;
  role: string;
  invited_by: string;
  joined_at: Date;
}

/** Member row with joined user profile columns */
interface MemberWithUserRow extends MembershipRow {
  user_email: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
}

/** Team row with owner profile and member count */
interface TeamRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
  owner_user_id: string | null;
  owner_email: string | null;
  owner_first_name: string | null;
  owner_last_name: string | null;
  member_count?: number;
}

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
  async create(dto: CreateWorkspaceDto, creatorId: string, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();

    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    // Use raw SQL for better compatibility with dynamic tenant schemas
    const schemaName = tenantContext.schemaName;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    // Check slug uniqueness (using parameterized query to prevent SQL injection)
    const existing = await this.db.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM ${Prisma.raw(`"${schemaName}"."workspaces"`)}
       WHERE tenant_id = ${tenantContext.tenantId} AND slug = ${dto.slug}
       LIMIT 1`
    );

    if (existing.length > 0) {
      throw new Error(`Workspace with slug '${dto.slug}' already exists in this tenant`);
    }

    // Use a transaction to ensure workspace and member are created together
    return await this.db.$transaction(async (tx) => {
      // Set search path for this transaction to use the tenant schema
      // Note: schemaName is validated with regex above, so this is safe
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      // Generate workspace ID
      const workspaceIdResult = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT gen_random_uuid()::text as id
      `;
      const newWorkspaceId = workspaceIdResult[0].id;

      // Create workspace using parameterized values
      const tableName = Prisma.raw(`"${schemaName}"."workspaces"`);
      await tx.$executeRaw`
         INSERT INTO ${tableName}
         (id, tenant_id, slug, name, description, settings, created_at, updated_at)
         VALUES (
           ${newWorkspaceId},
           ${tenantContext.tenantId},
           ${dto.slug},
           ${dto.name},
           ${dto.description},
           ${dto.settings || {}},
           NOW(),
           NOW()
         )
       `;

      // Create workspace member (creator as admin)
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      await tx.$executeRaw`
        INSERT INTO ${membersTable}
        (workspace_id, user_id, role, invited_by, joined_at)
        VALUES (
          ${newWorkspaceId},
          ${creatorId},
          ${WorkspaceRole.ADMIN},
          ${creatorId},
          NOW()
        )
      `;

      // Fetch the complete workspace with relations
      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const workspace = await tx.$queryRaw<WorkspaceDetailRow[]>`
        SELECT 
          w.*,
          json_agg(
            json_build_object(
              'workspaceId', wm.workspace_id,
              'userId', wm.user_id,
              'role', wm.role,
              'invitedBy', wm.invited_by,
              'joinedAt', wm.joined_at,
              'user', json_build_object(
                'id', u.id,
                'email', u.email,
                'firstName', u.first_name,
                'lastName', u.last_name
              )
            )
          ) as members,
          (SELECT COUNT(*) FROM ${membersTable} WHERE workspace_id = w.id)::int as member_count,
          (SELECT COUNT(*) FROM ${Prisma.raw(`"${schemaName}"."teams"`)} WHERE workspace_id = w.id)::int as team_count
         FROM ${workspacesTable} w
         LEFT JOIN ${membersTable} wm ON w.id = wm.workspace_id
         LEFT JOIN ${Prisma.raw(`"${schemaName}"."users"`)} u ON wm.user_id = u.id
         WHERE w.id = ${newWorkspaceId}
         GROUP BY w.id
       `;

      if (workspace.length === 0) {
        throw new Error('Failed to fetch created workspace');
      }

      const result = workspace[0];

      // Format the response to match the expected structure
      return {
        id: result.id,
        tenantId: result.tenant_id,
        slug: result.slug,
        name: result.name,
        description: result.description,
        settings:
          typeof result.settings === 'string' ? JSON.parse(result.settings) : result.settings,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
        members: result.members || [],
        _count: {
          members: result.member_count,
          teams: result.team_count,
        },
      };
    });
  }

  /**
   * Get all workspaces where user is a member
   */
  async findAll(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      sortBy?: 'name' | 'createdAt' | 'joinedAt';
      sortOrder?: 'asc' | 'desc';
    },
    tenantCtx?: TenantContext
  ) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    // Defaults
    const limit = Math.min(options?.limit || 50, 100); // Max 100 items per page
    const offset = Math.max(options?.offset || 0, 0);
    const sortBy = options?.sortBy || 'joinedAt';
    const sortOrder = (options?.sortOrder || 'desc').toUpperCase();

    // Validate sort options
    const validSortFields = ['name', 'createdAt', 'joinedAt'];
    if (!validSortFields.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}`);
    }
    if (!['ASC', 'DESC'].includes(sortOrder)) {
      throw new Error(`Invalid sort order: ${sortOrder}`);
    }

    // Map field names to SQL column names
    const sortFieldMap: Record<string, string> = {
      name: 'w.name',
      createdAt: 'w.created_at',
      joinedAt: 'wm.joined_at',
    };
    const sortColumn = sortFieldMap[sortBy];

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      // Get all workspaces where user is a member (using parameterized query)
      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      const teamsTable = Prisma.raw(`"${schemaName}"."teams"`);

      // Build ORDER BY with literal string (sortColumn is pre-validated)
      const orderByClause = `${sortColumn} ${sortOrder}`;

      // Explicitly select columns to ensure proper mapping
      const result = await tx.$queryRaw<WorkspaceListRow[]>`
        SELECT 
          w.id,
          w.tenant_id,
          w.slug,
          w.name,
          w.description,
          w.settings,
          w.created_at,
          w.updated_at,
          wm.role as member_role,
          wm.joined_at,
          (SELECT COUNT(*) FROM ${membersTable} WHERE workspace_id = w.id) as member_count,
          (SELECT COUNT(*) FROM ${teamsTable} WHERE workspace_id = w.id) as team_count
        FROM ${workspacesTable} w
        INNER JOIN ${membersTable} wm ON w.id = wm.workspace_id
        WHERE wm.user_id = ${userId}
          AND w.tenant_id = ${tenantId}
        ORDER BY ${Prisma.raw(orderByClause)}
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      return result.map((row: WorkspaceListRow) => ({
        id: row.id,
        tenantId: row.tenant_id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        settings: row.settings,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        memberRole: row.member_role,
        joinedAt: row.joined_at,
        _count: {
          members: Number(row.member_count),
          teams: Number(row.team_count),
        },
      }));
    });
  }

  /**
   * Get workspace by ID with full details
   */
  async findOne(id: string, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    // Validate schema name and inputs
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      // Get workspace with members and teams (using parameterized query)
      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      const usersTable = Prisma.raw(`"${schemaName}"."users"`);
      const teamsTable = Prisma.raw(`"${schemaName}"."teams"`);

      const workspaces = await tx.$queryRaw<WorkspaceDetailRow[]>`
        SELECT 
          w.*,
          json_agg(
            DISTINCT jsonb_build_object(
              'workspaceId', wm.workspace_id,
              'userId', wm.user_id,
              'role', wm.role,
              'joinedAt', wm.joined_at,
              'user', jsonb_build_object(
                'id', u.id,
                'email', u.email,
                'firstName', u.first_name,
                'lastName', u.last_name
              )
            )
          ) FILTER (WHERE wm.workspace_id IS NOT NULL) as members,
          json_agg(
            DISTINCT jsonb_build_object(
              'id', t.id,
              'name', t.name,
              'description', t.description,
              'createdAt', t.created_at
            )
          ) FILTER (WHERE t.id IS NOT NULL) as teams,
          COUNT(DISTINCT wm.user_id) as member_count,
          COUNT(DISTINCT t.id) as team_count
        FROM ${workspacesTable} w
        LEFT JOIN ${membersTable} wm ON w.id = wm.workspace_id
        LEFT JOIN ${usersTable} u ON wm.user_id = u.id
        LEFT JOIN ${teamsTable} t ON w.id = t.workspace_id
        WHERE w.id = ${id}
          AND w.tenant_id = ${tenantId}
        GROUP BY w.id
      `;

      if (!workspaces || workspaces.length === 0) {
        throw new Error(`Workspace ${id} not found or does not belong to tenant ${tenantId}`);
      }

      const workspace = workspaces[0];
      return {
        id: workspace.id,
        tenantId: workspace.tenant_id,
        slug: workspace.slug,
        name: workspace.name,
        description: workspace.description,
        settings: workspace.settings,
        createdAt: workspace.created_at,
        updatedAt: workspace.updated_at,
        members: workspace.members || [],
        teams: workspace.teams || [],
        _count: {
          members: Number(workspace.member_count),
          teams: Number(workspace.team_count),
        },
      };
    });
  }

  /**
   * Update workspace details (name, description, settings)
   */
  async update(id: string, dto: UpdateWorkspaceDto, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      try {
        const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);

        // Build UPDATE statement with parameterized values
        // We need to use conditional logic to handle optional fields
        let updateCount: number;

        if (dto.name !== undefined && dto.description !== undefined && dto.settings !== undefined) {
          updateCount = await tx.$executeRaw`
             UPDATE ${workspacesTable}
             SET name = ${dto.name},
                 description = ${dto.description},
                 settings = ${dto.settings},
                 updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}
           `;
        } else if (dto.name !== undefined && dto.description !== undefined) {
          updateCount = await tx.$executeRaw`
            UPDATE ${workspacesTable}
            SET name = ${dto.name},
                description = ${dto.description},
                updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}
          `;
        } else if (dto.name !== undefined && dto.settings !== undefined) {
          updateCount = await tx.$executeRaw`
             UPDATE ${workspacesTable}
             SET name = ${dto.name},
                 settings = ${dto.settings},
                 updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}
           `;
        } else if (dto.description !== undefined && dto.settings !== undefined) {
          updateCount = await tx.$executeRaw`
             UPDATE ${workspacesTable}
             SET description = ${dto.description},
                 settings = ${dto.settings},
                 updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}
           `;
        } else if (dto.name !== undefined) {
          updateCount = await tx.$executeRaw`
            UPDATE ${workspacesTable}
            SET name = ${dto.name}, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}
          `;
        } else if (dto.description !== undefined) {
          updateCount = await tx.$executeRaw`
            UPDATE ${workspacesTable}
            SET description = ${dto.description}, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}
          `;
        } else if (dto.settings !== undefined) {
          updateCount = await tx.$executeRaw`
             UPDATE ${workspacesTable}
             SET settings = ${dto.settings}, updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}
           `;
        } else {
          // No fields to update, just update the timestamp
          updateCount = await tx.$executeRaw`
            UPDATE ${workspacesTable}
            SET updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}
          `;
        }

        if (updateCount === 0) {
          throw new Error(`Workspace ${id} not found or does not belong to tenant ${tenantId}`);
        }

        // Fetch updated workspace
        const workspaces = await tx.$queryRaw<WorkspaceRow[]>`
          SELECT * FROM ${workspacesTable}
          WHERE id = ${id} AND tenant_id = ${tenantId}
        `;

        if (!workspaces || workspaces.length === 0) {
          throw new Error(`Workspace ${id} not found after update`);
        }

        // TODO: Publish event 'core.workspace.updated'
        // await this.eventBus.publish({
        //   type: 'core.workspace.updated',
        //   aggregateId: id,
        //   data: { workspaceId: id, changes: dto }
        // });

        const workspace = workspaces[0];
        const result = {
          id: workspace.id,
          tenantId: workspace.tenant_id,
          slug: workspace.slug,
          name: workspace.name,
          description: workspace.description,
          settings: workspace.settings,
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
        };
        return result;
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
  async delete(id: string, tenantCtx?: TenantContext): Promise<void> {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const teamsTable = Prisma.raw(`"${schemaName}"."teams"`);

      // First verify workspace belongs to tenant
      const workspaces = await tx.$queryRaw<IdRow[]>`
        SELECT id FROM ${workspacesTable}
        WHERE id = ${id} AND tenant_id = ${tenantId}
      `;

      if (!workspaces || workspaces.length === 0) {
        throw new Error(`Workspace ${id} not found or does not belong to tenant ${tenantId}`);
      }

      // Check if workspace has teams
      const teamCounts = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*) as count FROM ${teamsTable}
        WHERE workspace_id = ${id}
      `;

      const teamCount = Number(teamCounts[0]?.count || 0);
      if (teamCount > 0) {
        throw new Error('Cannot delete workspace with existing teams. Move or delete teams first.');
      }

      // Delete workspace (cascade will handle members)
      await tx.$executeRaw`
        DELETE FROM ${workspacesTable}
        WHERE id = ${id} AND tenant_id = ${tenantId}
      `;

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
  async getMembership(workspaceId: string, userId: string, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    // TODO: Implement Redis caching
    // const cacheKey = `workspace:${workspaceId}:member:${userId}`;
    // const cached = await this.cache.get(cacheKey);
    // if (cached) {
    //   return JSON.parse(cached);
    // }

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      const memberships = await tx.$queryRaw<MembershipRow[]>`
        SELECT * FROM ${membersTable}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;

      if (!memberships || memberships.length === 0) {
        return null;
      }

      const membership = memberships[0];
      const result = {
        workspaceId: membership.workspace_id,
        userId: membership.user_id,
        role: membership.role,
        invitedBy: membership.invited_by,
        joinedAt: membership.joined_at,
      };

      // TODO: Cache membership for 5 minutes
      // if (result) {
      //   await this.cache.set(cacheKey, JSON.stringify(result), 300);
      // }

      return result;
    });
  }

  /**
   * Check workspace exists in tenant and get user membership in a single transaction.
   * Used by workspace guard to avoid two separate transactions per request.
   * Returns { exists: true, membership } or { exists: false, membership: null }.
   */
  async checkAccessAndGetMembership(
    workspaceId: string,
    userId: string,
    tenantCtx?: TenantContext
  ): Promise<{
    exists: boolean;
    membership: {
      workspaceId: string;
      userId: string;
      role: string;
      invitedBy: string;
      joinedAt: Date;
    } | null;
  }> {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);

      // Check workspace exists and get membership in one query via LEFT JOIN
      const results = await tx.$queryRaw<MembershipRow[]>`
        SELECT 
          w.id as workspace_id,
          wm.user_id,
          wm.role,
          wm.invited_by,
          wm.joined_at
        FROM ${workspacesTable} w
        LEFT JOIN ${membersTable} wm 
          ON w.id = wm.workspace_id AND wm.user_id = ${userId}
        WHERE w.id = ${workspaceId} AND w.tenant_id = ${tenantId}
      `;

      if (!results || results.length === 0) {
        return { exists: false, membership: null };
      }

      const row = results[0];
      if (!row.user_id) {
        // Workspace exists but user is not a member
        return { exists: true, membership: null };
      }

      return {
        exists: true,
        membership: {
          workspaceId: row.workspace_id,
          userId: row.user_id,
          role: row.role,
          invitedBy: row.invited_by,
          joinedAt: row.joined_at,
        },
      };
    });
  }

  /**
   * Add a member to a workspace
   */
  async addMember(
    workspaceId: string,
    dto: AddMemberDto,
    invitedBy: string,
    tenantCtx?: TenantContext
  ) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    // Pre-fetch core user BEFORE opening the transaction to avoid holding
    // a second connection from the pool inside the transaction (connection leak)
    const coreUser = await this.db.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        keycloakId: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!coreUser) {
      throw new Error(`User ${dto.userId} not found`);
    }

    const role = dto.role || WorkspaceRole.MEMBER;

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      const usersTable = Prisma.raw(`"${schemaName}"."users"`);

      // Check workspace exists and belongs to tenant
      const workspaceCheck = await tx.$queryRaw<IdRow[]>`
        SELECT id FROM ${workspacesTable}
        WHERE id = ${workspaceId} AND tenant_id = ${tenantId}
      `;

      if (!workspaceCheck || workspaceCheck.length === 0) {
        throw new Error(
          `Workspace ${workspaceId} not found or does not belong to tenant ${tenantId}`
        );
      }

      // Check if user already member
      const existingCheck = await tx.$queryRaw<IdRow[]>`
        SELECT workspace_id FROM ${membersTable}
        WHERE workspace_id = ${workspaceId} AND user_id = ${dto.userId}
      `;

      if (existingCheck && existingCheck.length > 0) {
        throw new Error('User is already a member of this workspace');
      }

      // Sync user to tenant schema with parameterized values
      await tx.$executeRaw`
        INSERT INTO ${usersTable}
        (id, keycloak_id, email, first_name, last_name, created_at, updated_at)
        VALUES (
          ${coreUser.id},
          ${coreUser.keycloakId || ''},
          ${coreUser.email},
          ${coreUser.firstName || ''},
          ${coreUser.lastName || ''},
          NOW(),
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          updated_at = NOW()
      `;

      // Now insert the workspace member
      await tx.$executeRaw`
        INSERT INTO ${membersTable}
        (workspace_id, user_id, role, invited_by, joined_at)
        VALUES (
          ${workspaceId},
          ${dto.userId},
          ${role},
          ${invitedBy},
          NOW()
        )
      `;

      // Get the created member with user info
      const members = await tx.$queryRaw<MemberWithUserRow[]>`
        SELECT 
          wm.workspace_id,
          wm.user_id,
          wm.role,
          wm.invited_by,
          wm.joined_at,
          u.email as user_email,
          u.first_name as user_first_name,
          u.last_name as user_last_name
        FROM ${membersTable} wm
        LEFT JOIN ${usersTable} u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${workspaceId} AND wm.user_id = ${dto.userId}
      `;

      if (!members || members.length === 0) {
        throw new Error('Failed to create workspace member');
      }

      const member = members[0];

      // TODO: Invalidate cache and publish event
      // await this.cache.del(`workspace:${workspaceId}:member:${dto.userId}`);
      // await this.eventBus.publish({
      //   type: 'core.workspace.member.added',
      //   aggregateId: workspaceId,
      //   data: { workspaceId, userId: dto.userId, role: member.role, invitedBy }
      // });

      return {
        workspaceId: member.workspace_id,
        userId: member.user_id,
        role: member.role,
        invitedBy: member.invited_by,
        joinedAt: member.joined_at,
        user: {
          id: member.user_id,
          email: member.user_email,
          firstName: member.user_first_name,
          lastName: member.user_last_name,
        },
      };
    });
  }

  /**
   * Update a member's role in a workspace
   */
  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    tenantCtx?: TenantContext
  ) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);

      // Get the current member to check their current role
      const currentMembers = await tx.$queryRaw<MembershipRow[]>`
        SELECT * FROM ${membersTable}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;

      if (!currentMembers || currentMembers.length === 0) {
        throw new Error('Member not found');
      }

      const currentMember = currentMembers[0];

      // Check if demoting the last admin
      if (currentMember.role === 'ADMIN' && role !== 'ADMIN') {
        const adminCountResult = await tx.$queryRaw<CountRow[]>`
          SELECT COUNT(*)::int as count
          FROM ${membersTable}
          WHERE workspace_id = ${workspaceId} AND role = 'ADMIN'
        `;

        const adminCount = adminCountResult[0]?.count || 0;

        if (adminCount === 1) {
          throw new Error('Cannot demote the last admin. Workspace must have at least one admin.');
        }
      }

      // Update the member role
      await tx.$executeRaw`
        UPDATE ${membersTable}
        SET role = ${role}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;

      // Get the updated member
      const members = await tx.$queryRaw<MembershipRow[]>`
        SELECT * FROM ${membersTable}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;

      if (!members || members.length === 0) {
        throw new Error('Member not found');
      }

      const member = members[0];

      // TODO: Invalidate cache and publish event
      // await this.cache.del(`workspace:${workspaceId}:member:${userId}`);
      // await this.eventBus.publish({
      //   type: 'core.workspace.member.role_updated',
      //   aggregateId: workspaceId,
      //   data: { workspaceId, userId, newRole: role }
      // });

      return {
        workspaceId: member.workspace_id,
        userId: member.user_id,
        role: member.role,
        invitedBy: member.invited_by,
        joinedAt: member.joined_at,
      };
    });
  }

  /**
   * Remove a member from a workspace
   * Prevents removing the last admin
   */
  async removeMember(
    workspaceId: string,
    userId: string,
    tenantCtx?: TenantContext
  ): Promise<void> {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);

      // Check if user is last admin
      const adminCountResult = await tx.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::int as count
        FROM ${membersTable}
        WHERE workspace_id = ${workspaceId} AND role = 'ADMIN'
      `;

      const adminCount = adminCountResult[0]?.count || 0;

      // Get the member to check their role
      const members = await tx.$queryRaw<MembershipRow[]>`
        SELECT * FROM ${membersTable}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;

      if (!members || members.length === 0) {
        throw new Error('Member not found');
      }

      const member = members[0];

      if (member.role === 'ADMIN' && adminCount === 1) {
        throw new Error('Cannot remove the last admin from workspace');
      }

      // First, delete team memberships for this user in teams within this workspace
      const teamsTable = Prisma.raw(`"${schemaName}"."teams"`);
      const teamMembersTable = Prisma.raw(`"${schemaName}"."TeamMember"`);

      await tx.$executeRaw`
         DELETE FROM ${teamMembersTable}
         WHERE "teamId" IN (
           SELECT id FROM ${teamsTable}
           WHERE workspace_id = ${workspaceId}
         )
         AND "user_id" = ${userId}
       `;

      // Delete the member
      await tx.$executeRaw`
         DELETE FROM ${membersTable}
         WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
       `;

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
   * Get a single member with their user profile
   */
  async getMemberWithUser(workspaceId: string, userId: string, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      const usersTable = Prisma.raw(`"${schemaName}"."users"`);

      // Check workspace exists and belongs to tenant
      const workspaceCheck = await tx.$queryRaw<IdRow[]>`
        SELECT id FROM ${workspacesTable}
        WHERE id = ${workspaceId} AND tenant_id = ${tenantId}
      `;

      if (!workspaceCheck || workspaceCheck.length === 0) {
        throw new Error(
          `Workspace ${workspaceId} not found or does not belong to tenant ${tenantId}`
        );
      }

      // Get the member with user info
      const members = await tx.$queryRaw<MemberWithUserRow[]>`
        SELECT 
          wm.workspace_id,
          wm.user_id,
          wm.role,
          wm.invited_by,
          wm.joined_at,
          u.id as user_id,
          u.email as user_email,
          u.first_name as user_first_name,
          u.last_name as user_last_name
        FROM ${membersTable} wm
        LEFT JOIN ${usersTable} u ON u.id = wm.user_id
        WHERE wm.workspace_id = ${workspaceId} AND wm.user_id = ${userId}
      `;

      if (!members || members.length === 0) {
        throw new Error('Member not found');
      }

      const member = members[0];

      return {
        workspaceId: member.workspace_id,
        userId: member.user_id,
        role: member.role,
        invitedBy: member.invited_by,
        joinedAt: member.joined_at,
        user: {
          id: member.user_id,
          email: member.user_email,
          firstName: member.user_first_name,
          lastName: member.user_last_name,
        },
      };
    });
  }

  /**
   * Get workspace members with filtering and pagination
   */
  async getMembers(
    workspaceId: string,
    options?: {
      role?: string;
      limit?: number;
      offset?: number;
    },
    tenantCtx?: TenantContext
  ) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    // Validate schema name
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    // Defaults
    const limit = Math.min(options?.limit || 50, 100);
    const offset = Math.max(options?.offset || 0, 0);
    const role = options?.role?.toUpperCase();

    // Validate role if provided
    if (role && !['ADMIN', 'MEMBER', 'VIEWER'].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }

    return await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      const usersTable = Prisma.raw(`"${schemaName}"."users"`);

      // Check workspace exists
      const workspaceCheck = await tx.$queryRaw<IdRow[]>`
        SELECT id FROM ${workspacesTable}
        WHERE id = ${workspaceId} AND tenant_id = ${tenantId}
      `;

      if (!workspaceCheck || workspaceCheck.length === 0) {
        throw new Error(
          `Workspace ${workspaceId} not found or does not belong to tenant ${tenantId}`
        );
      }

      // Get members with user info (with optional role filter)
      let members: MemberWithUserRow[];
      if (role) {
        members = await tx.$queryRaw<MemberWithUserRow[]>`
          SELECT 
            wm.workspace_id,
            wm.user_id,
            wm.role,
            wm.invited_by,
            wm.joined_at,
            u.id as user_id,
            u.email as user_email,
            u.first_name as user_first_name,
            u.last_name as user_last_name
          FROM ${membersTable} wm
          LEFT JOIN ${usersTable} u ON u.id = wm.user_id
          WHERE wm.workspace_id = ${workspaceId} AND wm.role = ${role}
          ORDER BY wm.joined_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
      } else {
        members = await tx.$queryRaw<MemberWithUserRow[]>`
          SELECT 
            wm.workspace_id,
            wm.user_id,
            wm.role,
            wm.invited_by,
            wm.joined_at,
            u.id as user_id,
            u.email as user_email,
            u.first_name as user_first_name,
            u.last_name as user_last_name
          FROM ${membersTable} wm
          LEFT JOIN ${usersTable} u ON u.id = wm.user_id
          WHERE wm.workspace_id = ${workspaceId}
          ORDER BY wm.joined_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `;
      }

      return members.map((member: MemberWithUserRow) => ({
        workspaceId: member.workspace_id,
        userId: member.user_id,
        role: member.role,
        invitedBy: member.invited_by,
        joinedAt: member.joined_at,
        user: {
          id: member.user_id,
          email: member.user_email,
          firstName: member.user_first_name,
          lastName: member.user_last_name,
        },
      }));
    });
  }

  /**
   * Get all teams in a workspace
   */
  async getTeams(workspaceId: string, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const teamsTable = Prisma.raw(`"${schemaName}"."teams"`);
      const usersTable = Prisma.raw(`"${schemaName}"."users"`);
      const teamMembersTable = Prisma.raw(`"${schemaName}"."TeamMember"`);

      const teams = await tx.$queryRaw<TeamRow[]>`
        SELECT 
          t.id,
          t.workspace_id,
          t.name,
          t.description,
          t.owner_id,
          t.created_at,
          t.updated_at,
          u.id AS owner_user_id,
          u.email AS owner_email,
          u.first_name AS owner_first_name,
          u.last_name AS owner_last_name,
          (SELECT COUNT(*)::int FROM ${teamMembersTable} tm WHERE tm."teamId" = t.id) AS member_count
        FROM ${teamsTable} t
        LEFT JOIN ${usersTable} u ON t.owner_id = u.id
        WHERE t.workspace_id = ${workspaceId}
        ORDER BY t.created_at DESC
      `;

      return teams.map((t: TeamRow) => ({
        id: t.id,
        workspaceId: t.workspace_id,
        name: t.name,
        description: t.description,
        ownerId: t.owner_id,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        owner: {
          id: t.owner_user_id,
          email: t.owner_email,
          firstName: t.owner_first_name,
          lastName: t.owner_last_name,
        },
        _count: {
          members: t.member_count || 0,
        },
      }));
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
    },
    tenantCtx?: TenantContext
  ) {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    return await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const teamsTable = Prisma.raw(`"${schemaName}"."teams"`);
      const usersTable = Prisma.raw(`"${schemaName}"."users"`);

      // Verify workspace exists and belongs to tenant
      const workspaces = await tx.$queryRaw<IdRow[]>`
        SELECT id FROM ${workspacesTable}
        WHERE id = ${workspaceId} AND tenant_id = ${tenantContext.tenantId}
      `;

      if (!workspaces || workspaces.length === 0) {
        throw new Error(
          `Workspace not found or does not belong to tenant ${tenantContext.tenantId}`
        );
      }

      // Create the team
      const teamId = crypto.randomUUID();
      await tx.$executeRaw`
        INSERT INTO ${teamsTable} (id, workspace_id, name, description, owner_id, created_at, updated_at)
        VALUES (${teamId}, ${workspaceId}, ${data.name}, ${data.description || null}, ${data.ownerId}, NOW(), NOW())
      `;

      // Fetch the created team with owner info
      const teams = await tx.$queryRaw<TeamRow[]>`
        SELECT 
          t.id,
          t.workspace_id,
          t.name,
          t.description,
          t.owner_id,
          t.created_at,
          t.updated_at,
          u.id AS owner_user_id,
          u.email AS owner_email,
          u.first_name AS owner_first_name,
          u.last_name AS owner_last_name
        FROM ${teamsTable} t
        LEFT JOIN ${usersTable} u ON t.owner_id = u.id
        WHERE t.id = ${teamId}
      `;

      const t = teams[0];

      // TODO: Publish event
      // await this.eventBus.publish({
      //   type: 'core.workspace.team.created',
      //   aggregateId: workspaceId,
      //   data: { workspaceId, teamId: t.id, name: data.name }
      // });

      return {
        id: t.id,
        workspaceId: t.workspace_id,
        name: t.name,
        description: t.description,
        ownerId: t.owner_id,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        owner: {
          id: t.owner_user_id,
          email: t.owner_email,
          firstName: t.owner_first_name,
          lastName: t.owner_last_name,
        },
      };
    });
  }
}

// Export singleton instance
export const workspaceService = new WorkspaceService();
