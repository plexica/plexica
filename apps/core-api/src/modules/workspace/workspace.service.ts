import { PrismaClient, WorkspaceRole, Prisma } from '@plexica/database';
import { EventBusService, WORKSPACE_EVENTS, createWorkspaceEvent } from '@plexica/event-bus';
import type {
  WorkspaceCreatedData,
  WorkspaceUpdatedData,
  WorkspaceDeletedData,
  MemberAddedData,
  MemberRoleUpdatedData,
  MemberRemovedData,
  TeamCreatedData,
} from '@plexica/event-bus';
import type { Redis } from 'ioredis';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { getTenantContext, type TenantContext } from '../../middleware/tenant-context.js';
import type { CreateWorkspaceDto, UpdateWorkspaceDto, AddMemberDto } from './dto/index.js';
import type { Logger } from 'pino';
import {
  WorkspaceHierarchyService,
  workspaceHierarchyService,
} from './workspace-hierarchy.service.js';
import {
  WorkspaceTemplateService,
  workspaceTemplateService,
} from './workspace-template.service.js';
import { PluginHookService, pluginHookService } from '../plugin/plugin-hook.service.js';
import { WorkspaceError, WorkspaceErrorCode } from './utils/error-formatter.js';

/**
 * Row types for raw SQL query results.
 * These match the column names returned by the SELECT statements below.
 */

/** Basic workspace columns */
interface WorkspaceRow {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  depth: number;
  path: string;
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
  child_count: number;
}

/** Workspace list row with the requesting user's membership info */
interface WorkspaceListRow extends WorkspaceRow {
  member_role: string;
  joined_at: Date;
  member_count: string | number;
  team_count: string | number;
  child_count: string | number;
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

// Cache configuration constants
const CACHE_TTL_SECONDS = 300; // 5 minutes
const CACHE_KEY_PREFIX = 'workspace';

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
  private eventBus?: EventBusService;
  private cache?: Redis;
  private log: Logger;
  private hierarchyService: WorkspaceHierarchyService;
  private templateService: WorkspaceTemplateService;
  private hookService: PluginHookService;

  constructor(
    customDb?: PrismaClient,
    eventBus?: EventBusService,
    cache?: Redis,
    customLogger?: Logger,
    hierarchyService?: WorkspaceHierarchyService,
    templateService?: WorkspaceTemplateService,
    hookService?: PluginHookService
  ) {
    this.db = customDb || db;
    this.eventBus = eventBus;
    this.cache = cache;
    this.log = customLogger || logger;
    // If a custom db is injected (test mode) and no explicit hierarchyService
    // is provided, create a local hierarchy service using the same mock db so
    // that tests don't attempt a real Postgres connection.
    this.hierarchyService =
      hierarchyService ||
      (customDb
        ? new WorkspaceHierarchyService(customDb, cache, customLogger || logger)
        : workspaceHierarchyService);
    this.templateService =
      templateService ||
      (customDb
        ? new WorkspaceTemplateService(customDb, undefined, customLogger || logger)
        : workspaceTemplateService);
    this.hookService =
      hookService ||
      (customDb ? new PluginHookService(customDb, customLogger || logger) : pluginHookService);
  }

