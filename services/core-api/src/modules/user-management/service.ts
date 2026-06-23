// service.ts
// Business-logic layer for the user-management module.
// Delegates: removeUser → service-remove.ts, data access → repository.ts.

import { CORE_POLICIES, POLICY_MAP } from '../abac/policies.js';
import { ROLE_HIERARCHY } from '../abac/types.js';

import { findTenantUsers, findUserWorkspaces } from './repository.js';

import type { TenantContext } from '../../lib/tenant-context-store.js';
import type {
  TenantUserDto,
  UserWorkspacesDto,
  RoleDto,
  ActionMatrixRow,
  UserListFilters,
} from './types.js';

// Re-export for route layer convenience.
export { removeUser } from './service-remove.js';

// ---------------------------------------------------------------------------
// User listing
// ---------------------------------------------------------------------------

export async function listTenantUsers(
  db: unknown,
  filters: UserListFilters,
  _tenantContext: TenantContext
): Promise<{ data: TenantUserDto[]; total: number; page: number; limit: number }> {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const { data, total } = await findTenantUsers(db, filters);
  return { data, total, page, limit };
}

// ---------------------------------------------------------------------------
// User workspaces
// ---------------------------------------------------------------------------

export async function getUserWorkspaces(
  db: unknown,
  userId: string,
  _tenantContext: TenantContext
): Promise<UserWorkspacesDto> {
  return findUserWorkspaces(db, userId);
}

// ---------------------------------------------------------------------------
// Roles (static)
// ---------------------------------------------------------------------------

export function listRoles(): RoleDto[] {
  return [
    {
      name: 'tenant_admin',
      scope: 'tenant',
      description: 'Full access to all tenant resources',
      actionCount: 22,
    },
    {
      name: 'admin',
      scope: 'workspace',
      description: 'Full access within a workspace',
      actionCount: 22,
    },
    {
      name: 'member',
      scope: 'workspace',
      description: 'Create and edit within a workspace',
      actionCount: 14,
    },
    {
      name: 'viewer',
      scope: 'workspace',
      description: 'Read-only access within a workspace',
      actionCount: 8,
    },
  ];
}

// ---------------------------------------------------------------------------
// Action matrix
// ---------------------------------------------------------------------------

/** Derives a human-readable label from an action key like 'workspace:read'. */
function actionLabel(action: string): string {
  const [domain, verb] = action.split(':');
  if (domain === undefined || verb === undefined) return action;

  const domainMap: Record<string, string> = {
    workspace: 'Workspace',
    member: 'Member',
    invitation: 'Invitation',
    audit: 'Audit Log',
    branding: 'Branding',
    settings: 'Settings',
    auth: 'Auth Config',
    'plugin-action': 'Plugin Action',
    role: 'Role',
  };

  const verbMap: Record<string, string> = {
    read: 'View',
    update: 'Edit',
    delete: 'Delete',
    archive: 'Archive',
    restore: 'Restore',
    reparent: 'Move',
    list: 'List',
    invite: 'Invite',
    remove: 'Remove',
    'role-change': 'Change Role',
    resend: 'Resend',
    revoke: 'Revoke',
    'config-read': 'View Config',
    'config-update': 'Edit Config',
    manage: 'Manage',
  };

  const d = domainMap[domain] ?? domain;
  const v = verbMap[verb] ?? verb;
  return `${d}: ${v}`;
}

/**
 * Returns a row for each of the 22 core actions indicating which roles
 * have access. tenant_admin always has access; workspace roles are checked
 * against ROLE_HIERARCHY (a role satisfies the requirement if its level >=
 * the required role level).
 */
export function getActionMatrix(): ActionMatrixRow[] {
  return CORE_POLICIES.map((policy) => {
    const required = POLICY_MAP.get(policy.action);
    const requiredLevel = required !== undefined ? ROLE_HIERARCHY[required] : 99;

    return {
      action: policy.action,
      label: actionLabel(policy.action),
      tenantAdmin: true,
      workspaceAdmin: ROLE_HIERARCHY['admin'] >= requiredLevel,
      member: ROLE_HIERARCHY['member'] >= requiredLevel,
      viewer: ROLE_HIERARCHY['viewer'] >= requiredLevel,
    };
  });
}
