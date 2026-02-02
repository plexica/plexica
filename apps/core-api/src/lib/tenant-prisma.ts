import { PrismaClient } from '@plexica/database';
import type { TenantContext } from '../middleware/tenant-context.js';

/**
 * Tenant-aware Prisma wrapper
 *
 * This class provides a structured way to execute Prisma operations
 * within a specific tenant schema context.
 *
 * Usage:
 * const tenantDb = new TenantPrisma(db, tenantContext);
 * const workspaces = await tenantDb.workspace.findMany({ ... });
 */
export class TenantPrisma {
  private prisma: PrismaClient;
  private schemaName: string;
  private tenantId: string;

  constructor(prisma: PrismaClient, tenantContext: TenantContext) {
    this.prisma = prisma;
    this.schemaName = tenantContext.schemaName;
    this.tenantId = tenantContext.tenantId;

    // Validate schema name to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(this.schemaName)) {
      throw new Error(`Invalid schema name: ${this.schemaName}`);
    }
  }

  /**
   * Execute a callback within the tenant schema context
   */
  async execute<T>(callback: (client: PrismaClient) => Promise<T>): Promise<T> {
    // Set search path to tenant schema
    await this.prisma.$executeRawUnsafe(`SET LOCAL search_path TO "${this.schemaName}", public`);

    try {
      return await callback(this.prisma);
    } finally {
      // Reset to default (done automatically at transaction end, but explicit is safer)
      await this.prisma.$executeRawUnsafe(`SET search_path TO public, core`);
    }
  }

  /**
   * Execute within a transaction with tenant schema context
   */
  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // Set LOCAL search path within transaction
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${this.schemaName}", public`);

      return await callback(tx);
    });
  }

  /**
   * Helper to get the schema name (for raw queries)
   */
  getSchemaName(): string {
    return this.schemaName;
  }

  /**
   * Helper to get the tenant ID
   */
  getTenantId(): string {
    return this.tenantId;
  }

  /**
   * Access the underlying Prisma client
   * Use this when you need to bypass the tenant context (rare)
   */
  getRawClient(): PrismaClient {
    return this.prisma;
  }
}

/**
 * Create a tenant-aware Prisma instance
 */
export function createTenantPrisma(
  prisma: PrismaClient,
  tenantContext: TenantContext
): TenantPrisma {
  return new TenantPrisma(prisma, tenantContext);
}
