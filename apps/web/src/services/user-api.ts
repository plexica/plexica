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

interface UserListParams {
  search?: string;
  page?: number;
  limit?: number;
}

export const userApi = {
  list: (params?: UserListParams) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return apiClient.get<{ data: TenantUser[]; total: number; page: number; totalPages: number }>(
      `/api/v1/users${qs}`
    );
  },

  remove: (userId: string) => apiClient.delete<void>(`/api/v1/users/${userId}`),

  getWorkspaces: (userId: string) =>
    apiClient.get<{ data: WorkspaceMembership[] }>(`/api/v1/users/${userId}/workspaces`),

  listRoles: () => apiClient.get<Role[]>('/api/v1/roles'),

  getActionMatrix: () => apiClient.get<ActionMatrixRow[]>('/api/v1/roles/action-matrix'),
};

export const invitationApi = {
  list: (workspaceId: string) =>
    apiClient.get<{ data: Invitation[] }>(`/api/v1/workspaces/${workspaceId}/invitations`),

  send: (payload: InviteUserPayload) =>
    apiClient.post<{ data: Invitation }>('/api/v1/users/invite', payload),

  resend: (invitationId: string) =>
    apiClient.post<{ data: Invitation }>(`/api/v1/invitations/${invitationId}/resend`),

  accept: (token: string) =>
    apiClient.post<{ data: Invitation }>(`/api/v1/invitations/${token}/accept`),
};