  /**
   * Build tenant-scoped cache key for membership
   * @private
   */
  private membershipCacheKey(tenantId: string, workspaceId: string, userId: string): string {
    return `tenant:${tenantId}:${CACHE_KEY_PREFIX}:${workspaceId}:member:${userId}`;
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

    // ---------------------------------------------------------------------------
    // Hierarchy: resolve parent and compute depth/path before the transaction
    // ---------------------------------------------------------------------------
    let parentRow: import('./types/hierarchy.types.js').WorkspaceHierarchyRow | null = null;
    if (dto.parentId) {
      // Validates parent exists AND caller is ADMIN of parent; throws on failure.
      parentRow = await this.hierarchyService.validateParentAccess(
        dto.parentId,
        creatorId,
        tenantContext
      );
      // Spec 011: hierarchy is unlimited depth — validateDepthConstraint is a
      // soft guard that can be removed; currently MAX_DEPTH = 2 is kept for safety.
      this.hierarchyService.validateDepthConstraint(parentRow.depth);
    }

    const { depth, path: hierarchyPath } = this.hierarchyService.computeHierarchyFields(
      parentRow,
      '' // placeholder replaced inside transaction after id generation
    );
    // We compute the final path inside the transaction once we have the new ID.
    void depth;
    void hierarchyPath;

    // ---------------------------------------------------------------------------
    // Phase 3 (T011-14): Run before_create hooks BEFORE transaction.
    // Sequential. Fail-open on timeout/network error.
    // ---------------------------------------------------------------------------
    const hookResult = await this.hookService.runBeforeCreateHooks(
      {
        slug: dto.slug,
        name: dto.name,
        parentId: dto.parentId,
        templateId: dto.templateId,
        tenantId: tenantContext.tenantId,
      },
      tenantContext
    );

    if (!hookResult.approved) {
      throw new WorkspaceError(
        WorkspaceErrorCode.HOOK_REJECTED_CREATION,
        hookResult.reason ?? 'Workspace creation rejected by plugin hook',
        { reason: hookResult.reason, pluginId: hookResult.pluginId }
      );
    }

    // Use a transaction to ensure workspace and member are created together.
    // Slug uniqueness is enforced by the DB unique constraint inside the
    // transaction (TOCTOU-safe). P2002 on slug columns is caught and re-thrown
    // as WORKSPACE_SLUG_CONFLICT so the caller receives a 409, not a raw 500.
    const createdWorkspace = await this.db.$transaction(async (tx) => {
      // Set search path for this transaction to use the tenant schema
      // Note: schemaName is validated with regex above, so this is safe
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      // Generate workspace ID
      const workspaceIdResult = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT gen_random_uuid()::text as id
      `;
      const newWorkspaceId = workspaceIdResult[0].id;

      // Compute final hierarchy fields now that we have the ID
      const { depth: newDepth, path: newPath } = this.hierarchyService.computeHierarchyFields(
        parentRow,
        newWorkspaceId
      );

      // Create workspace using parameterized values
      // Note: settings must be cast to jsonb explicitly so Postgres accepts
      // the JSON string parameter when the column type is jsonb.
      // P2002 (unique constraint violation on slug) is caught here so
      // concurrent inserts that race past pre-checks surface as a clean 409.
      const settingsJson = JSON.stringify(dto.settings ?? {});
      const tableName = Prisma.raw(`"${schemaName}"."workspaces"`);
      try {
        if (dto.parentId) {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO ${tableName}
             (id, tenant_id, parent_id, depth, path, slug, name, description, settings, created_at, updated_at)
             VALUES (
               ${newWorkspaceId},
               ${tenantContext.tenantId}::uuid,
               ${dto.parentId}::uuid,
               ${newDepth},
               ${newPath},
               ${dto.slug},
               ${dto.name},
               ${dto.description ?? null},
               ${settingsJson}::jsonb,
               NOW(),
               NOW()
             )`
          );
        } else {
          await tx.$executeRaw(
            Prisma.sql`INSERT INTO ${tableName}
             (id, tenant_id, parent_id, depth, path, slug, name, description, settings, created_at, updated_at)
             VALUES (
               ${newWorkspaceId},
               ${tenantContext.tenantId}::uuid,
               NULL,
               ${newDepth},
               ${newPath},
               ${dto.slug},
               ${dto.name},
               ${dto.description ?? null},
               ${settingsJson}::jsonb,
               NOW(),
               NOW()
             )`
          );
        }
      } catch (insertErr) {
        // Detect Postgres unique-constraint violations regardless of whether
        // Prisma surfaces them as P2002 (model operations) or P2010 (raw
        // queries via the pg driver adapter). Also handles plain Error objects
        // whose message contains the postgres 23505 code (e.g. thrown by
        // older driver versions or test mocks).
        //
        // When a violation is detected, re-throw as WorkspaceError so the
        // Fastify route handler returns 409 WORKSPACE_SLUG_CONFLICT.
        const isUniqueViolation = (err: unknown): boolean => {
          if (err instanceof Prisma.PrismaClientKnownRequestError) {
            if (err.code === 'P2002') return true;
            if (err.code === 'P2010') {
              // meta.message contains "Raw query failed. Code: `23505`. …"
              const msg = String((err.meta as Record<string, unknown> | undefined)?.message ?? '');
              if (msg.includes('23505')) return true;
            }
          }
          // Fallback: check the stringified error for the postgres error code.
          // Covers driver adapter errors that may not be PrismaClientKnownRequestError.
          const errStr = String(err instanceof Error ? err.message : err);
          return errStr.includes('23505') || errStr.toLowerCase().includes('unique constraint');
        };
        if (isUniqueViolation(insertErr)) {
          throw new WorkspaceError(
            WorkspaceErrorCode.WORKSPACE_SLUG_CONFLICT,
            `Workspace with slug '${dto.slug}' already exists`
          );
        }
        throw insertErr;
      }

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

