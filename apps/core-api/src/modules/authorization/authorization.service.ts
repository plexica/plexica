// apps/core-api/src/modules/authorization/authorization.service.ts
//
// Central authorization decision engine — RBAC evaluation with Redis caching.
// Spec 003 FR-001, FR-002, FR-006, FR-010, FR-016, NFR-003, NFR-005, Task 2.4
//
// Constitution Compliance:
//   - Article 1.2: Fail-closed — any error returns DENY (NFR-005)
//   - Article 4.3: P95 latency target via Redis cache (primary path)
//   - Article 5.1: No permission names exposed in authorization results
//   - Article 5.2: No PII in logs; userId/tenantId are non-PII identifiers
//   - Article 6.3: Structured Pino audit log on every decision (NFR-003)

import { logger } from '../../lib/logger.js';
import { SYSTEM_ROLES } from './constants.js';
import { permissionCacheService } from './permission-cache.service.js';
import { roleService } from './role.service.js';
import { tenantService } from '../../services/tenant.service.js';
import type { AuthorizationResult, UserEffectivePermissions } from './types/index.js';

// ---------------------------------------------------------------------------
// AuthorizationService
// ---------------------------------------------------------------------------

export class AuthorizationService {
  /**
   * Performs an RBAC authorization decision for a user.
   *
   * Decision path:
   *   1. Try Redis cache for user's effective permissions.
   *   2. On cache miss: load from DB via RoleService, write back to cache.
   *   3. Evaluate each required permission with wildcard matching.
   *   4. Emit an audit log record at `info` level (NFR-003).
   *   5. On ANY unexpected error: log + return DENY (NFR-005, fail-closed).
   *
   * @param userId              - Subject user ID (keycloak ID)
   * @param tenantId            - Tenant scope for DB lookup and cache key
   * @param schemaName          - Tenant schema name (pre-validated by caller)
   * @param requiredPermissions - Array of permission keys to check (all must match)
   */
  async authorize(
    userId: string,
    tenantId: string,
    schemaName: string,
    requiredPermissions: string[]
  ): Promise<AuthorizationResult> {
    try {
      let userPermissions: string[];
      let fromCache = false;

      // 1. Try cache first
      const cached = await permissionCacheService.getUserPermissions(tenantId, userId);

      if (cached !== null) {
        userPermissions = cached;
        fromCache = true;
      } else {
        // 2. Cache miss — load from DB
        const { permissionKeys, roleIds } = await roleService.getUserPermissions(
          tenantId,
          schemaName,
          userId
        );
        userPermissions = permissionKeys;

        // Write back to cache for subsequent requests
        await permissionCacheService.setUserPermissions(tenantId, userId, permissionKeys, roleIds);
      }

      // 3. Evaluate: ALL required permissions must match (conjunction)
      const permitted =
        requiredPermissions.length === 0 ||
        requiredPermissions.every((required) =>
          userPermissions.some((userPerm) => this.matchesPermission(userPerm, required))
        );

      // 4. Audit log (NFR-003) — log at info level, no permission detail in message
      logger.info(
        {
          userId,
          tenantId,
          required: requiredPermissions,
          decision: permitted ? 'ALLOW' : 'DENY',
          fromCache,
        },
        'Authorization decision'
      );

      return {
        permitted,
        checkedPermissions: requiredPermissions,
        userPermissions,
        fromCache,
      };
    } catch (error) {
      // 5. Fail-closed: unexpected error → DENY (NFR-005)
      logger.error(
        { userId, tenantId, error },
        'AuthorizationService.authorize unexpected error — failing closed (DENY)'
      );

      return {
        permitted: false,
        checkedPermissions: requiredPermissions,
        userPermissions: [],
        fromCache: false,
      };
    }
  }

  /**
   * Tests whether a permission the user holds satisfies a required permission.
   *
   * Supports wildcard matching:
   *   - `*:*`          → matches everything
   *   - `resource:*`   → matches all actions on `resource`
   *   - `resource:sub:*` → matches all sub-actions on `resource:sub`
   *   - Exact match    → `users:read` matches `users:read` only
   *
   * @param userPerm - A permission key the user has (may contain wildcard `*`)
   * @param required - The required permission key (exact string from route)
   */
  matchesPermission(userPerm: string, required: string): boolean {
    if (userPerm === required) return true;

    // Segment-by-segment wildcard matching
    const userSegs = userPerm.split(':');
    const reqSegs = required.split(':');

    for (let i = 0; i < userSegs.length; i++) {
      const us = userSegs[i];

      if (us === '*') {
        // Wildcard at this position — matches this segment and all remaining
        return true;
      }

      if (i >= reqSegs.length) {
        // User perm has more segments than required (no match)
        return false;
      }

      if (us !== reqSegs[i]) {
        // Segment mismatch
        return false;
      }
    }

    // Exact same segment count and all matched
    return userSegs.length === reqSegs.length;
  }

  /**
   * Returns true if any of the supplied role names is the `super_admin` role.
   * Super admins bypass ABAC evaluation (FR-016).
   *
   * @param roleNames - Keycloak `realm_access.roles` or DB role names
   */
  isSuperAdmin(roleNames: string[]): boolean {
    return roleNames.includes(SYSTEM_ROLES.SUPER_ADMIN);
  }

  /**
   * Returns the user's full effective permission list plus a `wildcards` array
   * listing which entries contain a `*` segment.
   *
   * Used by:
   *   - `GET /api/v1/me/permissions`
   *   - PermissionService delegation (Task 2.11)
   */
  async getUserEffectivePermissions(
    userId: string,
    tenantId: string,
    schemaName: string
  ): Promise<UserEffectivePermissions> {
    try {
      // Try cache first
      const cached = await permissionCacheService.getUserPermissions(tenantId, userId);
      let permissions: string[];

      if (cached !== null) {
        permissions = cached;
      } else {
        const { permissionKeys, roleIds } = await roleService.getUserPermissions(
          tenantId,
          schemaName,
          userId
        );
        permissions = permissionKeys;
        await permissionCacheService.setUserPermissions(tenantId, userId, permissionKeys, roleIds);
      }

      const wildcards = permissions.filter((p) => p.includes('*'));

      return { data: permissions, wildcards };
    } catch (error) {
      logger.error(
        { userId, tenantId, error },
        'AuthorizationService.getUserEffectivePermissions unexpected error'
      );
      return { data: [], wildcards: [] };
    }
  }

  /**
   * Resolves the tenant schema name for a given tenant slug.
   * Delegates to tenantService to stay consistent.
   */
  getSchemaName(tenantSlug: string): string {
    return tenantService.getSchemaName(tenantSlug);
  }
}

/** Singleton instance shared across the application */
export const authorizationService = new AuthorizationService();
