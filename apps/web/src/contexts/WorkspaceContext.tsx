// File: apps/web/src/contexts/WorkspaceContext.tsx

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type { Workspace, WorkspaceRole } from '@/types';

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;

  // Workspace operations
  selectWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (data: {
    slug: string;
    name: string;
    description?: string;
  }) => Promise<Workspace>;
  updateWorkspace: (
    workspaceId: string,
    data: { name?: string; description?: string }
  ) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;

  // Membership operations
  addMember: (workspaceId: string, userId: string, role?: WorkspaceRole) => Promise<void>;
  updateMemberRole: (workspaceId: string, userId: string, role: WorkspaceRole) => Promise<void>;
  removeMember: (workspaceId: string, userId: string) => Promise<void>;

  // Utility
  hasRole: (role: WorkspaceRole | WorkspaceRole[]) => boolean;
  isAdmin: boolean;
  isMember: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return context;
};

interface WorkspaceProviderProps {
  children: React.ReactNode;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef(false);

  const { tenant, isAuthenticated } = useAuthStore();

  /**
   * Fetch user's accessible workspaces
   */
  const refreshWorkspaces = useCallback(async () => {
    if (!isAuthenticated || !tenant) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setIsLoading(false);
      return;
    }

    // Prevent multiple simultaneous fetches
    if (isFetchingRef.current) {
      console.log('[WorkspaceContext] Already fetching, skipping...');
      return;
    }

    try {
      console.log('[WorkspaceContext] Fetching workspaces...');
      isFetchingRef.current = true;
      setIsLoading(true);
      setError(null);

      const fetchedWorkspaces = await apiClient.getWorkspaces();
      console.log('[WorkspaceContext] Fetched workspaces:', fetchedWorkspaces.length);
      setWorkspaces(fetchedWorkspaces);

      // Auto-select workspace based on priority:
      // 1. Previously selected workspace (from localStorage)
      // 2. First workspace in the list
      const storedWorkspaceId = localStorage.getItem(`plexica-workspace-${tenant.slug}`);

      if (storedWorkspaceId) {
        const storedWorkspace = fetchedWorkspaces.find(
          (w: Workspace) => w.id === storedWorkspaceId
        );
        if (storedWorkspace) {
          console.log('[WorkspaceContext] Auto-selected stored workspace:', storedWorkspace.name);
          setCurrentWorkspace(storedWorkspace);
          apiClient.setWorkspaceId(storedWorkspace.id);
          return;
        }
      }

      // Auto-select first workspace if available
      if (fetchedWorkspaces.length > 0) {
        const firstWorkspace = fetchedWorkspaces[0];
        console.log('[WorkspaceContext] Auto-selected first workspace:', firstWorkspace.name);
        setCurrentWorkspace(firstWorkspace);
        apiClient.setWorkspaceId(firstWorkspace.id);
        localStorage.setItem(`plexica-workspace-${tenant.slug}`, firstWorkspace.id);
      } else {
        console.log('[WorkspaceContext] No workspaces available');
        setCurrentWorkspace(null);
        apiClient.setWorkspaceId(null);
      }
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to fetch workspaces:', err);
      setError(err.response?.data?.message || 'Failed to load workspaces');
      setWorkspaces([]);
      setCurrentWorkspace(null);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [isAuthenticated, tenant]);

  /**
   * Select a workspace as current
   */
  const selectWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        setError(null);

        // Find workspace in local list first
        let workspace = workspaces.find((w) => w.id === workspaceId);

        // If not found, fetch details from API
        if (!workspace) {
          workspace = await apiClient.getWorkspace(workspaceId);
        }

        if (!workspace) {
          throw new Error('Workspace not found');
        }

        setCurrentWorkspace(workspace);
        apiClient.setWorkspaceId(workspace.id);

        // Persist selection
        if (tenant) {
          localStorage.setItem(`plexica-workspace-${tenant.slug}`, workspace.id);
        }

        console.log('[WorkspaceContext] Workspace selected:', workspace.name);
      } catch (err: any) {
        console.error('[WorkspaceContext] Failed to select workspace:', err);
        setError(err.response?.data?.message || 'Failed to select workspace');
        throw err;
      }
    },
    [workspaces, tenant]
  );

  /**
   * Create a new workspace
   */
  const createWorkspace = useCallback(
    async (data: { slug: string; name: string; description?: string }) => {
      try {
        setError(null);

        const newWorkspace = await apiClient.createWorkspace(data);

        // Add to list and auto-select
        setWorkspaces((prev) => [...prev, newWorkspace]);
        await selectWorkspace(newWorkspace.id);

        console.log('[WorkspaceContext] Workspace created:', newWorkspace.name);
        return newWorkspace;
      } catch (err: any) {
        console.error('[WorkspaceContext] Failed to create workspace:', err);
        setError(err.response?.data?.message || 'Failed to create workspace');
        throw err;
      }
    },
    [selectWorkspace]
  );

  /**
   * Update workspace details
   */
  const updateWorkspace = useCallback(
    async (workspaceId: string, data: { name?: string; description?: string }) => {
      try {
        setError(null);

        const updatedWorkspace = await apiClient.updateWorkspace(workspaceId, data);

        // Update in list
        setWorkspaces((prev) =>
          prev.map((w) => (w.id === workspaceId ? { ...w, ...updatedWorkspace } : w))
        );

        // Update current if it's the selected one
        if (currentWorkspace?.id === workspaceId) {
          setCurrentWorkspace((prev) => (prev ? { ...prev, ...updatedWorkspace } : null));
        }

        console.log('[WorkspaceContext] Workspace updated:', workspaceId);
      } catch (err: any) {
        console.error('[WorkspaceContext] Failed to update workspace:', err);
        setError(err.response?.data?.message || 'Failed to update workspace');
        throw err;
      }
    },
    [currentWorkspace]
  );

  /**
   * Delete a workspace
   */
  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        setError(null);

        await apiClient.deleteWorkspace(workspaceId);

        // Remove from list
        setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));

        // If deleted workspace was selected, select another
        if (currentWorkspace?.id === workspaceId) {
          const remainingWorkspaces = workspaces.filter((w) => w.id !== workspaceId);
          if (remainingWorkspaces.length > 0) {
            await selectWorkspace(remainingWorkspaces[0].id);
          } else {
            setCurrentWorkspace(null);
            apiClient.setWorkspaceId(null);
          }
        }

        console.log('[WorkspaceContext] Workspace deleted:', workspaceId);
      } catch (err: any) {
        console.error('[WorkspaceContext] Failed to delete workspace:', err);
        setError(err.response?.data?.message || 'Failed to delete workspace');
        throw err;
      }
    },
    [currentWorkspace, workspaces, selectWorkspace]
  );

  /**
   * Add a member to workspace
   */
  const addMember = useCallback(
    async (workspaceId: string, userId: string, role?: WorkspaceRole) => {
      try {
        setError(null);
        await apiClient.addWorkspaceMember(workspaceId, { userId, role });
        console.log('[WorkspaceContext] Member added to workspace:', workspaceId);
      } catch (err: any) {
        console.error('[WorkspaceContext] Failed to add member:', err);
        setError(err.response?.data?.message || 'Failed to add member');
        throw err;
      }
    },
    []
  );

  /**
   * Update member role in workspace
   */
  const updateMemberRole = useCallback(
    async (workspaceId: string, userId: string, role: WorkspaceRole) => {
      try {
        setError(null);
        await apiClient.updateWorkspaceMemberRole(workspaceId, userId, { role });
        console.log('[WorkspaceContext] Member role updated:', workspaceId, userId, role);
      } catch (err: any) {
        console.error('[WorkspaceContext] Failed to update member role:', err);
        setError(err.response?.data?.message || 'Failed to update member role');
        throw err;
      }
    },
    []
  );

  /**
   * Remove a member from workspace
   */
  const removeMember = useCallback(async (workspaceId: string, userId: string) => {
    try {
      setError(null);
      await apiClient.removeWorkspaceMember(workspaceId, userId);
      console.log('[WorkspaceContext] Member removed from workspace:', workspaceId, userId);
    } catch (err: any) {
      console.error('[WorkspaceContext] Failed to remove member:', err);
      setError(err.response?.data?.message || 'Failed to remove member');
      throw err;
    }
  }, []);

  /**
   * Check if current user has specific role(s) in current workspace
   */
  const hasRole = useCallback(
    (role: WorkspaceRole | WorkspaceRole[]): boolean => {
      if (!currentWorkspace?.memberRole) return false;

      const roles = Array.isArray(role) ? role : [role];
      return roles.includes(currentWorkspace.memberRole);
    },
    [currentWorkspace]
  );

  /**
   * Check if current user is admin of current workspace
   */
  const isAdmin = currentWorkspace?.memberRole === 'ADMIN';

  /**
   * Check if current user is at least a member (ADMIN or MEMBER)
   */
  const isMember =
    currentWorkspace?.memberRole === 'ADMIN' || currentWorkspace?.memberRole === 'MEMBER';

  // Initialize: fetch workspaces when tenant changes
  useEffect(() => {
    if (isAuthenticated && tenant) {
      refreshWorkspaces();
    } else {
      console.log('[WorkspaceContext] Not authenticated or no tenant, skipping fetch');
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, tenant]);

  const value: WorkspaceContextType = {
    workspaces,
    currentWorkspace,
    isLoading,
    error,
    selectWorkspace,
    refreshWorkspaces,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addMember,
    updateMemberRole,
    removeMember,
    hasRole,
    isAdmin,
    isMember,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
