// workspace.ts — Re-export from @plexica/api-types (ADR-029).
// Workspace domain types are sourced from the shared package.
// App-specific payload types stay here.

export type {
  Workspace,
  WorkspaceDetail,
  WorkspaceTreeNode,
  WorkspaceMember,
  WorkspaceTemplate,
} from '@plexica/api-types';

import type { PaginatedResult } from '@plexica/api-types';

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

/** Alias for backward compat — apps/web uses PaginatedResponse<T>. */
export type PaginatedResponse<T> = PaginatedResult<T>;

/** Safely parse the `structure` JSON field into child workspace entries. */
export function getTemplateChildren(
  template: { structure: unknown },
): Array<{ name: string; description?: string }> {
  if (!Array.isArray(template.structure)) return [];
  return template.structure.filter(
    (item): item is { name: string; description?: string } =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).name === 'string',
  );
}
