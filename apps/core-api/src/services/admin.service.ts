/**
 * Admin Service
 *
 * Provides cross-tenant user management and admin operations
 * for the super-admin dashboard.
 *
 * Key architectural note: Users are stored in per-tenant PostgreSQL schemas
 * (e.g., tenant_acme_corp.users), NOT in the core schema. To list users
 * across tenants, we must query each tenant schema and union the results.
 */

import { TenantStatus, type PrismaClient } from '@plexica/database';
import { db } from '../lib/db.js';
import { redis } from '../lib/redis.js';

export interface SuperAdminRecord {
  id: string;
  keycloakId: string | null;
  email: string;
  name: string | null;
  createdAt: Date;
}

export interface CreateSuperAdminOptions {
  userId: string;
  email: string;
  grantedBy: string;
  name?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    redis: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    keycloak: { status: 'ok' | 'skipped' };
  };
  timestamp: string;
}

export class SuperAdminNotFoundError extends Error {
  readonly code = 'SUPER_ADMIN_NOT_FOUND';
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Super admin '${id}' not found`);
    this.name = 'SuperAdminNotFoundError';
  }
}

export class LastSuperAdminError extends Error {
  readonly code = 'LAST_SUPER_ADMIN';
  readonly statusCode = 409;
  constructor() {
    super('Cannot revoke the last super admin');
    this.name = 'LastSuperAdminError';
  }
}

// ============================================================================
// Interfaces
// ============================================================================

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roles: string[];
  createdAt: string;
}

export interface ListUsersOptions {
  page?: number;
  limit?: number;
  search?: string;
  tenantId?: string;
  role?: string;
}

export interface ListUsersResult {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserDetail extends AdminUser {
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: string;
  }>;
}

// Raw row shape returned from per-tenant SQL queries
interface RawUserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: Date;
  roles: string | null; // comma-separated from string_agg
}

// ============================================================================
// Service
// ============================================================================

export class AdminService {
  private db: PrismaClient;

  constructor(dbClient: PrismaClient = db) {
    this.db = dbClient;
  }

  /**
   * Validate a tenant slug to prevent SQL injection.
   * Only lowercase alphanumeric and hyphens, 1-50 chars.
   */
  private validateSlug(slug: string): void {
    const slugPattern = /^[a-z0-9-]{1,50}$/;
    if (!slugPattern.test(slug)) {
      throw new Error('Invalid tenant slug format');
    }
  }

  /**
   * Get the PostgreSQL schema name for a tenant slug.
   */
  private getSchemaName(slug: string): string {
    return `tenant_${slug.replace(/-/g, '_')}`;
  }

  /**
   * Check if a tenant schema exists in the database.
   */
  private async schemaExists(schemaName: string): Promise<boolean> {
    const result: Array<{ exists: boolean }> = await this.db.$queryRaw`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata 
        WHERE schema_name = ${schemaName}
      ) AS exists
    `;
    return result[0]?.exists === true;
  }

  /**
   * List users across all tenants with pagination, search, and filters.
   *
   * Strategy: Query each active tenant's schema for users, merge results,
   * then apply pagination. For performance at scale, consider a materialized
   * view or a denormalized cross-tenant users table.
   */
  async listUsers(options: ListUsersOptions = {}): Promise<ListUsersResult> {
    const { page = 1, limit = 50, search, tenantId, role } = options;

    // Get active tenants (only query schemas that exist)
    const tenantWhere: Record<string, unknown> = {
      status: { in: [TenantStatus.ACTIVE, TenantStatus.PROVISIONING] },
    };
    if (tenantId) {
      tenantWhere.id = tenantId;
    }

    const tenants = await this.db.tenant.findMany({
      where: tenantWhere,
      select: { id: true, slug: true, name: true },
    });

    if (tenants.length === 0) {
      return { users: [], total: 0, page, limit, totalPages: 0 };
    }

    // Query each tenant schema for users
    const allUsers: AdminUser[] = [];

    for (const tenant of tenants) {
      this.validateSlug(tenant.slug);
      const schemaName = this.getSchemaName(tenant.slug);

      // Check schema exists before querying
      const exists = await this.schemaExists(schemaName);
      if (!exists) {
        continue;
      }

      try {
        // Query users with their roles from the tenant schema
        // Using $queryRawUnsafe because schema names cannot be parameterized,
        // but we've validated the slug format above to prevent injection.
        const rawUsers: RawUserRow[] = await this.db.$queryRawUnsafe(`
          SELECT 
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.created_at,
            (
              SELECT string_agg(r.name, ',')
              FROM "${schemaName}"."user_roles" ur
              JOIN "${schemaName}"."roles" r ON ur.role_id = r.id
              WHERE ur.user_id = u.id
            ) AS roles
          FROM "${schemaName}"."users" u
          ORDER BY u.created_at DESC
        `);

        for (const row of rawUsers) {
          const userRoles = row.roles ? row.roles.split(',') : [];
          const firstName = row.first_name || '';
          const lastName = row.last_name || '';
          const name = [firstName, lastName].filter(Boolean).join(' ') || row.email;

          allUsers.push({
            id: row.id,
            email: row.email,
            name,
            firstName: row.first_name,
            lastName: row.last_name,
            tenantId: tenant.id,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            roles: userRoles,
            createdAt: row.created_at.toISOString(),
          });
        }
      } catch (error) {
        // Log but don't fail if a single tenant schema has issues
        console.warn(
          `Failed to query users from tenant schema ${schemaName}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    // Apply search filter
    let filteredUsers = allUsers;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = filteredUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(searchLower) ||
          u.email.toLowerCase().includes(searchLower) ||
          u.tenantName.toLowerCase().includes(searchLower)
      );
    }

    // Apply role filter
    if (role) {
      filteredUsers = filteredUsers.filter((u) => u.roles.includes(role));
    }

    // Sort by creation date (most recent first)
    filteredUsers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Paginate
    const total = filteredUsers.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedUsers = filteredUsers.slice(skip, skip + limit);

    return {
      users: paginatedUsers,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Get a single user by ID across all tenant schemas.
   * Returns user details including workspace memberships.
   */
  async getUserById(userId: string): Promise<UserDetail> {
    // Get all active tenants
    const tenants = await this.db.tenant.findMany({
      where: { status: { in: [TenantStatus.ACTIVE, TenantStatus.PROVISIONING] } },
      select: { id: true, slug: true, name: true },
    });

    for (const tenant of tenants) {
      this.validateSlug(tenant.slug);
      const schemaName = this.getSchemaName(tenant.slug);

      const exists = await this.schemaExists(schemaName);
      if (!exists) continue;

      try {
        // Look for user in this tenant schema
        const rawUsers: RawUserRow[] = await this.db.$queryRawUnsafe(
          `
          SELECT 
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.created_at,
            (
              SELECT string_agg(r.name, ',')
              FROM "${schemaName}"."user_roles" ur
              JOIN "${schemaName}"."roles" r ON ur.role_id = r.id
              WHERE ur.user_id = u.id
            ) AS roles
          FROM "${schemaName}"."users" u
          WHERE u.id = $1
        `,
          userId
        );

        if (rawUsers.length === 0) continue;

        const row = rawUsers[0];
        const userRoles = row.roles ? row.roles.split(',') : [];
        const firstName = row.first_name || '';
        const lastName = row.last_name || '';
        const name = [firstName, lastName].filter(Boolean).join(' ') || row.email;

        // Get workspace memberships
        interface RawWorkspaceRow {
          id: string;
          name: string;
          slug: string;
          role: string;
        }

        let workspaces: RawWorkspaceRow[] = [];
        try {
          workspaces = await this.db.$queryRawUnsafe(
            `
            SELECT 
              w.id,
              w.name,
              w.slug,
              wm.role
            FROM "${schemaName}"."workspace_members" wm
            JOIN "${schemaName}"."workspaces" w ON wm.workspace_id = w.id
            WHERE wm.user_id = $1
          `,
            userId
          );
        } catch {
          // Workspace tables may not exist in all schemas
        }

        return {
          id: row.id,
          email: row.email,
          name,
          firstName: row.first_name,
          lastName: row.last_name,
          tenantId: tenant.id,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          roles: userRoles,
          createdAt: row.created_at.toISOString(),
          workspaces: workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            slug: w.slug,
            role: w.role,
          })),
        };
      } catch {
        // Continue searching other schemas
      }
    }

    throw new Error(`User '${userId}' not found`);
  }

  // ============================================================================
  // Super Admin Management
  // ============================================================================

  /**
   * Get a single super admin record by ID.
   * Throws SuperAdminNotFoundError if not found.
   */
  async getSuperAdminById(id: string): Promise<SuperAdminRecord> {
    const record = await this.db.superAdmin.findUnique({ where: { id } });
    if (!record) {
      throw new SuperAdminNotFoundError(id);
    }
    return {
      id: record.id,
      keycloakId: record.keycloakId,
      email: record.email,
      name: record.name,
      createdAt: record.createdAt,
    };
  }

  /**
   * List all super admin records.
   */
  async listSuperAdmins(): Promise<SuperAdminRecord[]> {
    const records = await this.db.superAdmin.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return records.map((r) => ({
      id: r.id,
      keycloakId: r.keycloakId,
      email: r.email,
      name: r.name,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Grant super admin role to a user.
   */
  async createSuperAdmin(options: CreateSuperAdminOptions): Promise<SuperAdminRecord> {
    const record = await this.db.superAdmin.create({
      data: {
        keycloakId: options.userId,
        email: options.email,
        name: options.name ?? null,
      },
    });
    return {
      id: record.id,
      keycloakId: record.keycloakId,
      email: record.email,
      name: record.name,
      createdAt: record.createdAt,
    };
  }

  /**
   * Revoke super admin role by record ID.
   * Throws SuperAdminNotFoundError if not found.
   */
  async revokeSuperAdmin(id: string): Promise<void> {
    const existing = await this.db.superAdmin.findUnique({ where: { id } });
    if (!existing) {
      throw new SuperAdminNotFoundError(id);
    }
    // Last-super-admin guard (T008-25 / plan §6 Edge Case #6)
    const totalCount = await this.db.superAdmin.count();
    if (totalCount <= 1) {
      throw new LastSuperAdminError();
    }
    await this.db.superAdmin.delete({ where: { id } });
  }

  // ============================================================================
  // System Health
  // ============================================================================

  /**
   * Check health of database and Redis.
   */
  async getSystemHealth(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {
      database: { status: 'ok' },
      redis: { status: 'ok' },
      keycloak: { status: 'skipped' },
    };

    // Database check
    const dbStart = Date.now();
    try {
      await this.db.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - dbStart };
    } catch (err) {
      checks.database = {
        status: 'error',
        latencyMs: Date.now() - dbStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // Redis check
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'ok', latencyMs: Date.now() - redisStart };
    } catch (err) {
      checks.redis = {
        status: 'error',
        latencyMs: Date.now() - redisStart,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const anyError = checks.database.status === 'error' || checks.redis.status === 'error';
    const status: HealthCheckResult['status'] = anyError ? 'degraded' : 'healthy';

    return {
      status,
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}

// Singleton instance
export const adminService = new AdminService();
