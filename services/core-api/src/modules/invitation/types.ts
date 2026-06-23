// types.ts
// Invitation module domain types.

export type InvitationStatus = 'pending' | 'accepted' | 'expired';
export type WorkspaceRole = 'admin' | 'member' | 'viewer';

export interface InvitationDto {
  id: string;
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  invitedBy: { userId: string; displayName: string | null };
  expiresAt: string;
  createdAt: string;
}

export interface CreateInvitationInput {
  email: string;
  workspaceId: string;
  role: WorkspaceRole;
}

export interface ListInvitationsFilters {
  status?: InvitationStatus;
  page: number;
  limit: number;
}

export interface AcceptInvitationResult {
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
}
