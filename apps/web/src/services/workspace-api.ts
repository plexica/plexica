// workspace-api.ts
// Typed API functions for workspace domain.
// Used by TanStack Query hooks in use-workspaces.ts and use-workspace-templates.ts.

import { apiClient } from './api-client.js';

import type {
  Workspace,
  WorkspaceDetail,
  WorkspaceTreeNode,
  WorkspaceMember,
  WorkspaceTemplate,
  CreateWorkspacePayload,
  UpdateWorkspacePayload,
  ReparentPayload,
  PaginatedResponse,
} from '../types/workspace.js';

interface WorkspaceListParams {
  status?: 'active' | 'archived';
  parentId?: string;
  page?: number;
  limit?: number;
}

export const workspaceApi = {
  list: (params?: WorkspaceListParams) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return apiClient.get<PaginatedResponse<Workspace>>(`/api/v1/workspaces${qs}`);
  },

  get: (id: string) => apiClient.get<{ data: WorkspaceDetail }>(`/api/v1/workspaces/${id}`),

  hierarchy: (id: string) =>
    apiClient.get<{ data: WorkspaceTreeNode[] }>(`/api/v1/workspaces/${id}/hierarchy`),

  create: (payload: CreateWorkspacePayload) =>
    apiClient.post<{ data: Workspace }>('/api/v1/workspaces', payload),

  update: (id: string, payload: UpdateWorkspacePayload) =>
    apiClient.patch<{ data: Workspace }>(`/api/v1/workspaces/${id}`, payload),

  delete: (id: string) => apiClient.delete<{ data: Workspace }>(`/api/v1/workspaces/${id}`),

  restore: (id: string) => apiClient.post<{ data: Workspace }>(`/api/v1/workspaces/${id}/restore`),

  reparent: (id: string, payload: ReparentPayload) =>
    apiClient.post<{ data: Workspace }>(`/api/v1/workspaces/${id}/reparent`, payload),

  listMembers: (id: string) =>
    apiClient.get<{ data: WorkspaceMember[] }>(`/api/v1/workspaces/${id}/members`),

  addMember: (id: string, payload: { userId: string; role: string }) =>
    apiClient.post<{ data: WorkspaceMember }>(`/api/v1/workspaces/${id}/members`, payload),

  removeMember: (id: string, userId: string) =>
    apiClient.delete<void>(`/api/v1/workspaces/${id}/members/${userId}`),

  changeMemberRole: (id: string, userId: string, role: string) =>
    apiClient.patch<{ data: WorkspaceMember }>(`/api/v1/workspaces/${id}/members/${userId}`, {
      role,
    }),

  listTemplates: () => apiClient.get<{ data: WorkspaceTemplate[] }>('/api/v1/workspaces/templates'),

  createTemplate: (payload: Omit<WorkspaceTemplate, 'id' | 'isBuiltin'>) =>
    apiClient.post<{ data: WorkspaceTemplate }>('/api/v1/workspaces/templates', payload),
};
