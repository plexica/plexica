/**
 * SystemConfigService — T008-09 (Spec 008 Admin Interfaces)
 *
 * Key-value store service for platform-wide configuration settings.
 * Backed by the core.system_config table (Prisma-managed).
 *
 * Constitution Article 5.2: No PII stored in config values.
 * Constitution Article 6.3: Structured Pino logging.
 */

import { type PrismaClient, Prisma } from '@plexica/database';
import { db } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';

// ============================================================================
// Public Interfaces
// ============================================================================

export interface SystemConfigValue {
  key: string;
  value: unknown;
  category: string;
  description: string | null;
  updatedBy: string | null;
  updatedAt: Date;
  createdAt: Date;
}

/** Alias for backward compatibility — same shape as SystemConfigValue. */
export type SystemConfigItem = SystemConfigValue;

// ============================================================================
// Error
// ============================================================================

export class SystemConfigNotFoundError extends Error {
  readonly code = 'SYSTEM_CONFIG_NOT_FOUND';
  readonly statusCode = 404;

  constructor(key: string) {
    super(`System configuration key '${key}' not found`);
    this.name = 'SystemConfigNotFoundError';
  }
}

// ============================================================================
// Service
// ============================================================================

export class SystemConfigService {
  private db: PrismaClient;
  private static readonly CACHE_TTL_SECONDS = 300; // 5-minute TTL (plan §4.4)
  private static readonly CACHE_KEY_PREFIX = 'sys_config:';

  constructor(dbClient: PrismaClient = db) {
    this.db = dbClient;
  }

  /** Build a Redis cache key for a config entry. */
  private cacheKey(key: string): string {
    return `${SystemConfigService.CACHE_KEY_PREFIX}${key}`;
  }

  /**
   * Get a single config value by key.
   * Checks Redis cache first (5-min TTL); falls back to Prisma on cache miss.
   * Throws SystemConfigNotFoundError if the key does not exist.
   */
  async get(key: string): Promise<SystemConfigValue> {
    // Try Redis cache first
    try {
      const cached = await redis.get(this.cacheKey(key));
      if (cached !== null) {
        return JSON.parse(cached) as SystemConfigValue;
      }
    } catch (cacheErr) {
      // Cache failure is non-fatal — fall through to DB
      logger.warn({ err: cacheErr, key }, 'SystemConfigService.get: Redis cache miss (error)');
    }

    const record = await this.db.systemConfig.findUnique({
      where: { key },
    });

    if (!record) {
      throw new SystemConfigNotFoundError(key);
    }

    const value: SystemConfigValue = {
      key: record.key,
      value: record.value,
      category: record.category,
      description: record.description,
      updatedBy: record.updatedBy,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
    };

    // Populate cache
    try {
      await redis.set(
        this.cacheKey(key),
        JSON.stringify(value),
        'EX',
        SystemConfigService.CACHE_TTL_SECONDS
      );
    } catch (cacheErr) {
      logger.warn({ err: cacheErr, key }, 'SystemConfigService.get: failed to populate cache');
    }

    return value;
  }

  /**
   * Upsert a config value by key.
   * Creates the entry if it does not exist, or updates it if it does.
   * Invalidates the Redis cache entry after a successful upsert.
   * Returns the upserted config item.
   *
   * Unlike `update()`, `set()` does not require the key to pre-exist
   * (plan §4.4 — super-admin surfaces need to create new keys at runtime).
   */
  async set(key: string, value: unknown, updatedBy: string): Promise<SystemConfigValue> {
    const upserted = await this.db.systemConfig.upsert({
      where: { key },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        category: 'general',
        updatedBy,
      },
      update: {
        value: value as Prisma.InputJsonValue,
        updatedBy,
      },
    });

    // Invalidate cache so next read reflects the new value
    try {
      await redis.del(this.cacheKey(key));
    } catch (cacheErr) {
      logger.warn({ err: cacheErr, key }, 'SystemConfigService.set: failed to invalidate cache');
    }

    return {
      key: upserted.key,
      value: upserted.value,
      category: upserted.category,
      description: upserted.description,
      updatedBy: upserted.updatedBy,
      updatedAt: upserted.updatedAt,
      createdAt: upserted.createdAt,
    };
  }

  /**
   * Update an existing config value.
   * Throws SystemConfigNotFoundError if the key does not exist (plan §4.4 — no arbitrary key creation).
   * Invalidates the Redis cache entry after a successful update.
   * Returns the updated config item.
   */
  async update(key: string, value: unknown, updatedBy: string): Promise<SystemConfigValue> {
    try {
      const updated = await this.db.systemConfig.update({
        where: { key },
        data: {
          value: value as Prisma.InputJsonValue,
          updatedBy,
        },
      });

      // Invalidate cache so next read reflects the new value
      try {
        await redis.del(this.cacheKey(key));
      } catch (cacheErr) {
        logger.warn(
          { err: cacheErr, key },
          'SystemConfigService.update: failed to invalidate cache'
        );
      }

      return {
        key: updated.key,
        value: updated.value,
        category: updated.category,
        description: updated.description,
        updatedBy: updated.updatedBy,
        updatedAt: updated.updatedAt,
        createdAt: updated.createdAt,
      };
    } catch (err: unknown) {
      // Prisma throws P2025 when the record does not exist
      if (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        throw new SystemConfigNotFoundError(key);
      }
      logger.error({ err, key }, 'SystemConfigService.update: failed to update config');
      throw err;
    }
  }

  /**
   * List all config items, optionally filtered by category.
   */
  async list(category?: string): Promise<SystemConfigItem[]> {
    const where = category ? { category } : {};

    const records = await this.db.systemConfig.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    return records.map((r) => ({
      key: r.key,
      value: r.value,
      category: r.category,
      description: r.description,
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Typed accessor: returns the config value as a boolean.
   * Falls back to defaultValue if key is missing.
   */
  async getBoolean(key: string, defaultValue?: boolean): Promise<boolean> {
    try {
      const item = await this.get(key);
      if (typeof item.value === 'boolean') return item.value;
      if (typeof item.value === 'string') return item.value === 'true';
      if (typeof item.value === 'number') return item.value !== 0;
      return Boolean(item.value);
    } catch (err) {
      if (err instanceof SystemConfigNotFoundError && defaultValue !== undefined) {
        return defaultValue;
      }
      throw err;
    }
  }

  /**
   * Typed accessor: returns the config value as a number.
   * Falls back to defaultValue if key is missing.
   */
  async getNumber(key: string, defaultValue?: number): Promise<number> {
    try {
      const item = await this.get(key);
      const num = Number(item.value);
      if (isNaN(num)) {
        throw new Error(`Config key '${key}' value '${item.value}' is not a valid number`);
      }
      return num;
    } catch (err) {
      if (err instanceof SystemConfigNotFoundError && defaultValue !== undefined) {
        return defaultValue;
      }
      throw err;
    }
  }

  /**
   * Check whether the platform is in maintenance mode.
   * Reads from Redis cache (populated by `get()`); falls back to Prisma on
   * cache miss or Redis failure. Returns `false` when the key is absent.
   *
   * Constitution Art. 9.2: operational check used by health endpoint and
   * request middleware to gate incoming traffic.
   */
  async isMaintenanceMode(): Promise<boolean> {
    return this.getBoolean('maintenance_mode', false);
  }
}

// Singleton instance
export const systemConfigService = new SystemConfigService();
