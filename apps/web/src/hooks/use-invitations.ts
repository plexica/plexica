// use-invitations.ts
// TanStack Query hooks for workspace invitation management.
// Logic here — components only call these hooks, never API functions directly.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { invitationApi } from '../services/user-api.js';

import type { InviteUserPayload } from '../types/user-management.js';

export function useInvitations(workspaceId: string) {
  return useQuery({
    queryKey: ['invitations', workspaceId],
    queryFn: () => invitationApi.list(workspaceId),
    enabled: workspaceId !== '',
  });
}

export function useSendInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InviteUserPayload) => invitationApi.send(payload),
    onSuccess: (_data, payload) => {
      void queryClient.invalidateQueries({
        queryKey: ['invitations', payload.workspaceId],
      });
    },
  });
}

export function useResendInvite() {
  return useMutation({
    mutationFn: (invitationId: string) => invitationApi.resend(invitationId),
  });
}
