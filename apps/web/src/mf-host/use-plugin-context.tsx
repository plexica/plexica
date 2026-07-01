// use-plugin-context.tsx
// React hook + provider that gives plugin MF components access to shell context.

import { createContext, useContext, useMemo } from 'react';

import { useAuthStore } from '../stores/auth-store.js';
import { useWorkspaceStore } from '../stores/workspace-store.js';

export interface PluginContextValue {
  tenantId: string;
  userId: string;
  workspaceId: string | null;
  role: string;
  locale: string;
}

const DEFAULT_CONTEXT: PluginContextValue = {
  tenantId: '',
  userId: '',
  workspaceId: null,
  role: 'viewer',
  locale: 'en',
};

export const PluginContext = createContext<PluginContextValue>(DEFAULT_CONTEXT);

export function usePluginContext(): PluginContextValue {
  return useContext(PluginContext);
}

export function PluginContextProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const userProfile = useAuthStore((s) => s.userProfile);
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const tenantUuid = useAuthStore((s) => s.tenantUuid);
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const value = useMemo<PluginContextValue>(() => {
    const role =
      userProfile?.roles.includes('super_admin') ? 'super_admin'
      : userProfile?.roles.includes('tenant_admin') ? 'admin'
      : userProfile?.roles.includes('member') ? 'member'
      : 'viewer';

    // UUID is preferred for security (prevents tenant enumeration via slug guessing).
    // Falls back to slug when UUID is not yet available (e.g. initial page load).
    const tenantId = tenantUuid ?? tenantSlug ?? '';

    return {
      tenantId,
      userId: userProfile?.id ?? '',
      workspaceId: currentWorkspaceId,
      role,
      locale: 'en',
    };
  }, [userProfile, tenantSlug, tenantUuid, currentWorkspaceId]);

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}
