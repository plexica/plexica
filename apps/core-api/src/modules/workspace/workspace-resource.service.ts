import { PrismaClient, Prisma } from '@plexica/database';
import { EventBusService, WORKSPACE_EVENTS, createWorkspaceEvent } from '@plexica/event-bus';
import type { ResourceSharedData, ResourceUnsharedData } from '@plexica/event-bus';
import type { Logger } from 'pino';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import { getTenantContext, type TenantContext } from '../../middleware/tenant-context.js';
import type { ShareResourceDto, ListSharedResourcesDto } from './dto/index.js';

/**
 * Row type for workspace_resources table
 */
interface WorkspaceResourceRow {
  id: string;
  workspace_id: string;
  resource_type: string;
  resource_id: string;
  created_at: Date;
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

    // Check if cross-workspace sharing is enabled for this workspace
    const workspace = await this.db.$queryRaw<Array<{ id: string; settings: unknown }>>(
      Prisma.sql`SELECT id, settings FROM ${Prisma.raw(`"${schemaName}"."workspaces"`)}
       WHERE id = ${workspaceId} LIMIT 1`
    );

    if (workspace.length === 0) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const settings = (workspace[0].settings as Record<string, unknown>) || {};
    const allowSharing = settings.allowCrossWorkspaceSharing === true;

    if (!allowSharing) {
      const error = new Error('Cross-workspace sharing is disabled for this workspace');
      (error as any).code = 'SHARING_DISABLED';
      (error as any).statusCode = 403;
      (error as any).details = { workspaceId, allowCrossWorkspaceSharing: false };
      throw error;
    }

    // Check if resource is already shared (duplicate check)
    const existingResource = await this.db.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT id FROM ${Prisma.raw(`"${schemaName}"."workspace_resources"`)}
       WHERE workspace_id = ${workspaceId}
       AND resource_type = ${dto.resourceType}
       AND resource_id = ${dto.resourceId}
       LIMIT 1`
    );

    if (existingResource.length > 0) {
      const error = new Error(
        `Resource '${dto.resourceType}:${dto.resourceId}' is already shared with workspace ${workspaceId}`
      );
      (error as any).code = 'RESOURCE_ALREADY_SHARED';
      (error as any).statusCode = 409;
      (error as any).details = {
        workspaceId,
        resourceType: dto.resourceType,
        resourceId: dto.resourceId,
      };
      throw error;
    }

    // Create resource link within tenant schema transaction
    const createdResource = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.raw(`SET LOCAL search_path TO "${schemaName}", public`));

      // Generate resource link ID
      const idResult = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT gen_random_uuid()::text as id
      `;
      const newResourceId = idResult[0].id;

      // Insert workspace resource
      const tableName = Prisma.raw(`"${schemaName}"."workspace_resources"`);
      await tx.$executeRaw`
        INSERT INTO ${tableName}
        (id, workspace_id, resource_type, resource_id, created_at)
        VALUES (
          ${newResourceId},
          ${workspaceId},
          ${dto.resourceType},
          ${dto.resourceId},
          NOW()
        )
      `;

      // Query the created resource
      const result = await tx.$queryRaw<Array<WorkspaceResourceRow>>`
        SELECT id, workspace_id, resource_type, resource_id, created_at
        FROM ${tableName}
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

        await this.eventBus.publish(event.type, event.data, {
          tenantId: tenantContext.tenantId,
          workspaceId,
          userId,
        });
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

    // Return snake_case to match database schema
    return createdResource;
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
      const error = new Error(`Resource link not found: ${resourceId}`);
      (error as any).code = 'RESOURCE_NOT_FOUND';
      (error as any).statusCode = 404;
      (error as any).details = { workspaceId, resourceId };
      throw error;
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

        await this.eventBus.publish(event.type, event.data, {
          tenantId: tenantContext.tenantId,
          workspaceId,
          userId,
        });
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

    // Return snake_case to match database schema
    return {
      data: resources,
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

    // Return snake_case to match database schema
    return resources[0];
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
