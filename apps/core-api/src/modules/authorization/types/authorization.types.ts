// apps/core-api/src/modules/authorization/types/authorization.types.ts
//
// Domain interfaces for the hybrid RBAC + ABAC authorization system.
// Spec 003 §7 Data Requirements, §4 FR-001, FR-007, FR-008, FR-017
//
// Constitution Compliance:
//   - Article 1.2: Multi-tenancy isolation (tenant_id on every entity)
//   - Article 2.1: Strict TypeScript, no `any`
//   - Article 3.2: Domain-driven types per bounded context

// ---------------------------------------------------------------------------
// Core RBAC domain types
// ---------------------------------------------------------------------------

/**
 * A named collection of permissions that can be assigned to users.
 * System roles (is_system=true) cannot be modified or deleted (FR-004).
 */
export interface Role {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  /** True for built-in roles: super_admin, tenant_admin, team_admin, user */
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * An atomic authorization capability in `resource:action` format (FR-001).
 * Core permissions have pluginId = null; plugin permissions carry their pluginId.
 */
export interface Permission {
  id: string;
  tenantId: string;
  /** Colon-separated key, e.g. `users:read`, `workspaces:write` */
  key: string;
  name: string;
  description?: string;
  /** Null for core permissions; set for plugin-contributed permissions (FR-012) */
  pluginId: string | null;
  createdAt: Date;
}

/**
 * ABAC policy controlling whether a user's action is DENIED outright
 * or the result set is FILTERED (FR-017). Effect is deny-only — ABAC
 * can never expand access granted by RBAC (spec §5, NFR-001).
 */
export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  /** Resource pattern, e.g. `crm:deals:*` */
  resource: string;
  effect: 'DENY' | 'FILTER';
  /** Nested boolean condition tree — max 64 KB (FR-008) */
  conditions: ConditionTree;
  /** Higher priority = evaluated first */
  priority: number;
  source: 'core' | 'plugin' | 'super_admin' | 'tenant_admin';
  pluginId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A role assigned to a user within a tenant.
 */
export interface UserRole {
  userId: string;
  roleId: string;
  tenantId: string;
  assignedAt: Date;
}

// ---------------------------------------------------------------------------
// Authorization decision types
// ---------------------------------------------------------------------------

/**
 * Result of an authorization decision.
 */
export interface AuthorizationResult {
  /** Whether the user is permitted to perform the action */
  permitted: boolean;
  /** The evaluated permission keys */
  checkedPermissions: string[];
  /** The user's effective permission keys at decision time */
  userPermissions: string[];
  /** Whether the result came from the cache */
  fromCache: boolean;
}

// ---------------------------------------------------------------------------
// ABAC condition tree types (FR-007, FR-008)
// ---------------------------------------------------------------------------

/**
 * Top-level condition container. All children are evaluated together
 * using the specified boolean operator.
 */
export interface ConditionTree {
  operator: 'AND' | 'OR' | 'NOT';
  conditions: Array<ConditionNode | LeafCondition>;
}

/**
 * Intermediate (composite) condition node — wraps another ConditionTree.
 */
export interface ConditionNode {
  type: 'composite';
  tree: ConditionTree;
}

/**
 * Terminal condition leaf that evaluates a single predicate.
 */
export interface LeafCondition {
  type: 'leaf';
  /** Dot-separated attribute path on the subject or resource, e.g. `user.department` */
  attribute: string;
  operator:
    | 'eq'
    | 'neq'
    | 'in'
    | 'not_in'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'starts_with';
  value: string | number | boolean | string[] | number[];
}

// ---------------------------------------------------------------------------
// Query / pagination types
// ---------------------------------------------------------------------------

/**
 * Filters accepted by the role list endpoint.
 */
export interface RoleFilters {
  search?: string;
  isSystem?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Filters accepted by the policy list endpoint.
 */
export interface PolicyFilters {
  resource?: string;
  effect?: 'DENY' | 'FILTER';
  isActive?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Paginated roles response.
 */
export interface RolePage {
  data: RoleWithPermissions[];
  meta: {
    total: number;
    page: number;
    limit: number;
    customRoleCount: number;
  };
}

/**
 * Paginated policies response.
 */
export interface PolicyPage {
  data: Policy[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

/**
 * Role with its associated permissions included (for detailed views).
 */
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

/**
 * Effective permissions result for a user — includes wildcard entries.
 */
export interface UserEffectivePermissions {
  data: string[];
  wildcards: string[];
}
