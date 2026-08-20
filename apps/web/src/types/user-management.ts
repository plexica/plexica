// user-management.ts — Re-export from @plexica/api-types (ADR-029).
// User management domain types are sourced from the shared package.
// App-specific payload types stay here.

export type {
  TenantUser,
  Invitation,
  Role,
  ActionMatrixRow,
  WorkspaceMembership,
  UserProfileDto,
} from '@plexica/api-types';

export interface InviteUserPayload {
  email: string;
  workspaceId: string;
  role: 'admin' | 'member' | 'viewer';
}

export interface ChangeMemberRolePayload {
  role: 'admin' | 'member' | 'viewer';
}