      // [Phase 2] Apply template if templateId is provided
      if (dto.templateId) {
        await this.templateService.applyTemplate(
          newWorkspaceId,
          dto.templateId,
          tenantContext.tenantId,
          tx,
          schemaName
        );
      }

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
          (SELECT COUNT(*) FROM ${Prisma.raw(`"${schemaName}"."teams"`)} WHERE workspace_id = w.id)::int as team_count,
          (SELECT COUNT(*) FROM ${workspacesTable} WHERE parent_id = w.id)::int as child_count
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
        parentId: result.parent_id,
        depth: result.depth,
        path: result.path,
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
          children: result.child_count,
        },
      };
    });

    // Invalidate hierarchy caches for the parent (its child count changed)
    if (dto.parentId && parentRow) {
      await this.hierarchyService.invalidateHierarchyCache(parentRow.path, tenantContext.tenantId);
    }

    // Publish workspace created event after successful transaction
    if (this.eventBus) {
      try {
        const event = createWorkspaceEvent<WorkspaceCreatedData>(WORKSPACE_EVENTS.CREATED, {
          aggregateId: createdWorkspace.id,
          tenantId: tenantContext.tenantId,
          userId: creatorId,
          data: {
            workspaceId: createdWorkspace.id,
            slug: createdWorkspace.slug,
            name: createdWorkspace.name,
            creatorId,
          },
        });
        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic (routing)
          event.type, // event type (semantics: 'core.workspace.created')
          event.data,
          {
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            userId: event.metadata.userId,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          {
            workspaceId: createdWorkspace.id,
            eventType: WORKSPACE_EVENTS.CREATED,
            error: String(eventError),
          },
          'Failed to publish workspace created event'
        );
      }
    }

    // Fire-and-forget — no await (spec 011 T011-14)
    this.hookService.runCreatedHooks(createdWorkspace.id, dto.templateId ?? null, tenantContext);

    return createdWorkspace;
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

      // Explicitly select columns to ensure proper mapping.
      // member_count, team_count, child_count use a single-pass LEFT JOIN with
      // COUNT(DISTINCT ...) to avoid N+1 correlated subqueries (plan.md §14.3).
      const result = await tx.$queryRaw<WorkspaceListRow[]>`
        SELECT 
          w.id,
          w.tenant_id,
          w.parent_id,
          w.depth,
          w.path,
          w.slug,
          w.name,
          w.description,
          w.settings,
          w.created_at,
          w.updated_at,
          wm.role as member_role,
          wm.joined_at,
          COUNT(DISTINCT wm2.user_id)::int as member_count,
          COUNT(DISTINCT t.id)::int as team_count,
          COUNT(DISTINCT ch.id)::int as child_count
        FROM ${workspacesTable} w
        INNER JOIN ${membersTable} wm ON w.id = wm.workspace_id AND wm.user_id = ${userId}
        LEFT JOIN ${membersTable} wm2 ON w.id = wm2.workspace_id
        LEFT JOIN ${teamsTable} t ON w.id = t.workspace_id
        LEFT JOIN ${workspacesTable} ch ON ch.parent_id = w.id
        WHERE w.tenant_id = ${tenantId}
        GROUP BY w.id, w.tenant_id, w.parent_id, w.depth, w.path, w.slug, w.name,
                 w.description, w.settings, w.created_at, w.updated_at,
                 wm.role, wm.joined_at
        ORDER BY ${Prisma.raw(orderByClause)}
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      return result.map((row: WorkspaceListRow) => ({
        id: row.id,
        tenantId: row.tenant_id,
        parentId: row.parent_id,
        depth: row.depth,
        path: row.path,
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
          children: Number(row.child_count),
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
          COUNT(DISTINCT t.id) as team_count,
          (SELECT COUNT(*) FROM ${workspacesTable} WHERE parent_id = w.id)::int as child_count
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
        parentId: workspace.parent_id,
        depth: workspace.depth,
        path: workspace.path,
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
          children: Number(workspace.child_count),
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

    const updatedWorkspace = await this.db.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      // Note: schemaName is validated with regex above
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);

      // Build UPDATE statement with parameterized values.
      // Note: settings must be cast to jsonb explicitly (same as create()).
      // Errors are NOT wrapped so mapServiceError can match .code / message.
      let updateCount: number;
      const settingsJson = dto.settings !== undefined ? JSON.stringify(dto.settings) : undefined;

      if (dto.name !== undefined && dto.description !== undefined && settingsJson !== undefined) {
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
             SET name = ${dto.name},
                 description = ${dto.description},
                 settings = ${settingsJson}::jsonb,
                 updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      } else if (dto.name !== undefined && dto.description !== undefined) {
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
            SET name = ${dto.name},
                description = ${dto.description},
                updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      } else if (dto.name !== undefined && settingsJson !== undefined) {
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
             SET name = ${dto.name},
                 settings = ${settingsJson}::jsonb,
                 updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      } else if (dto.description !== undefined && settingsJson !== undefined) {
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
             SET description = ${dto.description},
                 settings = ${settingsJson}::jsonb,
                 updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      } else if (dto.name !== undefined) {
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
            SET name = ${dto.name}, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      } else if (dto.description !== undefined) {
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
            SET description = ${dto.description}, updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      } else if (settingsJson !== undefined) {
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
             SET settings = ${settingsJson}::jsonb, updated_at = NOW()
             WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      } else {
        // No fields to update, just update the timestamp
        updateCount = await tx.$executeRaw(
          Prisma.sql`UPDATE ${workspacesTable}
            SET updated_at = NOW()
            WHERE id = ${id} AND tenant_id = ${tenantId}`
        );
      }

      if (updateCount === 0) {
        throw new Error(`Workspace ${id} not found or does not belong to tenant ${tenantId}`);
      }

      // Fetch updated workspace
      const workspaces = await tx.$queryRaw<WorkspaceRow[]>(
        Prisma.sql`SELECT * FROM ${workspacesTable}
          WHERE id = ${id} AND tenant_id = ${tenantId}`
      );

      if (!workspaces || workspaces.length === 0) {
        throw new Error(`Workspace ${id} not found after update`);
      }

      // Event published after transaction (see below)

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
    });

    // Publish workspace updated event after successful transaction
    if (this.eventBus && updatedWorkspace) {
      try {
        // Build changes object from DTO fields
        const changes: Record<string, unknown> = {};
        if (dto.name !== undefined) changes.name = dto.name;
        if (dto.description !== undefined) changes.description = dto.description;
        if (dto.settings !== undefined) changes.settings = dto.settings;

        const actorId = tenantContext!.userId ?? 'system';
        const event = createWorkspaceEvent<WorkspaceUpdatedData>(WORKSPACE_EVENTS.UPDATED, {
          aggregateId: id,
          tenantId: tenantContext!.tenantId,
          userId: actorId,
          data: {
            workspaceId: id,
            changes,
          },
        });
        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.updated'
          event.data,
          {
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            userId: event.metadata.userId,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          { workspaceId: id, eventType: WORKSPACE_EVENTS.UPDATED, error: String(eventError) },
          'Failed to publish workspace updated event'
        );
      }
    }

    return updatedWorkspace;
  }

  /**
   * Delete workspace (only if no teams and no children exist)
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

      // Check for child workspaces INSIDE the transaction (TOCTOU-safe).
      // SELECT FOR UPDATE on the parent row prevents concurrent inserts from
      // racing between this check and the DELETE below.
      await tx.$executeRaw(
        Prisma.sql`SELECT id FROM ${workspacesTable}
          WHERE id = ${id}
          FOR UPDATE`
      );
      const childCounts = await tx.$queryRaw<CountRow[]>(
        Prisma.sql`SELECT COUNT(*) AS count FROM ${workspacesTable}
          WHERE parent_id = ${id}
            AND tenant_id = ${tenantId}`
      );
      if (Number(childCounts[0]?.count ?? 0) > 0) {
        throw new Error(
          'Cannot delete workspace with existing children. Remove child workspaces first.'
        );
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
    });

    // Invalidate member cache entries for this workspace using deterministic keys.
    // KEYS is intentionally avoided (O(N) blocking Redis command).
    // The member cache key format mirrors the pattern used in addMember / removeMember:
    //   tenant:<tenantId>:<PREFIX>:<workspaceId>:member:<userId>
    // On delete we cannot enumerate all members without a DB query, so we invalidate
    // the workspace-level aggregation key and rely on per-member TTL expiry for the
    // individual entries. The aggregation key is always present after the first read.
    if (this.cache) {
      try {
        const aggKey = `tenant:${tenantId}:${CACHE_KEY_PREFIX}:${id}:members:agg`;
        await this.cache.del(aggKey);
        this.log.debug(
          { workspaceId: id },
          'Workspace member aggregation cache invalidated on workspace delete'
        );
      } catch (cacheError) {
        this.log.warn(
          { workspaceId: id, error: String(cacheError) },
          'Failed to invalidate workspace member cache'
        );
      }
    }

    // Publish workspace deleted event after successful transaction
    if (this.eventBus) {
      try {
        const actorId = tenantContext!.userId ?? 'system';
        const event = createWorkspaceEvent<WorkspaceDeletedData>(WORKSPACE_EVENTS.DELETED, {
          aggregateId: id,
          tenantId,
          userId: actorId,
          data: {
            workspaceId: id,
          },
        });
        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.deleted'
          event.data,
          {
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            userId: event.metadata.userId,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          { workspaceId: id, eventType: WORKSPACE_EVENTS.DELETED, error: String(eventError) },
          'Failed to publish workspace deleted event'
        );
      }
    }

    // Fire-and-forget — no await (spec 011 T011-14)
    this.hookService.runDeletedHooks(id, tenantContext);
  }

  /**
   * Re-parent a workspace to a new parent (or to root if newParentId is null).
   *
   * Rules:
   *   - Caller must be tenant ADMIN (enforced by route preHandler guard)
   *   - New parent must exist in the same tenant
   *   - New parent must not be a descendant of the workspace (cycle prevention)
   *   - Slug must be unique under the new parent
   *   - Updates path/depth for the workspace AND all its descendants atomically
   *
   * Spec 011 §FR-006 — parentId is re-parentable by tenant ADMIN only.
   */
  async reparent(
    workspaceId: string,
    newParentId: string | null,
    callerId: string,
    tenantCtx?: TenantContext
  ): Promise<{ id: string; parentId: string | null; depth: number; path: string }> {
    const tenantContext = tenantCtx || getTenantContext();
    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;
    const { tenantId } = tenantContext;

    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);

    // Fetch current workspace row
    const currentRows = await this.db.$queryRaw<
      Array<{ id: string; parent_id: string | null; depth: number; path: string; slug: string }>
    >(
      Prisma.sql`SELECT id, parent_id, depth, path, slug FROM ${wsTable}
        WHERE id = ${workspaceId} AND tenant_id = ${tenantId}
        LIMIT 1`
    );

    if (currentRows.length === 0) {
      throw new Error(
        `Workspace ${workspaceId} not found or does not belong to tenant ${tenantId}`
      );
    }

    const current = currentRows[0];

    // Prevent no-op reparenting (already at the desired parent)
    if (current.parent_id === newParentId) {
      return {
        id: current.id,
        parentId: current.parent_id,
        depth: current.depth,
        path: current.path,
      };
    }

    let newParentRow: import('./types/hierarchy.types.js').WorkspaceHierarchyRow | null = null;

    if (newParentId !== null) {
      // Validate new parent exists in the same tenant
      const parentRows = await this.db.$queryRaw<
        Array<{
          id: string;
          path: string;
          depth: number;
          slug: string;
          name: string;
          description: string | null;
          parent_id: string | null;
          tenant_id: string;
          settings: unknown;
          created_at: Date;
          updated_at: Date;
        }>
      >(
        Prisma.sql`SELECT * FROM ${wsTable}
          WHERE id = ${newParentId} AND tenant_id = ${tenantId}
          LIMIT 1`
      );

      if (parentRows.length === 0) {
        const err = new Error(`Parent workspace '${newParentId}' not found`);
        (err as NodeJS.ErrnoException).code = 'PARENT_WORKSPACE_NOT_FOUND';
        throw err;
      }

      newParentRow = parentRows[0] as import('./types/hierarchy.types.js').WorkspaceHierarchyRow;

      // Cycle detection: new parent must not be the workspace itself or any descendant
      if (newParentRow.path.startsWith(current.path + '/') || newParentRow.id === current.id) {
        const err = new Error(
          `Cannot re-parent workspace '${workspaceId}' under its own descendant '${newParentId}'`
        );
        (err as NodeJS.ErrnoException).code = 'REPARENT_CYCLE_DETECTED';
        throw err;
      }

      // Depth constraint: new parent depth + 1 must not exceed MAX_DEPTH
      this.hierarchyService.validateDepthConstraint(newParentRow.depth);
    }

    // Slug uniqueness under new parent
    const slugConflict = await (async () => {
      if (newParentId === null) {
        return this.db.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM ${wsTable}
            WHERE tenant_id = ${tenantId}
              AND slug = ${current.slug}
              AND parent_id IS NULL
              AND id != ${workspaceId}
            LIMIT 1`
        );
      } else {
        return this.db.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT id FROM ${wsTable}
            WHERE parent_id = ${newParentId}
              AND slug = ${current.slug}
              AND id != ${workspaceId}
            LIMIT 1`
        );
      }
    })();

    if (slugConflict.length > 0) {
      const err = new Error(
        `Workspace slug '${current.slug}' already exists under the target parent`
      );
      (err as NodeJS.ErrnoException).code = 'WORKSPACE_SLUG_CONFLICT';
      throw err;
    }

    // Compute new hierarchy fields for the workspace being re-parented
    const { depth: newDepth, path: newPath } = this.hierarchyService.computeHierarchyFields(
      newParentRow,
      workspaceId
    );

    // Compute old path prefix so we can update all descendants
    const oldPathPrefix = current.path;

    // Perform all updates in a single transaction
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      // 1. Update the workspace itself
      if (newParentId !== null) {
        await tx.$executeRaw`
          UPDATE ${wsTable}
          SET parent_id = ${newParentId},
              depth = ${newDepth},
              path = ${newPath},
              updated_at = NOW()
          WHERE id = ${workspaceId} AND tenant_id = ${tenantId}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE ${wsTable}
          SET parent_id = NULL,
              depth = ${newDepth},
              path = ${newPath},
              updated_at = NOW()
          WHERE id = ${workspaceId} AND tenant_id = ${tenantId}
        `;
      }

      // 2. Update all descendants by replacing the old path prefix with the new one.
      //    The depth delta is newDepth - current.depth.
      const depthDelta = newDepth - current.depth;
      const descendantPathPrefix = oldPathPrefix + '/%';

      await tx.$executeRaw(
        Prisma.sql`UPDATE ${wsTable}
          SET path = ${newPath} || SUBSTRING(path FROM ${oldPathPrefix.length + 1}),
              depth = depth + ${depthDelta},
              updated_at = NOW()
          WHERE path LIKE ${descendantPathPrefix}
            AND tenant_id = ${tenantId}`
      );
    });

    // Invalidate hierarchy caches for old and new ancestor chains
    await Promise.allSettled([
      this.hierarchyService.invalidateHierarchyCache(oldPathPrefix, tenantId),
      newParentRow
        ? this.hierarchyService.invalidateHierarchyCache(newParentRow.path, tenantId)
        : Promise.resolve(),
    ]);

    this.log.info(
      { workspaceId, newParentId, callerId, tenantId },
      'workspace-hierarchy: reparent complete'
    );

    return { id: workspaceId, parentId: newParentId, depth: newDepth, path: newPath };
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

    // 1. Try cache first
    if (this.cache) {
      try {
        const cacheKey = this.membershipCacheKey(tenantContext.tenantId, workspaceId, userId);
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.log.debug({ workspaceId, userId, cacheHit: true }, 'Membership cache hit');
          return JSON.parse(cached);
        }
        this.log.debug({ workspaceId, userId, cacheHit: false }, 'Membership cache miss');
      } catch (cacheError) {
        // Cache failure: fall through to database query
        this.log.warn(
          { workspaceId, userId, error: String(cacheError) },
          'Redis cache read failed, falling back to database'
        );
      }
    }

    // 2. Query database (existing logic)
    const result = await this.db.$transaction(async (tx) => {
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
      return {
        workspaceId: membership.workspace_id,
        userId: membership.user_id,
        role: membership.role,
        invitedBy: membership.invited_by,
        joinedAt: membership.joined_at,
      };
    });

    // 3. Populate cache on miss (non-blocking)
    if (result && this.cache) {
      try {
        const cacheKey = this.membershipCacheKey(tenantContext.tenantId, workspaceId, userId);
        await this.cache.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
        this.log.debug({ workspaceId, userId }, 'Membership cached successfully');
      } catch (cacheError) {
        this.log.warn(
          { workspaceId, userId, error: String(cacheError) },
          'Redis cache write failed'
        );
      }
    }

    return result;
  }

  /**
   * Check workspace exists in tenant and get user membership in a single transaction.
   * Used by workspace guard to avoid two separate transactions per request.
   * Returns { exists: true, membership } or { exists: false, membership: null }.
   *
   * Caching Strategy: Cache membership only, always verify workspace existence from database
   * to prevent stale access after workspace deletion.
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
    /** Workspace path (materialised path) — used for hierarchical guard. */
    workspaceRow: { id: string; path: string } | null;
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

    // Try to get cached membership (but always verify workspace existence)
    let cachedMembership: any = null;
    if (this.cache) {
      try {
        const cacheKey = this.membershipCacheKey(tenantContext.tenantId, workspaceId, userId);
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          cachedMembership = JSON.parse(cached);
          this.log.debug(
            { workspaceId, userId, cacheHit: true },
            'Membership cache hit in checkAccess'
          );
        }
      } catch (cacheError) {
        this.log.warn(
          { workspaceId, userId, error: String(cacheError) },
          'Redis cache read failed in checkAccess'
        );
      }
    }

    return await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);

      // Always verify workspace exists from database (also fetch path for hierarchy guard)
      const workspaceExists = await tx.$queryRaw<Array<{ id: string; path: string }>>`
        SELECT id, path FROM ${workspacesTable}
        WHERE id = ${workspaceId} AND tenant_id = ${tenantId}
      `;

      if (!workspaceExists || workspaceExists.length === 0) {
        return { exists: false, membership: null, workspaceRow: null };
      }

      const workspaceRow = { id: workspaceExists[0].id, path: workspaceExists[0].path ?? '' };

      // If we have cached membership, return it (workspace exists and membership is cached)
      if (cachedMembership) {
        return { exists: true, membership: cachedMembership, workspaceRow };
      }

      // Cache miss: query membership from database
      const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
      const memberships = await tx.$queryRaw<MembershipRow[]>`
        SELECT * FROM ${membersTable}
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;

      if (!memberships || memberships.length === 0) {
        return { exists: true, membership: null, workspaceRow };
      }

      const row = memberships[0];
      const membership = {
        workspaceId: row.workspace_id,
        userId: row.user_id,
        role: row.role,
        invitedBy: row.invited_by,
        joinedAt: row.joined_at,
      };

      // Cache the membership for future lookups
      if (this.cache) {
        try {
          const cacheKey = this.membershipCacheKey(tenantContext.tenantId, workspaceId, userId);
          await this.cache.set(cacheKey, JSON.stringify(membership), 'EX', CACHE_TTL_SECONDS);
          this.log.debug({ workspaceId, userId }, 'Membership cached in checkAccess');
        } catch (cacheError) {
          this.log.warn(
            { workspaceId, userId, error: String(cacheError) },
            'Redis cache write failed in checkAccess'
          );
        }
      }

      return { exists: true, membership, workspaceRow };
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

    const addedMember = await this.db.$transaction(async (tx) => {
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

    // Invalidate cache after successful transaction
    if (this.cache) {
      try {
        const cacheKey = this.membershipCacheKey(tenantContext.tenantId, workspaceId, dto.userId);
        await this.cache.del(cacheKey);
        this.log.debug(
          { workspaceId, userId: dto.userId },
          'Membership cache invalidated on member add'
        );
      } catch (cacheError) {
        this.log.warn(
          { workspaceId, userId: dto.userId, error: String(cacheError) },
          'Failed to invalidate membership cache'
        );
      }
    }

    // Publish member added event after successful transaction
    if (this.eventBus) {
      try {
        const event = createWorkspaceEvent<MemberAddedData>(WORKSPACE_EVENTS.MEMBER_ADDED, {
          aggregateId: workspaceId,
          tenantId,
          userId: invitedBy,
          workspaceId,
          data: {
            workspaceId,
            userId: dto.userId,
            role: addedMember.role as 'ADMIN' | 'MEMBER' | 'VIEWER',
            invitedBy,
          },
        });
        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.member.added'
          event.data,
          {
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            userId: event.metadata.userId,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          {
            workspaceId,
            eventType: WORKSPACE_EVENTS.MEMBER_ADDED,
            error: String(eventError),
          },
          'Failed to publish member added event'
        );
      }
    }

    return addedMember;
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

    const { result: updatedMember, oldRole } = await this.db.$transaction(async (tx) => {
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
      const previousRole = currentMember.role;

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

      return {
        result: {
          workspaceId: member.workspace_id,
          userId: member.user_id,
          role: member.role,
          invitedBy: member.invited_by,
          joinedAt: member.joined_at,
        },
        oldRole: previousRole,
      };
    });

    // Invalidate cache after successful transaction
    if (this.cache) {
      try {
        const cacheKey = this.membershipCacheKey(tenantContext.tenantId, workspaceId, userId);
        await this.cache.del(cacheKey);
        this.log.debug({ workspaceId, userId }, 'Membership cache invalidated on role update');
      } catch (cacheError) {
        this.log.warn(
          { workspaceId, userId, error: String(cacheError) },
          'Failed to invalidate membership cache'
        );
      }
    }

    // Publish member role updated event after successful transaction
    if (this.eventBus) {
      try {
        const actorId = tenantContext!.userId ?? 'system';
        const event = createWorkspaceEvent<MemberRoleUpdatedData>(
          WORKSPACE_EVENTS.MEMBER_ROLE_UPDATED,
          {
            aggregateId: workspaceId,
            tenantId: tenantContext!.tenantId,
            userId: actorId,
            workspaceId,
            data: {
              workspaceId,
              userId,
              oldRole,
              newRole: role,
            },
          }
        );
        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.member.role_updated'
          event.data,
          {
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            userId: event.metadata.userId,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          {
            workspaceId,
            eventType: WORKSPACE_EVENTS.MEMBER_ROLE_UPDATED,
            error: String(eventError),
          },
          'Failed to publish member role updated event'
        );
      }
    }

    return updatedMember;
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

      // First, delete team memberships for this user in teams within this workspace.
      // The team_members table may not exist in all tenant schemas (it is provisioned
      // optionally). Use a SAVEPOINT so a missing-table error does not abort the
      // outer transaction — catching the Prisma JS error alone is not enough because
      // PostgreSQL marks the connection as "transaction aborted" after any error,
      // causing all subsequent statements in the same $transaction to fail with 25P02.
      const teamsTable = Prisma.raw(`"${schemaName}"."teams"`);
      const teamMembersTable = Prisma.raw(`"${schemaName}"."team_members"`);

      await tx.$executeRaw(Prisma.raw('SAVEPOINT before_team_members_delete'));
      try {
        await tx.$executeRaw`
           DELETE FROM ${teamMembersTable}
           WHERE "team_id" IN (
             SELECT id FROM ${teamsTable}
             WHERE workspace_id = ${workspaceId}
           )
           AND "user_id" = ${userId}
         `;
        await tx.$executeRaw(Prisma.raw('RELEASE SAVEPOINT before_team_members_delete'));
      } catch {
        // team_members table does not exist in this tenant schema — roll back to
        // the savepoint to clear the aborted-transaction state, then continue.
        await tx.$executeRaw(Prisma.raw('ROLLBACK TO SAVEPOINT before_team_members_delete'));
      }

      // Delete the member
      await tx.$executeRaw`
         DELETE FROM ${membersTable}
         WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
       `;
    });

    // Invalidate cache after successful transaction
    if (this.cache) {
      try {
        const cacheKey = this.membershipCacheKey(tenantContext.tenantId, workspaceId, userId);
        await this.cache.del(cacheKey);
        this.log.debug({ workspaceId, userId }, 'Membership cache invalidated on member remove');
      } catch (cacheError) {
        this.log.warn(
          { workspaceId, userId, error: String(cacheError) },
          'Failed to invalidate membership cache'
        );
      }
    }

    // Publish member removed event after successful transaction
    if (this.eventBus) {
      try {
        const actorId = tenantContext!.userId ?? 'system';
        const event = createWorkspaceEvent<MemberRemovedData>(WORKSPACE_EVENTS.MEMBER_REMOVED, {
          aggregateId: workspaceId,
          tenantId: tenantContext!.tenantId,
          userId: actorId,
          workspaceId,
          data: {
            workspaceId,
            userId,
          },
        });
        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.member.removed'
          event.data,
          {
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            userId: event.metadata.userId,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          {
            workspaceId,
            eventType: WORKSPACE_EVENTS.MEMBER_REMOVED,
            error: String(eventError),
          },
          'Failed to publish member removed event'
        );
      }
    }
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
      // Note: team_members table is optional and may not exist in all tenant schemas.
      // member_count is therefore hardcoded to 0 until the table is provisioned.

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
          0 AS member_count
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

    const createdTeam = await this.db.$transaction(async (tx) => {
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

    // Publish team created event after successful transaction
    if (this.eventBus) {
      try {
        const actorId = tenantContext!.userId ?? 'system';
        const event = createWorkspaceEvent<TeamCreatedData>(WORKSPACE_EVENTS.TEAM_CREATED, {
          aggregateId: workspaceId,
          tenantId: tenantContext!.tenantId,
          userId: actorId,
          workspaceId,
          data: {
            workspaceId,
            teamId: createdTeam.id,
            name: data.name,
            ownerId: data.ownerId,
          },
        });
        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.team.created'
          event.data,
          {
            tenantId: event.tenantId,
            workspaceId: event.workspaceId,
            userId: event.metadata.userId,
            source: event.metadata.source,
            correlationId: event.metadata.correlationId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          {
            workspaceId,
            eventType: WORKSPACE_EVENTS.TEAM_CREATED,
            error: String(eventError),
          },
          'Failed to publish team created event'
        );
      }
    }

    return createdTeam;
  }
}

// Export singleton instance
export const workspaceService = new WorkspaceService();
