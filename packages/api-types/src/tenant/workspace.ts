// tenant/workspace.ts
// Workspace domain response types (tenant API).
// These mirror the backend DTOs returned by /api/v1/workspaces endpoints.

export interface Workspace {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  materializedPath: string;
  depth: number;
  status: 'active' | 'archived';
  templateId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface WorkspaceDetail extends Workspace {
  children: Workspace[];
  memberCount: number;
}

export interface WorkspaceTreeNode {
  id: string;
  name: string;
  slug: string;
  depth: number;
  status: 'active' | 'archived';
  children: WorkspaceTreeNode[];
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  role: 'admin' | 'member' | 'viewer';
  displayName: string | null;
  avatarPath: string | null;
  email: string;
  createdAt: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  structure: unknown;
  version: number;
  createdAt: string;
  updatedAt: string;
}
