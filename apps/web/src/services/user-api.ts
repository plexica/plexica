// user-api.ts
// Typed API functions for user management domain.
// Used by TanStack Query hooks in use-users.ts, use-invitations.ts, use-roles.ts.

import { apiClient } from './api-client.js';

import type {
  TenantUser,
  Invitation,
  Role,
  ActionMatrixRow,
  WorkspaceMembership,
  InviteUserPayload,
} from '../types/user-management.js';
import type { PaginatedResponse } from '../types/workspace.js';

interface UserListParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export const userApi = {
  // The backend envelope is PaginatedResult (lib/pagination.ts) — canonical
  // { data, total, page, pageSize, totalPages } (Decision 4, 2026-08-18).
  list: (params?: UserListParams) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return apiClient.get<PaginatedResponse<TenantUser>>(`/api/v1/users${qs}`);
  },

  remove: (userId: string) => apiClient.delete<void>(`/api/v1/users/${userId}`),

  getWorkspaces: (userId: string) =>
    apiClient.get<{ data: WorkspaceMembership[] }>(`/api/v1/users/${userId}/workspaces`),

  listRoles: () => apiClient.get<Role[]>('/api/v1/roles'),

  getActionMatrix: () => apiClient.get<ActionMatrixRow[]>('/api/v1/roles/action-matrix'),
};

export const invitationApi = {
  list: (workspaceId: string) =>
    apiClient.get<{ data: Invitation[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/v1/workspaces/${workspaceId}/invitations`),

  send: (payload: InviteUserPayload) =>
    apiClient.post<{ data: Invitation }>('/api/v1/users/invite', payload),

  resend: (invitationId: string) =>
    apiClient.post<{ data: Invitation }>(`/api/v1/invitations/${invitationId}/resend`),

  accept: (token: string) =>
    apiClient.post<{ data: Invitation }>(`/api/v1/invitations/${token}/accept`),
};
