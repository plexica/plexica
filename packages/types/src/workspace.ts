// File: packages/types/src/workspace.ts

/**
 * Workspace roles.
 */
export const WORKSPACE_ROLES = ['ADMIN', 'MEMBER', 'VIEWER'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * Workspace — an organizational unit within a tenant.
 * Users can belong to multiple workspaces with different roles.
 */
export interface Workspace {
  id: string;
  slug: string;
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  /** Present when fetched with members included */
  members?: WorkspaceMember[];
  /** Present when fetched with teams included */
  teams?: Team[];
  /** Aggregate counts when fetched with _count */
  _count?: {
    members: number;
    teams: number;
  };
  /** Present when fetched through a membership join (user's own role) */
  memberRole?: WorkspaceRole;
  /** Present when fetched through a membership join */
  joinedAt?: string;
}

/**
 * A user's membership in a workspace.
 */
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

/**
 * A team within a workspace.
 */
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

// --- Workspace DTOs (request payloads) ---

export interface CreateWorkspaceInput {
  slug: string;
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

export interface AddMemberInput {
  userId: string;
  role?: WorkspaceRole;
}

export interface UpdateMemberRoleInput {
  role: WorkspaceRole;
}
