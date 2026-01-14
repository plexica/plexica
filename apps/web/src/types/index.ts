// apps/web/src/types/index.ts

export interface User {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'PENDING_DELETION' | 'DELETED';
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: string;
  status: 'published' | 'draft' | 'deprecated';
  icon?: string;
  homepage?: string;
}

export interface TenantPlugin {
  id: string;
  pluginId: string;
  tenantId: string;
  status: 'active' | 'inactive';
  configuration: Record<string, any>;
  installedAt: string;
  plugin: Plugin;
}

// Workspace types
export type WorkspaceRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  description?: string;
  settings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  // Extended fields from findOne API
  members?: WorkspaceMember[];
  teams?: Team[];
  _count?: {
    members: number;
    teams: number;
  };
  // From membership join in findAll
  memberRole?: WorkspaceRole;
  joinedAt?: string;
}

export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  invitedBy: string;
  joinedAt: string;
  user?: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
  };
}

export interface CreateWorkspaceInput {
  slug: string;
  name: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  settings?: Record<string, any>;
}

export interface AddMemberInput {
  userId: string;
  role?: WorkspaceRole;
}

export interface UpdateMemberRoleInput {
  role: WorkspaceRole;
}
