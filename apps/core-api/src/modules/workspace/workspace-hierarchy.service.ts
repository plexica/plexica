/**
 * WorkspaceHierarchyService
 *
 * Encapsulates all hierarchy-specific query and validation logic for the
 * materialised path pattern (ADR-013). Separated from WorkspaceService to
 * maintain single responsibility.
 *
 * See: Spec 011 plan.md §4.1, ADR-013 (Materialised Path)
 */

import { PrismaClient, Prisma } from '@plexica/database';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { db } from '../../lib/db.js';
import { logger } from '../../lib/logger.js';
import type { TenantContext } from '../../middleware/tenant-context.js';
import type {
  WorkspaceHierarchyRow,
  HierarchyFields,
  AggregatedCounts,
  TreeNode,
} from './types/hierarchy.types.js';

/** Cache configuration constants — shared with WorkspaceService */
const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Maximum depth allowed for a workspace hierarchy.
 * Root (depth=0) → child (depth=1) → grandchild (depth=2).
 * A parent at depth=2 would produce a child at depth=3, which is rejected.
 */
const MAX_DEPTH = 2;

export class WorkspaceHierarchyService {
  private db: PrismaClient;
  private cache?: Redis;
  private log: Logger;

  constructor(customDb?: PrismaClient, cache?: Redis, customLogger?: Logger) {
    this.db = customDb ?? db;
    this.cache = cache;
    this.log = customLogger ?? logger;
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate that a parent workspace exists and the requesting user is ADMIN
   * of that workspace. Returns the parent row on success.
   *
   * Throws:
   *   - PARENT_WORKSPACE_NOT_FOUND (404-equivalent) when parent does not exist
   *   - PARENT_PERMISSION_DENIED (403-equivalent) when user is not ADMIN
   */
  async validateParentAccess(
    parentId: string,
    userId: string,
    tenantCtx: TenantContext
  ): Promise<WorkspaceHierarchyRow> {
    const { schemaName, tenantId } = tenantCtx;
    this.assertValidSchema(schemaName);

    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);
    const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);

    const rows = await this.db.$queryRaw<WorkspaceHierarchyRow[]>(
      Prisma.sql`SELECT w.*
        FROM ${wsTable} w
        WHERE w.id = ${parentId}
          AND w.tenant_id = ${tenantId}
        LIMIT 1`
    );

    if (rows.length === 0) {
      const err = new Error(`Parent workspace '${parentId}' not found`);
      (err as NodeJS.ErrnoException).code = 'PARENT_WORKSPACE_NOT_FOUND';
      throw err;
    }

    const parent = rows[0];

    // Verify the caller is ADMIN of the parent
    const memberRows = await this.db.$queryRaw<Array<{ role: string }>>(
      Prisma.sql`SELECT role
        FROM ${membersTable}
        WHERE workspace_id = ${parentId}
          AND user_id = ${userId}
        LIMIT 1`
    );

    if (memberRows.length === 0 || memberRows[0].role !== 'ADMIN') {
      const err = new Error(`User '${userId}' is not ADMIN of parent workspace '${parentId}'`);
      (err as NodeJS.ErrnoException).code = 'PARENT_PERMISSION_DENIED';
      throw err;
    }

    this.log.debug({ parentId, userId, tenantId }, 'workspace-hierarchy: parent access validated');

