// apps/core-api/src/modules/authorization/types/index.ts
//
// Barrel export for all authorization domain types.
// Import from this file, not from authorization.types.ts directly.

export type {
  Role,
  Permission,
  Policy,
  UserRole,
  AuthorizationResult,
  ConditionTree,
  ConditionNode,
  LeafCondition,
  RoleFilters,
  PolicyFilters,
  RolePage,
  PolicyPage,
  RoleWithPermissions,
  UserEffectivePermissions,
} from './authorization.types.js';
