// use-current-user.ts
// Hook to fetch the current authenticated user's profile from the API.
// Uses TanStack Query for caching, loading, and error states.

import { useQuery } from '@tanstack/react-query';

import type { UserProfile } from '../types/auth.js';
import { apiClient } from '../services/api-client.js';

interface UseCurrentUserResult {
  user: UserProfile | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useCurrentUser(): UseCurrentUserResult {
  const { data, isLoading, isError } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => apiClient.get<UserProfile>('/me'),
    staleTime: 5 * 60 * 1_000, // 5 minutes
    retry: 1,
  });

  return { user: data, isLoading, isError };
}
