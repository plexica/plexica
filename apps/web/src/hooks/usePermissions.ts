// apps/web/src/hooks/usePermissions.ts
//
// Phase 3a — TanStack Query hooks for authorization permissions.
// Spec 003: Authorization System RBAC + ABAC

import { useQuery } from '@tanstack/react-query';
import { getPermissions } from '@/hooks/useAuthorizationApi';

export function usePermissions(filters?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['authz', 'permissions', filters] as const,
    queryFn: () => getPermissions(filters),
    staleTime: 300_000,
  });
}
