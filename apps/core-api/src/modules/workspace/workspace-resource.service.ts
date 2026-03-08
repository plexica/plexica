import { PrismaClient, Prisma } from '@plexica/database';
import { EventBusService, WORKSPACE_EVENTS, createWorkspaceEvent } from '@plexica/event-bus';
import type { ResourceSharedData, ResourceUnsharedData } from '@plexica/event-bus';
import type { Logger } from 'pino';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { getTenantContext, type TenantContext } from '../../middleware/tenant-context.js';
import type { ShareResourceDto, ListSharedResourcesDto } from './dto/index.js';

/**
 * Row type for workspace_resources table (raw DB result — snake_case)
 */
interface WorkspaceResourceRow {
  id: string;
  workspace_id: string;
  resource_type: string;
  resource_id: string;
  created_at: Date;
}

/**
 * Public camelCase shape returned from all service methods.
 * Must match the Fastify JSON schema (Constitution Art. 6.2 / Art. 3.4).
 */
export interface WorkspaceResource {
  id: string;
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  createdAt: Date;
}

/** Map a raw DB row to the public camelCase shape. */
function toWorkspaceResource(row: WorkspaceResourceRow): WorkspaceResource {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    createdAt: row.created_at,
  };
}

/**
 * Extended Error with HTTP metadata for workspace resource errors.
 */
interface WorkspaceResourceError extends Error {
  code: string;
  statusCode: number;
  details: Record<string, unknown>;
}

