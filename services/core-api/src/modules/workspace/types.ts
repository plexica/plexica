// types.ts
// TypeScript DTO interfaces for the Workspace module API.

export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  materializedPath: string;
  status: 'active' | 'archived';
  memberCount: number;
  createdAt: string;
}

export interface WorkspaceDetailDto extends WorkspaceDto {
  children: Array<{ id: string; name: string; slug: string }>;
  currentUserRole: string | null;
  templateId: string | null;
  version: number;
  updatedAt: string;
}

export interface WorkspaceTreeNode {
  id: string;
  name: string;
  slug: string;
  children: WorkspaceTreeNode[];
}

export interface WorkspaceMemberDto {
  id: string;
  userId: string;
  displayName: string | null;
  avatarPath: string | null;
  role: 'admin' | 'member' | 'viewer';
  createdAt: string;
}

export interface WorkspaceTemplateDto {
  id: string;
  name: string;
  description: string | null;
  structure: TemplateChildDef[];
  isBuiltin: boolean;
  version: number;
  createdAt: string;
}

export interface TemplateChildDef {
  name: string;
  description?: string;
  defaultRoles: { creator: string };
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string | null | undefined;
  parentId?: string | null | undefined;
  templateId?: string | null | undefined;
}

export interface UpdateWorkspaceInput {
  name?: string | undefined;
  description?: string | null | undefined;
}

export interface ReparentInput {
  newParentId: string | null;
}

export interface ArchiveResult {
  archivedCount: number;
  workspaces: Array<{ id: string; name: string }>;
}

export interface RestoreResult {
  restoredCount: number;
  workspaces: Array<{ id: string; name: string; status: string }>;
}
