// workspace-store.ts
// Zustand store for tracking the currently selected workspace.
// Intentionally minimal — workspace data is fetched via TanStack Query hooks.

import { create } from 'zustand';

interface WorkspaceStore {
  currentWorkspaceId: string | null;
  setCurrentWorkspace: (id: string) => void;
  clearWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()((set) => ({
  currentWorkspaceId: null,
  setCurrentWorkspace: (id) => set({ currentWorkspaceId: id }),
  clearWorkspace: () => set({ currentWorkspaceId: null }),
}));
