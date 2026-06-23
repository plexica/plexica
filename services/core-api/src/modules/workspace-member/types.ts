// types.ts
// Domain types for the workspace-member module.
// Implements: WS-003 (Workspace Member Management)

export type WorkspaceRole = 'admin' | 'member' | 'viewer';

export interface WorkspaceMemberDto {
  id: string;
  workspaceId: string;
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  role: WorkspaceRole;
  createdAt: string;
}

export interface AddMemberInput {
  userId: string;
  role: WorkspaceRole;
}

export interface ChangeMemberRoleInput {
  role: WorkspaceRole;
}

export interface MemberListFilters {
  page?: number;
  limit?: number;
  search?: string;
}