    return parent;
  }

  /**
   * Compute depth and path for a new workspace.
   *
   * - Root workspace (no parent): depth=0, path=<newId>
   * - Child workspace: depth=parent.depth+1, path=parent.path+'/'+newId
   */
  computeHierarchyFields(
    parentWorkspace: WorkspaceHierarchyRow | null,
    workspaceId: string
  ): HierarchyFields {
    if (!parentWorkspace) {
      return { depth: 0, path: workspaceId };
    }
    return {
      depth: parentWorkspace.depth + 1,
      path: `${parentWorkspace.path}/${workspaceId}`,
    };
  }

  /**
   * Enforce maximum depth constraint.
   *
   * Throws HIERARCHY_DEPTH_EXCEEDED (400-equivalent) when the parent is already
   * at MAX_DEPTH (because the child would be at MAX_DEPTH+1).
   */
  validateDepthConstraint(parentDepth: number): void {
    if (parentDepth >= MAX_DEPTH) {
      const err = new Error(
        `Cannot create child workspace: maximum hierarchy depth of ${MAX_DEPTH} exceeded`
      );
      (err as NodeJS.ErrnoException).code = 'HIERARCHY_DEPTH_EXCEEDED';
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Query methods
  // ---------------------------------------------------------------------------

  /**
   * Get all descendant workspaces of a given root path.
   * Uses materialised path LIKE query (sargable via varchar_pattern_ops index).
   *
   * Results are ordered by depth ASC, name ASC.
   */
  async getDescendants(
    rootPath: string,
    tenantCtx: TenantContext
  ): Promise<WorkspaceHierarchyRow[]> {
    const { schemaName, tenantId } = tenantCtx;
    this.assertValidSchema(schemaName);

    const cacheKey = `tenant:${tenantId}:workspace:hierarchy:descendants:${rootPath}`;
    const cached = await this.getFromCache<WorkspaceHierarchyRow[]>(cacheKey);
    if (cached) return cached;

    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);
    const pathPrefix = `${rootPath}/%`;

    const rows = await this.db.$queryRaw<WorkspaceHierarchyRow[]>(
      Prisma.sql`SELECT *
        FROM ${wsTable}
        WHERE path LIKE ${pathPrefix}
          AND tenant_id = ${tenantId}
        ORDER BY depth ASC, name ASC`
    );

    await this.setInCache(cacheKey, rows);
    return rows;
  }

  /**
   * Get paginated direct children of a parent workspace.
   * Default limit 50, max 100.
   */
  async getDirectChildren(
    parentId: string,
    tenantCtx: TenantContext,
    limit = 50,
    offset = 0
  ): Promise<WorkspaceHierarchyRow[]> {
    const { schemaName, tenantId } = tenantCtx;
    this.assertValidSchema(schemaName);

    const effectiveLimit = Math.min(limit, 100);
    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);

    return this.db.$queryRaw<WorkspaceHierarchyRow[]>(
      Prisma.sql`SELECT *
        FROM ${wsTable}
        WHERE parent_id = ${parentId}
          AND tenant_id = ${tenantId}
        ORDER BY name ASC
        LIMIT ${effectiveLimit}
        OFFSET ${offset}`
    );
  }

  /**
   * Build a nested TreeNode tree for a user.
   *
   * Only includes workspaces where:
   *   - The user is a direct member, OR
   *   - The workspace is an ancestor of a workspace where the user is a member
   *     (included for context, with memberRole = null)
   *
   * Results are ordered by depth, then name.
   * Results are cached per-user for CACHE_TTL_SECONDS.
   */
  async getTree(userId: string, tenantCtx: TenantContext): Promise<TreeNode[]> {
    const { schemaName, tenantId } = tenantCtx;
    this.assertValidSchema(schemaName);

    const cacheKey = `tenant:${tenantId}:workspace:hierarchy:tree:${userId}`;
    const cached = await this.getFromCache<TreeNode[]>(cacheKey);
    if (cached) return cached;

    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);
    const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);

    // Fetch all workspaces visible to the user:
    // 1. Direct member workspaces
    // 2. Ancestor workspaces of member workspaces (path prefix matching)
    //
    // direct_member_count is computed via a pre-aggregated CTE (not a
    // correlated subquery per row) to avoid O(N) DB round-trips (M2 fix).
    const rows = await this.db.$queryRaw<
      Array<WorkspaceHierarchyRow & { member_role: string | null; direct_member_count: bigint }>
    >(
      Prisma.sql`
        WITH user_workspaces AS (
          SELECT w.*, wm.role as member_role
          FROM ${wsTable} w
          JOIN ${membersTable} wm ON w.id = wm.workspace_id
          WHERE wm.user_id = ${userId}
            AND w.tenant_id = ${tenantId}
        ),
        ancestor_paths AS (
          SELECT DISTINCT unnest(
            ARRAY(
              SELECT path_segment
              FROM user_workspaces uw,
                LATERAL (
                  SELECT regexp_split_to_table(uw.path, '/') AS path_segment
                ) parts
              WHERE path_segment != uw.id
            )
          ) AS ancestor_id
        ),
        member_counts AS (
          SELECT workspace_id, COUNT(*) AS cnt
          FROM ${membersTable}
          GROUP BY workspace_id
        ),
        visible_workspaces AS (
          SELECT w.id, w.parent_id, w.depth, w.path, w.slug, w.name,
                 w.description, w.tenant_id, w.settings, w.created_at, w.updated_at,
                 uw.member_role,
                 COALESCE(mc.cnt, 0) AS direct_member_count
          FROM ${wsTable} w
          LEFT JOIN user_workspaces uw ON w.id = uw.id
          LEFT JOIN member_counts mc ON mc.workspace_id = w.id
          WHERE w.id IN (SELECT id FROM user_workspaces)
             OR w.id IN (SELECT ancestor_id FROM ancestor_paths)
        )
        SELECT * FROM visible_workspaces
        ORDER BY depth ASC, name ASC
      `
    );

    const tree = this.buildTree(rows);
    await this.setInCache(cacheKey, tree);
    return tree;
  }

  /**
   * Get aggregated member count and child count across a workspace subtree.
   * Uses a single-pass JOIN (not correlated subqueries) for performance.
   * Results are cached for CACHE_TTL_SECONDS.
   */
  async getAggregatedCounts(
    workspacePath: string,
    tenantCtx: TenantContext
  ): Promise<AggregatedCounts> {
    const { schemaName, tenantId } = tenantCtx;
    this.assertValidSchema(schemaName);

    const cacheKey = `tenant:${tenantId}:workspace:hierarchy:agg_counts:${workspacePath}`;
    const cached = await this.getFromCache<AggregatedCounts>(cacheKey);
    if (cached) return cached;

    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);
    const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);
    const pathPrefix = `${workspacePath}/%`;
    // selfId is the last segment of the path — exclude it from child_count
    // (the CASE must exclude the workspace being queried, not the tree root).
    const selfId = workspacePath.split('/').pop()!;

    // Single-pass JOIN: gets member counts and child counts together.
    // Avoids two correlated subqueries (plan.md §14.3).
    const result = await this.db.$queryRaw<Array<{ member_count: bigint; child_count: bigint }>>(
      Prisma.sql`
        SELECT
          COUNT(DISTINCT wm.user_id) AS member_count,
          COUNT(DISTINCT CASE WHEN w.id != ${selfId} THEN w.id END) AS child_count
        FROM ${wsTable} w
        LEFT JOIN ${membersTable} wm ON wm.workspace_id = w.id
        WHERE w.tenant_id = ${tenantId}
          AND (w.path = ${workspacePath} OR w.path LIKE ${pathPrefix})
      `
    );

    const counts: AggregatedCounts = {
      aggregatedMemberCount: Number(result[0]?.member_count ?? 0),
      aggregatedChildCount: Number(result[0]?.child_count ?? 0),
    };

    await this.setInCache(cacheKey, counts);
    return counts;
  }

  /**
   * Check whether a user is ADMIN in any ancestor workspace.
   * Ancestor IDs are extracted from the materialised path (path = "id1/id2/id3").
   */
  async isAncestorAdmin(
    userId: string,
    workspacePath: string,
    tenantCtx: TenantContext
  ): Promise<boolean> {
    const { schemaName } = tenantCtx;
    this.assertValidSchema(schemaName);

    const ancestorIds = workspacePath.split('/').slice(0, -1); // exclude self (last segment)
    if (ancestorIds.length === 0) return false;

    const membersTable = Prisma.raw(`"${schemaName}"."workspace_members"`);

    const result = await this.db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS count
        FROM ${membersTable}
        WHERE user_id = ${userId}
          AND workspace_id = ANY(${ancestorIds}::uuid[])
          AND role = 'ADMIN'`
    );

    return Number(result[0]?.count ?? 0) > 0;
  }

  /**
   * Get the ancestor chain for a workspace path (root first, excluding self).
   * Used for breadcrumb navigation and hierarchical guard checks.
   */
  async getAncestorChain(
    workspacePath: string,
    tenantCtx: TenantContext
  ): Promise<WorkspaceHierarchyRow[]> {
    const { schemaName, tenantId } = tenantCtx;
    this.assertValidSchema(schemaName);

    const ancestorIds = workspacePath.split('/').slice(0, -1);
    if (ancestorIds.length === 0) return [];

    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);

    return this.db.$queryRaw<WorkspaceHierarchyRow[]>(
      Prisma.sql`SELECT *
        FROM ${wsTable}
        WHERE id = ANY(${ancestorIds}::uuid[])
          AND tenant_id = ${tenantId}
        ORDER BY depth ASC`
    );
  }

  /**
   * Check whether a workspace has any direct children.
   */
  async hasChildren(workspaceId: string, tenantCtx: TenantContext): Promise<boolean> {
    const { schemaName, tenantId } = tenantCtx;
    this.assertValidSchema(schemaName);

    const wsTable = Prisma.raw(`"${schemaName}"."workspaces"`);

    const result = await this.db.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`SELECT COUNT(*) AS count
        FROM ${wsTable}
        WHERE parent_id = ${workspaceId}
          AND tenant_id = ${tenantId}`
    );

    return Number(result[0]?.count ?? 0) > 0;
  }

  // ---------------------------------------------------------------------------
  // Cache invalidation helpers (called by WorkspaceService on mutations)
  // ---------------------------------------------------------------------------

  /**
   * Invalidate descendant and aggregated count caches for a workspace path.
   * Call this whenever a workspace is created, reparented, or deleted.
   *
   * All cache keys are computed deterministically from the materialised path —
   * no KEYS pattern scan is used (Redis KEYS is O(N) and blocks the server).
   * Ancestor paths are reconstructed as prefixes of workspacePath.
   */
  async invalidateHierarchyCache(workspacePath: string, tenantId: string): Promise<void> {
    if (!this.cache) return;

    const keys: string[] = [
      `tenant:${tenantId}:workspace:hierarchy:descendants:${workspacePath}`,
      `tenant:${tenantId}:workspace:hierarchy:agg_counts:${workspacePath}`,
    ];

    // Ancestor paths are all prefix segments of workspacePath.
    // e.g. path "root/parent/child" → ancestor paths "root", "root/parent"
    // Each ancestor's agg_counts cache entry is keyed by its own path.
    const segments = workspacePath.split('/');
    for (let i = 1; i < segments.length; i++) {
      const ancestorPath = segments.slice(0, i).join('/');
      keys.push(`tenant:${tenantId}:workspace:hierarchy:agg_counts:${ancestorPath}`);
      keys.push(`tenant:${tenantId}:workspace:hierarchy:descendants:${ancestorPath}`);
    }

    try {
      // Delete all keys in a single pipeline to minimise round-trips.
      if (keys.length > 0) {
        await this.cache.del(...keys);
      }
    } catch (err) {
      this.log.warn(
        { err, workspacePath, tenantId },
        'workspace-hierarchy: cache invalidation failed'
      );
    }
  }

  /**
   * Invalidate the tree cache for a specific user within a tenant.
   *
   * Call this after any workspace membership or hierarchy mutation that
   * affects what workspaces a user can see. The tree cache is keyed by
   * userId, so only the affected user's cache needs to be dropped.
   *
   * If userId is not known (e.g. bulk operations), pass null to skip
   * (the cache will expire naturally after CACHE_TTL_SECONDS).
   */
  async invalidateTreeCache(userId: string | null, tenantId: string): Promise<void> {
    if (!this.cache || !userId) return;
    const key = `tenant:${tenantId}:workspace:hierarchy:tree:${userId}`;
    try {
      await this.cache.del(key);
    } catch (err) {
      this.log.warn(
        { err, userId, tenantId },
        'workspace-hierarchy: tree cache invalidation failed'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Asserts the schema name is safe (alphanumeric + underscore).
   * Prevents SQL injection via schema name interpolation.
   */
  private assertValidSchema(schemaName: string): void {
    if (!/^[a-z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }
  }

  /**
   * Build a nested TreeNode structure from a flat list of workspace rows.
   * Assumes rows are ordered by depth ASC.
   */
  private buildTree(
    rows: Array<WorkspaceHierarchyRow & { member_role: string | null; direct_member_count: bigint }>
  ): TreeNode[] {
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    for (const row of rows) {
      const node: TreeNode = {
        id: row.id,
        slug: row.slug,
        name: row.name,
        description: row.description,
        depth: row.depth,
        path: row.path,
        parentId: row.parent_id,
        memberRole: row.member_role,
        _count: {
          members: Number(row.direct_member_count ?? 0),
          children: 0,
        },
        children: [],
      };
      nodeMap.set(row.id, node);
    }

    for (const row of rows) {
      const node = nodeMap.get(row.id)!;
      if (row.parent_id && nodeMap.has(row.parent_id)) {
        const parent = nodeMap.get(row.parent_id)!;
        parent.children.push(node);
        parent._count.children++;
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /** Read a value from Redis cache. Returns null on miss or error. */
  private async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.cache) return null;
    try {
      const raw = await this.cache.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.log.warn({ err, key }, 'workspace-hierarchy: cache read failed');
      return null;
    }
  }

  /** Write a value to Redis cache with the standard TTL. */
  private async setInCache<T>(key: string, value: T): Promise<void> {
    if (!this.cache) return;
    try {
      await this.cache.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch (err) {
      this.log.warn({ err, key }, 'workspace-hierarchy: cache write failed');
    }
  }
}

/** Singleton instance for use in route handlers */
export const workspaceHierarchyService = new WorkspaceHierarchyService();
