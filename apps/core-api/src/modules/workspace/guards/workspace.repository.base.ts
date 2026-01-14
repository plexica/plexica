import { getWorkspaceIdOrThrow, getWorkspaceId } from '../../../middleware/tenant-context.js';

/**
 * Base Repository for Workspace-Scoped Resources
 *
 * Provides helper methods to automatically filter queries by workspace.
 * Extend this class for any repository that needs workspace isolation.
 *
 * @example
 * ```typescript
 * class ContactRepository extends WorkspaceRepositoryBase {
 *   async findAll() {
 *     const client = this.getClient();
 *     return client.contact.findMany({
 *       where: this.applyWorkspaceFilter({})
 *     });
 *   }
 *
 *   async findById(id: string) {
 *     const client = this.getClient();
 *     return client.contact.findUnique({
 *       where: this.applyWorkspaceFilter({ id })
 *     });
 *   }
 * }
 * ```
 */
export abstract class WorkspaceRepositoryBase {
  /**
   * Get current workspace ID from context
   * @throws Error if no workspace context is set
   */
  protected getWorkspaceId(): string {
    return getWorkspaceIdOrThrow();
  }

  /**
   * Get current workspace ID (returns undefined if not set)
   * Use this for optional workspace filtering
   */
  protected getWorkspaceIdOptional(): string | undefined {
    return getWorkspaceId();
  }

  /**
   * Apply workspace filter to a Prisma query
   * Merges the provided query with workspaceId filter
   *
   * @param query - Existing query object
   * @returns Query object with workspaceId filter added
   *
   * @example
   * ```typescript
   * // Simple case
   * const where = this.applyWorkspaceFilter({ status: 'active' });
   * // Result: { workspaceId: 'xxx', status: 'active' }
   *
   * // With complex query
   * const where = this.applyWorkspaceFilter({
   *   OR: [
   *     { status: 'active' },
   *     { priority: 'high' }
   *   ]
   * });
   * // Result: {
   * //   workspaceId: 'xxx',
   * //   OR: [
   * //     { status: 'active' },
   * //     { priority: 'high' }
   * //   ]
   * // }
   * ```
   */
  protected applyWorkspaceFilter<T extends object>(query: T): T & { workspaceId: string } {
    const workspaceId = this.getWorkspaceId();
    return {
      ...query,
      workspaceId,
    };
  }

  /**
   * Apply optional workspace filter
   * Only adds workspaceId if one is set in context
   */
  protected applyWorkspaceFilterOptional<T extends object>(
    query: T
  ): T | (T & { workspaceId: string }) {
    const workspaceId = this.getWorkspaceIdOptional();
    if (!workspaceId) {
      return query;
    }
    return {
      ...query,
      workspaceId,
    };
  }

  /**
   * Check if workspace context is available
   */
  protected hasWorkspaceContext(): boolean {
    return this.getWorkspaceIdOptional() !== undefined;
  }
}

/**
 * Example usage in a specific repository
 */
export class ExampleContactRepository extends WorkspaceRepositoryBase {
  // Note: This is just an example. You would inject prismaClient in constructor

  /**
   * Find all contacts in current workspace
   */
  async findAll(prismaClient: any) {
    return prismaClient.contact.findMany({
      where: this.applyWorkspaceFilter({}),
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find contact by ID within current workspace
   */
  async findById(prismaClient: any, id: string) {
    return prismaClient.contact.findUnique({
      where: this.applyWorkspaceFilter({ id }),
    });
  }

  /**
   * Create contact in current workspace
   */
  async create(prismaClient: any, data: any) {
    const workspaceId = this.getWorkspaceId();
    return prismaClient.contact.create({
      data: {
        ...data,
        workspaceId,
      },
    });
  }

  /**
   * Update contact (automatically scoped to workspace)
   */
  async update(prismaClient: any, id: string, data: any) {
    return prismaClient.contact.update({
      where: this.applyWorkspaceFilter({ id }),
      data,
    });
  }

  /**
   * Delete contact (automatically scoped to workspace)
   */
  async delete(prismaClient: any, id: string) {
    return prismaClient.contact.delete({
      where: this.applyWorkspaceFilter({ id }),
    });
  }
}
