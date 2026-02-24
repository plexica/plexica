// apps/core-api/src/modules/authorization/permission-cache.service.ts
//
// Redis-backed permission cache with jittered TTL and role-scoped invalidation.
// Spec 003 FR-019, NFR-002, NFR-007, NFR-008, Edge Cases #7 and #8, Task 2.1
//
// Constitution Compliance:
//   - Article 4.3: P95 DB latency <50ms — cache is the primary mitigation
//   - Article 5.2: No PII in logs
//   - Article 6.3: Structured Pino logging

import redis from '../../lib/redis.js';
import { logger } from '../../lib/logger.js';
import {
  permsCacheKey,
  roleUsersCacheKey,
  permsKeyPattern,
  CACHE_BASE_TTL,
  CACHE_JITTER,
  CACHE_SAFETY_TTL,
  CACHE_INVALIDATION_DEBOUNCE_MS,
} from './constants.js';

/**
 * Jittered TTL to avoid thundering-herd cache stampedes.
 * Returns `base ± random(0, jitter)` seconds, minimum 1.
 */
function jitteredTtl(): number {
  const jitter = Math.floor(Math.random() * (CACHE_JITTER * 2 + 1)) - CACHE_JITTER;
  return Math.max(1, CACHE_BASE_TTL + jitter);
}

/**
 * Redis-backed permission cache for the authorization module.
 *
 * All methods are graceful-fail-open: any Redis error logs a warning and
 * returns a safe default (null / void) instead of propagating the error.
 * The caller must handle a null cache miss by falling back to the database.
 *
 * Key schema (Appendix B):
 *   - `authz:perms:{tenantId}:{userId}` — JSON-serialized string[]
 *   - `authz:role_users:{tenantId}:{roleId}` — Redis SET of userIds
 */
export class PermissionCacheService {
  // ---------------------------------------------------------------------------
  // Debounced invalidation timers per role
  // ---------------------------------------------------------------------------
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // ---------------------------------------------------------------------------
  // Per-user permission cache
  // ---------------------------------------------------------------------------

  /**
   * Returns the cached permission keys for a user within a tenant, or null on
   * cache miss / Redis error.
   */
  async getUserPermissions(tenantId: string, userId: string): Promise<string[] | null> {
    try {
      const key = permsCacheKey(tenantId, userId);
      const raw = await redis.get(key);
      if (raw === null) return null;

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed as string[];
    } catch (error) {
      logger.warn({ tenantId, error }, 'PermissionCacheService.getUserPermissions Redis error');
      return null;
    }
  }

  /**
   * Stores the user's effective permission keys in Redis with a jittered TTL.
   * Also records the userId in the role→users reverse index for each role the
   * user is assigned, enabling role-level invalidation.
   *
   * @param tenantId  - Tenant scope
   * @param userId    - Subject user
   * @param permissions - Effective permission key array
   * @param roleIds   - Role IDs currently assigned to the user (for reverse index)
   */
  async setUserPermissions(
    tenantId: string,
    userId: string,
    permissions: string[],
    roleIds: string[]
  ): Promise<void> {
    try {
      const key = permsCacheKey(tenantId, userId);
      const ttl = jitteredTtl();

      // Store permissions JSON with jittered TTL
      const setResult = await redis.set(key, JSON.stringify(permissions), 'EX', ttl);

      // Safety fallback: if SET somehow didn't set an expiry, enforce safety TTL
      if (setResult === 'OK') {
        const currentTtl = await redis.ttl(key);
        if (currentTtl < 0) {
          await redis.expire(key, CACHE_SAFETY_TTL);
        }
      }

      // Update reverse role→users index for each role
      await Promise.all(
        roleIds.map((roleId) =>
          redis
            .sadd(roleUsersCacheKey(tenantId, roleId), userId)
            .catch((err) =>
              logger.warn(
                { tenantId, roleId, err },
                'PermissionCacheService: failed to update role→users index'
              )
            )
        )
      );
    } catch (error) {
      logger.warn({ tenantId, error }, 'PermissionCacheService.setUserPermissions Redis error');
    }
  }

  /**
   * Invalidates cached permissions for ALL users assigned to the given role.
   * Uses the role→users reverse index to find affected users.
   *
   * Immediately clears all affected user permission keys, then removes the
   * reverse index key itself.
   */
  async invalidateForRole(tenantId: string, roleId: string): Promise<void> {
    try {
      const indexKey = roleUsersCacheKey(tenantId, roleId);
      const userIds = await redis.smembers(indexKey);

      if (userIds.length > 0) {
        const permsKeys = userIds.map((uid) => permsCacheKey(tenantId, uid));
        await redis.del(...permsKeys);
      }

      // Clean up the reverse index for this role
      await redis.del(indexKey);
    } catch (error) {
      logger.warn(
        { tenantId, roleId, error },
        'PermissionCacheService.invalidateForRole Redis error'
      );
    }
  }

  /**
   * Debounced version of `invalidateForRole`.
   * Multiple calls within the debounce window (500ms) are coalesced into one
   * actual invalidation to prevent cache stampedes during bulk permission edits.
   * (NFR-010)
   */
  debouncedInvalidateForRole(tenantId: string, roleId: string): void {
    const debounceKey = `${tenantId}:${roleId}`;
    const existing = this.debounceTimers.get(debounceKey);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(debounceKey);
      this.invalidateForRole(tenantId, roleId).catch((err) =>
        logger.warn(
          { tenantId, roleId, err },
          'PermissionCacheService: debounced invalidation error'
        )
      );
    }, CACHE_INVALIDATION_DEBOUNCE_MS);

    this.debounceTimers.set(debounceKey, timer);
  }

  /**
   * Invalidates the cached permissions for a single user.
   */
  async invalidateForUser(tenantId: string, userId: string): Promise<void> {
    try {
      await redis.del(permsCacheKey(tenantId, userId));
    } catch (error) {
      logger.warn({ tenantId, error }, 'PermissionCacheService.invalidateForUser Redis error');
    }
  }

  /**
   * Invalidates ALL cached permissions for a tenant using a SCAN-based deletion.
   * Used on plugin install/uninstall events where all users' effective permissions
   * may have changed simultaneously.
   *
   * SCAN is used instead of KEYS to avoid blocking the Redis event loop on large
   * key spaces (Art. 4.3 performance requirement).
   */
  async invalidateForTenant(tenantId: string): Promise<void> {
    try {
      const pattern = permsKeyPattern(tenantId);
      let cursor = '0';
      const keysToDelete: string[] = [];

      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        // DEL accepts multiple keys; chunk if very large to stay under Redis argument limits
        const chunkSize = 500;
        for (let i = 0; i < keysToDelete.length; i += chunkSize) {
          await redis.del(...keysToDelete.slice(i, i + chunkSize));
        }
      }
    } catch (error) {
      logger.warn({ tenantId, error }, 'PermissionCacheService.invalidateForTenant Redis error');
    }
  }
}

/** Singleton instance shared across the authorization module */
export const permissionCacheService = new PermissionCacheService();
