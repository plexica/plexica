/**
 * TranslationCacheService - Redis caching layer for translations
 *
 * Responsibilities:
 * - Cache translation bundles with tenant-specific keys
 * - Store content hashes for ETag/cache-busting support
 * - Invalidate tenant-specific or global caches
 * - Achieve < 50ms cached read performance (NFR-001)
 *
 * Key patterns:
 * - Global: `i18n:{locale}:{namespace}`
 * - Tenant-specific: `i18n:{tenantSlug}:{locale}:{namespace}`
 * - Hash keys: `i18n:hash:{locale}:{namespace}` or `i18n:hash:{tenantSlug}:{locale}:{namespace}`
 *
 * @module modules/i18n/i18n-cache.service
 */

import { redis } from '../../lib/redis.js';
import type { Logger } from 'pino';
import type { TranslationBundle } from '@plexica/i18n';

// Cache configuration
const DEFAULT_TTL = 3600; // 1 hour in seconds
const CACHE_PREFIX = 'i18n';
const HASH_PREFIX = 'i18n:hash';

/**
 * TranslationCacheService - Redis caching for translation bundles
 */
export class TranslationCacheService {
  private logger: Logger;

  constructor(logger?: Logger) {
    // Use provided logger or fall back to a no-op pino instance
    this.logger = logger ?? (require('pino')({ level: 'warn' }) as Logger);
  }

  /**
   * Cursor-based SCAN helper — safe O(N) key enumeration that does not block Redis.
   * Replaces O(N) blocking redis.keys() calls (C-001).
   *
   * @param pattern - Redis key glob pattern
   * @returns All matching keys
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }
  /**
   * Get cached translation bundle
   *
   * @param locale - BCP 47 locale code
   * @param namespace - Plugin namespace
   * @param tenantSlug - Optional tenant slug for tenant-specific cache
   * @returns Cached bundle or null if not found
   */
  async getCached(
    locale: string,
    namespace: string,
    tenantSlug?: string
  ): Promise<TranslationBundle | null> {
    const key = this.buildKey(locale, namespace, tenantSlug);

    try {
      const cached = await redis.get(key);
      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as TranslationBundle;
    } catch (error) {
      // Log error but don't throw - cache miss is acceptable
      this.logger.error({ key, error }, 'Cache read error');
      return null;
    }
  }

  /**
   * Store translation bundle in cache
   *
   * @param bundle - Translation bundle to cache
   * @param tenantSlug - Optional tenant slug for tenant-specific cache
   * @param ttl - Time-to-live in seconds (default: 1 hour)
   */
  async setCached(
    bundle: TranslationBundle,
    tenantSlug?: string,
    ttl: number = DEFAULT_TTL
  ): Promise<void> {
    const key = this.buildKey(bundle.locale, bundle.namespace, tenantSlug);
    const hashKey = this.buildHashKey(bundle.locale, bundle.namespace, tenantSlug);

    try {
      // Store bundle with TTL
      await redis.setex(key, ttl, JSON.stringify(bundle));

      // Store content hash separately for quick ETag lookup
      await redis.setex(hashKey, ttl, bundle.hash);
    } catch (error) {
      // Log error but don't throw - cache write failure shouldn't block requests
      this.logger.error({ key, error }, 'Cache write error');
    }
  }

  /**
   * Get cached content hash for ETag support
   *
   * @param locale - BCP 47 locale code
   * @param namespace - Plugin namespace
   * @param tenantSlug - Optional tenant slug
   * @returns Content hash string or null if not cached
   */
  async getHash(locale: string, namespace: string, tenantSlug?: string): Promise<string | null> {
    const hashKey = this.buildHashKey(locale, namespace, tenantSlug);

    try {
      return await redis.get(hashKey);
    } catch (error) {
      this.logger.error({ hashKey, error }, 'Hash read error');
      return null;
    }
  }

