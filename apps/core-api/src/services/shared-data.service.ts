/**
 * Shared Data Service
 *
 * Enables plugins to share state and data with each other through
 * a namespaced key-value store (M2.3)
 */

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { FastifyBaseLogger } from 'fastify';

// Shared data entry
export interface SharedDataEntry<T = any> {
  key: string;
  value: T;
  ownerId: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Set data options
export interface SetDataOptions {
  ttl?: number; // Time to live in seconds
}

export class SharedDataService {
  private readonly CACHE_PREFIX = 'shared:data:';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly logger: FastifyBaseLogger
  ) {}

  /**
   * Set shared data
   */
  async set<T = any>(
    tenantId: string,
    namespace: string,
    key: string,
    value: T,
    ownerId: string,
    options?: SetDataOptions
  ): Promise<void> {
    this.logger.debug({ tenantId, namespace, key, ownerId }, 'Setting shared data');

    try {
      const expiresAt = options?.ttl ? new Date(Date.now() + options.ttl * 1000) : null;

      await this.prisma.sharedPluginData.upsert({
        where: {
          tenantId_namespace_key: {
            tenantId,
            namespace,
            key,
          },
        },
        create: {
          tenantId,
          namespace,
          key,
          value: value as any,
          ownerId,
          expiresAt,
        },
        update: {
          value: value as any,
          ownerId,
          expiresAt,
          updatedAt: new Date(),
        },
      });

      // Invalidate cache
      await this.invalidateCache(tenantId, namespace, key);

      this.logger.debug('Shared data set successfully');
    } catch (error) {
      this.logger.error({ error, tenantId, namespace, key }, 'Failed to set shared data');
      throw new Error(
        `Failed to set shared data: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  /**
   * Get shared data
   */
  async get<T = any>(tenantId: string, namespace: string, key: string): Promise<T | null> {
    // Try cache first
    const cached = await this.getFromCache<T>(tenantId, namespace, key);
    if (cached !== null) {
      return cached;
    }

    // Query database
    const entry = await this.prisma.sharedPluginData.findUnique({
      where: {
        tenantId_namespace_key: {
          tenantId,
          namespace,
          key,
        },
      },
    });

    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      // Expired - delete it
      await this.delete(tenantId, namespace, key);
      return null;
    }

    const value = entry.value as T;

    // Cache result
    await this.setCache(tenantId, namespace, key, value);

    return value;
  }

  /**
   * Delete shared data
   */
  async delete(tenantId: string, namespace: string, key: string): Promise<boolean> {
    this.logger.debug({ tenantId, namespace, key }, 'Deleting shared data');

    try {
      const result = await this.prisma.sharedPluginData.deleteMany({
        where: {
          tenantId,
          namespace,
          key,
        },
      });

      // Invalidate cache
      await this.invalidateCache(tenantId, namespace, key);

      return result.count > 0;
    } catch (error) {
      this.logger.error({ error, tenantId, namespace, key }, 'Failed to delete shared data');
      throw new Error(
        `Failed to delete shared data: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  /**
   * List keys in a namespace
   */
  async listKeys(
    tenantId: string,
    namespace: string,
    options?: {
      ownerId?: string;
      includeExpired?: boolean;
    }
  ): Promise<string[]> {
    const now = new Date();

    const entries = await this.prisma.sharedPluginData.findMany({
      where: {
        tenantId,
        namespace,
        ...(options?.ownerId && { ownerId: options.ownerId }),
        ...(!options?.includeExpired && {
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        }),
      },
      select: {
        key: true,
      },
      orderBy: {
        key: 'asc',
      },
    });

    return entries.map((e) => e.key);
  }

  /**
   * Get all entries in a namespace
   */
  async getAll<T = any>(
    tenantId: string,
    namespace: string,
    options?: {
      ownerId?: string;
      includeExpired?: boolean;
    }
  ): Promise<SharedDataEntry<T>[]> {
    const now = new Date();

    const entries = await this.prisma.sharedPluginData.findMany({
      where: {
        tenantId,
        namespace,
        ...(options?.ownerId && { ownerId: options.ownerId }),
        ...(!options?.includeExpired && {
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        }),
      },
      orderBy: {
        key: 'asc',
      },
    });

    return entries.map((entry) => ({
      key: entry.key,
      value: entry.value as T,
      ownerId: entry.ownerId,
      expiresAt: entry.expiresAt || undefined,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }));
  }

  /**
   * Clear all data in a namespace
   */
  async clearNamespace(tenantId: string, namespace: string, ownerId?: string): Promise<number> {
    this.logger.info({ tenantId, namespace, ownerId }, 'Clearing namespace');

    try {
      const result = await this.prisma.sharedPluginData.deleteMany({
        where: {
          tenantId,
          namespace,
          ...(ownerId && { ownerId }),
        },
      });

      // Invalidate all cache for this namespace
      await this.invalidateNamespaceCache(tenantId, namespace);

      this.logger.info({ count: result.count }, 'Namespace cleared');
      return result.count;
    } catch (error) {
      this.logger.error({ error, tenantId, namespace }, 'Failed to clear namespace');
      throw new Error(
        `Failed to clear namespace: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  /**
   * Clean up expired entries (background job)
   */
  async cleanupExpired(): Promise<number> {
    const now = new Date();

    try {
      const result = await this.prisma.sharedPluginData.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
        },
      });

      if (result.count > 0) {
        this.logger.info({ count: result.count }, 'Cleaned up expired shared data entries');
      }

      return result.count;
    } catch (error) {
      this.logger.error({ error }, 'Failed to cleanup expired entries');
      throw new Error(
        `Failed to cleanup expired entries: ${error instanceof Error ? error.message : 'Unknown'}`
      );
    }
  }

  // ===== Cache Helpers =====

  private getCacheKey(tenantId: string, namespace: string, key: string): string {
    return `${this.CACHE_PREFIX}${tenantId}:${namespace}:${key}`;
  }

  private async getFromCache<T>(
    tenantId: string,
    namespace: string,
    key: string
  ): Promise<T | null> {
    try {
      const cacheKey = this.getCacheKey(tenantId, namespace, key);
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn({ error }, 'Failed to get from cache');
    }
    return null;
  }

  private async setCache<T>(
    tenantId: string,
    namespace: string,
    key: string,
    value: T
  ): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(tenantId, namespace, key);
      await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(value));
    } catch (error) {
      this.logger.warn({ error }, 'Failed to set cache');
    }
  }

  private async invalidateCache(tenantId: string, namespace: string, key: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(tenantId, namespace, key);
      await this.redis.del(cacheKey);
    } catch (error) {
      this.logger.warn({ error }, 'Failed to invalidate cache');
    }
  }

  private async invalidateNamespaceCache(tenantId: string, namespace: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}${tenantId}:${namespace}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      this.logger.warn({ error }, 'Failed to invalidate namespace cache');
    }
  }
}
