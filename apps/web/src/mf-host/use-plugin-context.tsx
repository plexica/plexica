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
  const currentWorkspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const value = useMemo<PluginContextValue>(() => {
    const role =
      userProfile?.roles.includes('super_admin') ? 'admin'
      : userProfile?.roles.includes('tenant_admin') ? 'admin'
      : userProfile?.roles.includes('member') ? 'member'
      : 'viewer';

    return {
      tenantId: tenantSlug ?? '',
      userId: userProfile?.id ?? '',
      workspaceId: currentWorkspaceId,
      role,
      locale: 'en',
    };
  }, [userProfile, tenantSlug, currentWorkspaceId]);

  return <PluginContext.Provider value={value}>{children}</PluginContext.Provider>;
}
