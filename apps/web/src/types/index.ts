// apps/web/src/types/index.ts
//
// Re-exports from @plexica/types — single source of truth.
// `User` is aliased from `TenantUser` to preserve existing consumer imports.

export type { TenantUser as User } from '@plexica/types';
export type { Tenant, AuthState } from '@plexica/types';
export type { TenantPlugin } from '@plexica/types';
export type { PluginEntity as Plugin } from '@plexica/types';
export type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  Team,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  AddMemberInput,
  UpdateMemberRoleInput,
} from '@plexica/types';
