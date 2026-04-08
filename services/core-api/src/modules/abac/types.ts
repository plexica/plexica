// types.ts
// ABAC core type definitions.
// Implements: FR-013, FR-014, FR-018, FR-023, FR-024, plan §5.1.8, DR-04

export type WorkspaceRole = 'admin' | 'member' | 'viewer';
export type AbacDecisionResult = 'allow' | 'deny';

export interface AbacContext {
  userId: string; // Plexica user_id (UUID from user_profile)
  workspaceId: string; // UUID of the workspace being accessed
  tenantSlug: string; // Tenant identifier (for cache key)
  action: string; // e.g. "workspace:read", "member:invite"
  isTenantAdmin?: boolean; // Derived from Keycloak roles — precomputed by middleware
  pluginActionKey?: string; // e.g. "crm:contact:read" — for plugin action override
}

export interface AbacDecision {
  allowed: boolean;
  reason: string; // Human-readable e.g. "tenant admin bypass", "role=admin, required=member"
  matchedRule?: string; // The action key that matched e.g. "workspace:read"
  decision: AbacDecisionResult; // 'allow' | 'deny'
}

export interface PolicyRule {
  action: string;
  requiredRole: WorkspaceRole;
}

// Role hierarchy: admin > member > viewer
export const ROLE_HIERARCHY: Record<WorkspaceRole, number> = {
  admin: 3,
  member: 2,
  viewer: 1,
};
