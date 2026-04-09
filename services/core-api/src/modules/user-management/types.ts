// types.ts
// Domain types for the user-management module.
// Implements: user listing, workspace summary, role/action matrix.

export interface TenantUserDto {
  userId: string;
  displayName: string | null;
  email: string; // Only exposed to tenant admins
  avatarPath: string | null;
  status: 'active' | 'invited' | 'disabled';
  workspaceCount: number;
  createdAt: string;
}

export interface UserWorkspacesDto {
  userId: string;
  workspaces: Array<{
    workspaceId: string;
    workspaceName: string;
    role: string;
  }>;
}

export interface RoleDto {
  name: string; // 'tenant_admin' | 'admin' | 'member' | 'viewer'
  scope: string; // 'tenant' | 'workspace'
  description: string;
  actionCount: number;
}

export interface ActionMatrixRow {
  action: string; // e.g. 'workspace:read'
  label: string; // Human-readable
  tenantAdmin: boolean;
  workspaceAdmin: boolean;
  member: boolean;
  viewer: boolean;
}

export interface RemoveUserInput {
  reassignments: Array<{
    workspaceId: string;
    reassignToUserId: string;
  }>;
}

export interface UserListFilters {
  status?: 'active' | 'invited' | 'disabled';
  search?: string;
  page?: number;
  limit?: number;
}
