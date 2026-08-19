// tenant/user.ts
// User management domain types (tenant API).

export interface TenantUser {
  userId: string;
  keycloakId: string;
  email: string;
  displayName: string | null;
  status: 'active' | 'invited' | 'disabled';
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  workspaceId: string;
  role: 'admin' | 'member' | 'viewer';
  status: 'pending' | 'accepted' | 'expired';
  invitedBy: { userId: string; displayName: string | null };
  expiresAt: string;
  createdAt: string;
}

export interface Role {
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

export interface UserProfileDto {
  userId: string;
  keycloakId: string;
  email: string;
  displayName: string | null;
  timezone: string;
  language: string;
  notificationPrefs: Record<string, boolean>;
  avatarUrl: string | null;
  status: string;
}