  /**
   * Invalidate all cached translations for a specific tenant
   * Used when tenant updates translation overrides
   *
   * @param tenantSlug - Tenant slug
   */
  async invalidateTenant(tenantSlug: string): Promise<void> {
    try {
      // Find all keys matching this tenant's pattern using SCAN (not blocking KEYS)
      const pattern = `${CACHE_PREFIX}:${tenantSlug}:*`;
      const keys = await this.scanKeys(pattern);

      // Also find all hash keys for this tenant
      const hashPattern = `${HASH_PREFIX}:${tenantSlug}:*`;
      const hashKeys = await this.scanKeys(hashPattern);

      // Delete all keys in a pipeline for efficiency
      if (keys.length > 0 || hashKeys.length > 0) {
        const pipeline = redis.pipeline();
        keys.forEach((key) => pipeline.del(key));
        hashKeys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
      }
    } catch (error) {
      this.logger.error({ tenantSlug, error }, 'Cache invalidation error for tenant');
      // Don't throw - invalidation failure shouldn't block the update operation
    }
  }

  /**
   * Invalidate entire i18n cache
   * Used when translation files are updated on disk
   */
  async invalidateAll(): Promise<void> {
    try {
      // Find all i18n cache keys using SCAN (not blocking KEYS)
      const pattern = `${CACHE_PREFIX}:*`;
      const keys = await this.scanKeys(pattern);

      // Find all hash keys
      const hashPattern = `${HASH_PREFIX}:*`;
      const hashKeys = await this.scanKeys(hashPattern);

      // Delete all keys
      if (keys.length > 0 || hashKeys.length > 0) {
        const pipeline = redis.pipeline();
        keys.forEach((key) => pipeline.del(key));
        hashKeys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
      }
    } catch (error) {
      this.logger.error({ error }, 'Cache invalidation error (invalidateAll)');
    }
  }

  /**
   * Invalidate cache for a specific locale/namespace combination
   * Useful for selective cache invalidation
   *
   * @param locale - BCP 47 locale code
   * @param namespace - Plugin namespace
   */
  async invalidateNamespace(locale: string, namespace: string): Promise<void> {
    try {
      // Global key
      const globalKey = this.buildKey(locale, namespace);
      const globalHashKey = this.buildHashKey(locale, namespace);

      // Tenant-specific keys (all tenants) using SCAN (not blocking KEYS)
      const pattern = `${CACHE_PREFIX}:*:${locale}:${namespace}`;
      const tenantKeys = await this.scanKeys(pattern);

      const hashPattern = `${HASH_PREFIX}:*:${locale}:${namespace}`;
      const tenantHashKeys = await this.scanKeys(hashPattern);

      // Delete all matching keys
      const pipeline = redis.pipeline();
      pipeline.del(globalKey);
      pipeline.del(globalHashKey);
      tenantKeys.forEach((key) => pipeline.del(key));
      tenantHashKeys.forEach((key) => pipeline.del(key));
      await pipeline.exec();
    } catch (error) {
      this.logger.error({ locale, namespace, error }, 'Cache invalidation error for namespace');
    }
  }

  /**
   * Build cache key for translation bundle
   *
   * @param locale - BCP 47 locale code
   * @param namespace - Plugin namespace
   * @param tenantSlug - Optional tenant slug
   * @returns Cache key string
   */
  private buildKey(locale: string, namespace: string, tenantSlug?: string): string {
    if (tenantSlug) {
      return `${CACHE_PREFIX}:${tenantSlug}:${locale}:${namespace}`;
    }
    return `${CACHE_PREFIX}:${locale}:${namespace}`;
  }

  /**
   * Build cache key for content hash
   *
   * @param locale - BCP 47 locale code
   * @param namespace - Plugin namespace
   * @param tenantSlug - Optional tenant slug
   * @returns Hash key string
   */
  private buildHashKey(locale: string, namespace: string, tenantSlug?: string): string {
    if (tenantSlug) {
      return `${HASH_PREFIX}:${tenantSlug}:${locale}:${namespace}`;
    }
    return `${HASH_PREFIX}:${locale}:${namespace}`;
  }
}
