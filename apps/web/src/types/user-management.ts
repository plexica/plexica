// user-management.ts — TypeScript types for user management domain.
// Pure type definitions — no runtime logic.

export interface TenantUser {
  userId: string;
  keycloakId: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'suspended' | 'pending_deletion';
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  workspaceId: string;
  role: 'admin' | 'member' | 'viewer';
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  scope: 'tenant' | 'workspace';
  description: string;
  actionCount: number;
}

export interface ActionMatrixRow {
  action: string;
  label: string;
  tenantAdmin: boolean;
  workspaceAdmin: boolean;
  member: boolean;
  viewer: boolean;
}

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface InviteUserPayload {
  email: string;
  workspaceId: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface ChangeMemberRolePayload {
  role: 'admin' | 'member' | 'viewer';
}
