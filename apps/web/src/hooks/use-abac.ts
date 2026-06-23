// use-abac.ts
// Client-side ABAC hint. UI-only — not authoritative. Server enforces real permissions.
// Use only for showing/hiding UI elements; never trust this for security decisions.

import { useAuthStore } from '../stores/auth-store.js';

/**
 * Returns true if the current user is a tenant admin.
 * For workspace-level actions, this is a UI hint only — the server enforces real ABAC.
 * Full workspace role check requires the useWorkspaceMembers hook at usage sites.
 */
export function useAbac(_workspaceId?: string, _action?: string): boolean {
  const roles = useAuthStore((s) => s.userProfile?.roles ?? []);
  return roles.includes('tenant_admin');
}
