// workspace.ts — TypeScript types for workspace domain.
// Pure type definitions — no runtime logic.

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
  userId: string;
  workspaceId: string;
  role: 'admin' | 'member' | 'viewer';
  joinedAt: string;
  displayName: string | null;
  email: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string | null;
  isBuiltin: boolean;
  childWorkspaces: Array<{ name: string; description?: string }>;
}

export interface CreateWorkspacePayload {
  name: string;
  description?: string;
  parentId?: string;
  templateId?: string;
}

export interface UpdateWorkspacePayload {
  name?: string;
  description?: string;
}

export interface ReparentPayload {
  newParentId: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  totalPages: number;
}
