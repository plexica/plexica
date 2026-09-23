// use-sessions.ts
// TanStack Query hooks for the caller's active SSO sessions (006-13).
// Logic here — components only call these hooks, never API functions directly.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { profileApi } from '../services/profile-api.js';
import { useAuthStore } from '../stores/auth-store.js';

export const SESSIONS_KEY = 'profile-sessions';

export function useSessions() {
  const accessToken = useAuthStore((state) => state.accessToken);
  return useQuery({
    queryKey: [SESSIONS_KEY],
    queryFn: () => profileApi.listSessions(),
    staleTime: 30_000,
    // Same guard as useProfile: anonymous visits must not fire a 401-ing request.
    enabled: accessToken !== null,
  });
}

export interface RevokeSessionInput {
  id: string;
  /** True when revoking the session this browser acts through. */
  current: boolean;
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  return useMutation({
    mutationFn: (input: RevokeSessionInput) => profileApi.revokeSession(input.id),
    onSuccess: (_data, input) => {
      if (input.current) {
        // Revoking the session this browser acts through ends it Keycloak-side;
        // sign out locally so the user lands on login instead of a 401 cascade.
        void logout();
        return;
      }
      void queryClient.invalidateQueries({ queryKey: [SESSIONS_KEY] });
    },
  });
}
