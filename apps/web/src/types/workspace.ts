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

export interface WorkspaceTemplateChild {
  name: string;
  description?: string;
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

/** Safely parse the `structure` JSON field into child workspace entries. */
export function getTemplateChildren(template: WorkspaceTemplate): WorkspaceTemplateChild[] {
  if (!Array.isArray(template.structure)) return [];
  return template.structure.filter(
    (item): item is WorkspaceTemplateChild =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).name === 'string'
  );
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
