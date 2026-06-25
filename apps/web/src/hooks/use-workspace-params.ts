// use-workspace-params.ts
// Shared hook to extract the workspaceId URL parameter.
// Centralises the strict:false + type-cast workaround pending TanStack Router
// full route-tree codegen (TD-003).

import { useParams } from '@tanstack/react-router';

export function useWorkspaceId(): string {
  const params = useParams({ strict: false });
  return (params as Record<string, string>).workspaceId ?? '';
}