function createWorkspaceResourceError(
  message: string,
  code: string,
  statusCode: number,
  details: Record<string, unknown>
): WorkspaceResourceError {
  const error = new Error(message) as WorkspaceResourceError;
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

/**
 * Workspace Resource Service
 *
 * Handles cross-workspace resource sharing within a tenant:
 * - Share resources (plugins, templates, datasets) with workspaces
 * - Unshare resources
 * - List shared resources with pagination
 * - Check if a resource is shared with a workspace
 *
 * Security:
 * - All operations are tenant-scoped (schema-per-tenant isolation)
 * - Settings enforcement: `allowCrossWorkspaceSharing` flag checked
 * - ADMIN role required for share/unshare operations (enforced at route level)
 *
 * Spec Reference: Spec 009, Section 6 (US-009), Task 3
 * Constitution: Art. 1.2 (Multi-Tenancy Isolation), Art. 3.2 (Service Layer)
 */
export class WorkspaceResourceService {
  private db: PrismaClient;
  private eventBus?: EventBusService;
  private log: Logger;

  constructor(customDb?: PrismaClient, eventBus?: EventBusService, customLogger?: Logger) {
    this.db = customDb || db;
    this.eventBus = eventBus;
    this.log = customLogger || logger;
  }

  /**
   * Share a resource with a workspace
   *
   * @param workspaceId - Workspace to share resource with
   * @param dto - Resource type and ID
   * @param userId - User performing the share (must be ADMIN)
   * @param tenantCtx - Optional tenant context (auto-detected if not provided)
   * @returns Created workspace resource link
   * @throws Error if sharing is disabled or resource already shared
   */
  async shareResource(
    workspaceId: string,
    dto: ShareResourceDto,
    userId: string,
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

    // ── Phase 0: lightweight pre-checks (outside transaction) ────────────────
    //
    // Perform the workspace-existence and sharing-enabled checks BEFORE the
    // plugin guard and before the full serializable transaction. These checks
    // are cheap (no FOR UPDATE lock) and give the caller the correct HTTP error
    // code when the workspace is missing or sharing is disabled — regardless of
    // whether a plugin guard would also fire.
    //
    // NOTE: these results are NOT trusted for the final INSERT; the same checks
    // are repeated inside the serializable transaction with a FOR UPDATE lock to
    // prevent TOCTOU races. The pre-checks here are purely for fast-fail and
    // correct error semantics.
    const workspacesTableOuter = Prisma.raw(`"${schemaName}"."workspaces"`);
    const workspacePreCheck = await this.db.$queryRaw<Array<{ id: string; settings: unknown }>>(
      Prisma.sql`SELECT id, settings FROM ${workspacesTableOuter}
       WHERE id = ${workspaceId} LIMIT 1`
    );

    if (workspacePreCheck.length === 0) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const preSettings = (workspacePreCheck[0].settings as Record<string, unknown>) || {};
    if (preSettings.allowCrossWorkspaceSharing !== true) {
      throw createWorkspaceResourceError(
        'Cross-workspace sharing is disabled for this workspace',
        'SHARING_DISABLED',
        403,
        { workspaceId, allowCrossWorkspaceSharing: false }
      );
    }

    // ── Phase 1: plugin existence guard (outside transaction) ─────────────────
    //
    // Verify the plugin exists in tenant_plugins (core schema) before acquiring
    // the transaction lock. The check is scoped to 'plugin' resourceType; future
    // resource types will add their own guards here.
    //
    // This check is performed OUTSIDE the transaction because an exception inside
    // a Prisma $transaction aborts the entire transaction block, preventing
    // subsequent queries from running even after the error is caught.
    //
    // Fail-open when the tenant_plugins table doesn't exist yet (PostgreSQL
    // error code 42P01 — "relation does not exist"). The table is created by
    // Spec 004 (Plugin Lifecycle), which may not be migrated in all
    // environments (e.g. test DBs running Spec 009/011 only). Once Spec 004
    // migrations are applied the guard will enforce plugin existence correctly.
    if (dto.resourceType === 'plugin') {
      try {
        const pluginRows = await this.db.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "pluginId" AS id FROM tenant_plugins
           WHERE "tenantId" = ${tenantContext.tenantId}
           AND "pluginId" = ${dto.resourceId}
           LIMIT 1`
        );
        if (pluginRows.length === 0) {
          throw createWorkspaceResourceError(
            `Plugin ${dto.resourceId} is not enabled for tenant ${tenantContext.tenantId}`,
            'PLUGIN_NOT_FOUND',
            404,
            {
              resourceType: dto.resourceType,
              resourceId: dto.resourceId,
              tenantId: tenantContext.tenantId,
            }
          );
        }
      } catch (guardError) {
        // Re-throw domain errors (PLUGIN_NOT_FOUND, etc.) — they have a
        // `.statusCode` property set by createWorkspaceResourceError().
        if ((guardError as WorkspaceResourceError).statusCode) {
          throw guardError;
        }

        // Prisma wraps raw-query failures as PrismaClientKnownRequestError
        // with `.code === 'P2010'`. The original PostgreSQL error code
        // (e.g. '42P01' — undefined_table) is embedded in the message.
        //
        // Fail-open specifically for the missing-table case (42P01): the
        // tenant_plugins table is created by Spec 004 (Plugin Lifecycle)
        // migrations, which may not be applied in all environments (e.g.
        // test DBs that only have Spec 009/011 schema). Once Spec 004 is
        // fully migrated the guard will enforce plugin existence correctly.
        const prismaCode = (guardError as { code?: string }).code;
        const errorMessage = (guardError as Error).message ?? '';
        const isMissingTable = prismaCode === 'P2010' && errorMessage.includes('42P01');

        if (!isMissingTable) {
          // Unexpected DB error — propagate
          throw guardError;
        }
        this.log.debug(
          { tenantId: tenantContext.tenantId, resourceId: dto.resourceId },
          'tenant_plugins table not found — skipping plugin existence guard (Spec 004 not yet migrated)'
        );
      }
    }

    // ── Phase 2: serializable transaction (definitive checks + INSERT) ────────
    //
    // Re-check workspace existence and sharing settings inside the transaction
    // with a FOR UPDATE lock to eliminate the TOCTOU race: concurrent requests
    // cannot both pass the duplicate check and insert the same row.
    const createdResource = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const workspacesTable = Prisma.raw(`"${schemaName}"."workspaces"`);
      const resourcesTable = Prisma.raw(`"${schemaName}"."workspace_resources"`);

      // Lock the workspace row to serialise concurrent share operations
      const workspace = await tx.$queryRaw<Array<{ id: string; settings: unknown }>>(
        Prisma.sql`SELECT id, settings FROM ${workspacesTable}
         WHERE id = ${workspaceId} LIMIT 1 FOR UPDATE`
      );

      if (workspace.length === 0) {
        throw new Error(`Workspace not found: ${workspaceId}`);
      }

      const wsSettings = (workspace[0].settings as Record<string, unknown>) || {};
      const allowSharing = wsSettings.allowCrossWorkspaceSharing === true;

      if (!allowSharing) {
        throw createWorkspaceResourceError(
          'Cross-workspace sharing is disabled for this workspace',
          'SHARING_DISABLED',
          403,
          { workspaceId, allowCrossWorkspaceSharing: false }
        );
      }

      // Check duplicate — inside the same transaction (after the FOR UPDATE lock)
      const existingResource = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM ${resourcesTable}
         WHERE workspace_id = ${workspaceId}
         AND resource_type = ${dto.resourceType}
         AND resource_id = ${dto.resourceId}
         LIMIT 1`
      );

      if (existingResource.length > 0) {
        throw createWorkspaceResourceError(
          `Resource '${dto.resourceType}:${dto.resourceId}' is already shared with workspace ${workspaceId}`,
          'RESOURCE_ALREADY_SHARED',
          409,
          { workspaceId, resourceType: dto.resourceType, resourceId: dto.resourceId }
        );
      }

      // Generate resource link ID
      const idResult = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT gen_random_uuid()::text as id
      `;
      const newResourceId = idResult[0].id;

      // Insert workspace resource
      await tx.$executeRaw`
        INSERT INTO ${resourcesTable}
        (id, workspace_id, resource_type, resource_id, created_at)
        VALUES (
          ${newResourceId},
          ${workspaceId},
          ${dto.resourceType},
          ${dto.resourceId},
          NOW()
        )
      `;

      // Query the created resource to return a fully-typed row
      const result = await tx.$queryRaw<Array<WorkspaceResourceRow>>`
        SELECT id, workspace_id, resource_type, resource_id, created_at
        FROM ${resourcesTable}
        WHERE id = ${newResourceId}
      `;

      return result[0];
    });

    // Log successful share
    this.log.info(
      {
        workspaceId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
        userId,
        tenantId: tenantContext.tenantId,
      },
      `Shared resource '${dto.resourceType}:${dto.resourceId}' with workspace ${workspaceId}`
    );

    // Publish event (best-effort, don't fail if event publishing fails)
    if (this.eventBus) {
      try {
        const event = createWorkspaceEvent<ResourceSharedData>(WORKSPACE_EVENTS.RESOURCE_SHARED, {
          aggregateId: workspaceId,
          tenantId: tenantContext.tenantId,
          userId,
          workspaceId,
          data: {
            workspaceId,
            resourceType: dto.resourceType,
            resourceId: dto.resourceId,
            sharedBy: userId,
          },
        });

        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.resource.shared'
          event.data,
          {
            tenantId: tenantContext.tenantId,
            workspaceId,
            userId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          {
            workspaceId,
            resourceType: dto.resourceType,
            resourceId: dto.resourceId,
            error: String(eventError),
          },
          'Failed to publish RESOURCE_SHARED event'
        );
      }
    }

    // Map to camelCase so Fastify's JSON serializer (fast-json-stringify) can
    // match the response schema fields (workspaceId, resourceType, etc.)
    return toWorkspaceResource(createdResource);
  }

  /**
   * Unshare a resource from a workspace
   *
   * @param workspaceId - Workspace to remove resource from
   * @param resourceId - Workspace resource link ID (NOT the resource's own ID)
   * @param userId - User performing the unshare (must be ADMIN)
   * @param tenantCtx - Optional tenant context
   * @returns void
   * @throws Error if resource link not found
   */
  async unshareResource(
    workspaceId: string,
    resourceId: string,
    userId: string,
    tenantCtx?: TenantContext
  ): Promise<void> {
    const tenantContext = tenantCtx || getTenantContext();

    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    // Query resource before deletion to get details for event
    const resourceLink = await this.db.$queryRaw<Array<WorkspaceResourceRow>>(
      Prisma.sql`SELECT id, workspace_id, resource_type, resource_id, created_at
       FROM ${Prisma.raw(`"${schemaName}"."workspace_resources"`)}
       WHERE id = ${resourceId} AND workspace_id = ${workspaceId}
       LIMIT 1`
    );

    if (resourceLink.length === 0) {
      throw createWorkspaceResourceError(
        `Resource link not found: ${resourceId}`,
        'RESOURCE_NOT_FOUND',
        404,
        { workspaceId, resourceId }
      );
    }

    const resource = resourceLink[0];

    // Delete within tenant schema transaction
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      const tableName = Prisma.raw(`"${schemaName}"."workspace_resources"`);
      await tx.$executeRaw`
        DELETE FROM ${tableName}
        WHERE id = ${resourceId} AND workspace_id = ${workspaceId}
      `;
    });

    // Log successful unshare
    this.log.info(
      {
        workspaceId,
        resourceType: resource.resource_type,
        resourceId: resource.resource_id,
        userId,
        tenantId: tenantContext.tenantId,
      },
      `Unshared resource '${resource.resource_type}:${resource.resource_id}' from workspace ${workspaceId}`
    );

    // Publish event (best-effort)
    if (this.eventBus) {
      try {
        const event = createWorkspaceEvent<ResourceUnsharedData>(
          WORKSPACE_EVENTS.RESOURCE_UNSHARED,
          {
            aggregateId: workspaceId,
            tenantId: tenantContext.tenantId,
            userId,
            workspaceId,
            data: {
              workspaceId,
              resourceType: resource.resource_type,
              resourceId: resource.resource_id,
              unsharedBy: userId,
            },
          }
        );

        await this.eventBus.publish(
          'plexica.workspace.lifecycle', // topic
          event.type, // event type: 'core.workspace.resource.unshared'
          event.data,
          {
            tenantId: tenantContext.tenantId,
            workspaceId,
            userId,
          }
        );
      } catch (eventError) {
        this.log.warn(
          {
            workspaceId,
            resourceType: resource.resource_type,
            resourceId: resource.resource_id,
            error: String(eventError),
          },
          'Failed to publish RESOURCE_UNSHARED event'
        );
      }
    }
  }

  /**
   * List shared resources for a workspace with optional filtering and pagination
   *
   * @param workspaceId - Workspace to list resources for
   * @param dto - Query parameters (resourceType filter, limit, offset)
   * @param tenantCtx - Optional tenant context
   * @returns Array of workspace resources with pagination metadata
   */
  async listResources(workspaceId: string, dto: ListSharedResourcesDto, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();

    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    // Parse query parameters (Zod already validated them)
    const limit = dto.limit;
    const offset = dto.offset;
    const resourceType = dto.resourceType;

    // Build query with optional resourceType filter
    const tableName = Prisma.raw(`"${schemaName}"."workspace_resources"`);

    let resources: Array<WorkspaceResourceRow>;
    let totalCount: number;

    if (resourceType) {
      // Filter by resource type
      resources = await this.db.$queryRaw<Array<WorkspaceResourceRow>>`
        SELECT id, workspace_id, resource_type, resource_id, created_at
        FROM ${tableName}
        WHERE workspace_id = ${workspaceId} AND resource_type = ${resourceType}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const countResult = await this.db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM ${tableName}
        WHERE workspace_id = ${workspaceId} AND resource_type = ${resourceType}
      `;
      totalCount = countResult[0].count;
    } else {
      // No filter, get all resources
      resources = await this.db.$queryRaw<Array<WorkspaceResourceRow>>`
        SELECT id, workspace_id, resource_type, resource_id, created_at
        FROM ${tableName}
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const countResult = await this.db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int as count
        FROM ${tableName}
        WHERE workspace_id = ${workspaceId}
      `;
      totalCount = countResult[0].count;
    }

    // Log query (debug level)
    this.log.debug(
      {
        workspaceId,
        resourceType,
        limit,
        offset,
        resultCount: resources.length,
        totalCount,
        tenantId: tenantContext.tenantId,
      },
      `Listed ${resources.length} resources for workspace ${workspaceId}`
    );

    // Map each row to camelCase so Fastify serializer matches response schema
    return {
      data: resources.map(toWorkspaceResource),
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + resources.length < totalCount,
      },
    };
  }

  /**
   * Get a specific workspace resource link
   *
   * @param workspaceId - Workspace ID
   * @param resourceId - Workspace resource link ID
   * @param tenantCtx - Optional tenant context
   * @returns Workspace resource or null if not found
   */
  async getResource(workspaceId: string, resourceId: string, tenantCtx?: TenantContext) {
    const tenantContext = tenantCtx || getTenantContext();

    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    const resources = await this.db.$queryRaw<Array<WorkspaceResourceRow>>(
      Prisma.sql`SELECT id, workspace_id, resource_type, resource_id, created_at
       FROM ${Prisma.raw(`"${schemaName}"."workspace_resources"`)}
       WHERE id = ${resourceId} AND workspace_id = ${workspaceId}
       LIMIT 1`
    );

    if (resources.length === 0) {
      return null;
    }

    // Map to camelCase for consistent public interface
    return toWorkspaceResource(resources[0]);
  }

  /**
   * Check if a specific resource is shared with a workspace
   *
   * Utility method for other services to check resource sharing status.
   *
   * @param workspaceId - Workspace ID
   * @param resourceType - Type of resource (e.g., "plugin", "template")
   * @param resourceId - Resource's own ID (NOT the workspace_resources link ID)
   * @param tenantCtx - Optional tenant context
   * @returns true if shared, false otherwise
   */
  async isResourceShared(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
    tenantCtx?: TenantContext
  ): Promise<boolean> {
    const tenantContext = tenantCtx || getTenantContext();

    if (!tenantContext) {
      throw new Error('No tenant context available');
    }

    const schemaName = tenantContext.schemaName;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    const resources = await this.db.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM ${Prisma.raw(`"${schemaName}"."workspace_resources"`)}
       WHERE workspace_id = ${workspaceId}
       AND resource_type = ${resourceType}
       AND resource_id = ${resourceId}
       LIMIT 1`
    );

    return resources.length > 0;
  }
}
