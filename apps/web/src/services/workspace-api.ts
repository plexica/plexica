// workspace-api.ts
// Typed API functions for workspace domain.
// Used by TanStack Query hooks in use-workspaces.ts and use-workspace-templates.ts.

import { apiClient } from './api-client.js';

import type {
  Workspace,
  WorkspaceDetail,
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

  // Backend returns WorkspaceDetail directly (no { data } wrapper)
  get: (id: string) => apiClient.get<WorkspaceDetail>(`/api/v1/workspaces/${id}`),

  // Backend returns WorkspaceDetailDto directly (same shape as get)
  hierarchy: (id: string) => apiClient.get<WorkspaceDetail>(`/api/v1/workspaces/${id}/hierarchy`),

  create: (payload: CreateWorkspacePayload) =>
    apiClient.post<WorkspaceDetail>('/api/v1/workspaces', payload),

  update: (id: string, payload: UpdateWorkspacePayload) =>
    apiClient.patch<WorkspaceDetail>(`/api/v1/workspaces/${id}`, payload),

  delete: (id: string) => apiClient.delete<void>(`/api/v1/workspaces/${id}`),

  restore: (id: string) => apiClient.post<WorkspaceDetail>(`/api/v1/workspaces/${id}/restore`),

  reparent: (id: string, payload: ReparentPayload) =>
    apiClient.post<WorkspaceDetail>(`/api/v1/workspaces/${id}/reparent`, payload),

  // Backend returns { data: WorkspaceMemberDto[], total } (wrapped)
  listMembers: (id: string) =>
    apiClient.get<{ data: WorkspaceMember[]; total: number }>(`/api/v1/workspaces/${id}/members`),

  addMember: (id: string, payload: { userId: string; role: string }) =>
    apiClient.post<WorkspaceMember>(`/api/v1/workspaces/${id}/members`, payload),

  removeMember: (id: string, userId: string) =>
    apiClient.delete<void>(`/api/v1/workspaces/${id}/members/${userId}`),

  changeMemberRole: (id: string, userId: string, role: string) =>
    apiClient.patch<WorkspaceMember>(`/api/v1/workspaces/${id}/members/${userId}`, {
      role,
    }),

  // Backend returns WorkspaceTemplateRow[] directly (no wrapper)
  listTemplates: () => apiClient.get<WorkspaceTemplate[]>('/api/v1/workspaces/templates'),

  createTemplate: (payload: { name: string; description?: string; structure: unknown[] }) =>
    apiClient.post<WorkspaceTemplate>('/api/v1/workspaces/templates', payload),
};
