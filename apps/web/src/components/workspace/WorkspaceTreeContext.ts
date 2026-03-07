// apps/web/src/components/workspace/WorkspaceTreeContext.ts
//
// Tree focus context for WorkspaceTreeNode / WorkspaceTreeView.
// Extracted from WorkspaceTreeNode.tsx so that file can export only React
// components, satisfying the react-refresh/only-export-components rule.

import { createContext, useContext } from 'react';

export interface TreeFocusContextValue {
  /** Flat ordered list of focusable node element refs by id */
  registerNode: (id: string, el: HTMLDivElement | null) => void;
  focusNext: (currentId: string) => void;
  focusPrev: (currentId: string) => void;
  focusFirst: () => void;
  focusLast: () => void;
  /** The id of the node that currently holds tabIndex=0 (roving tabindex) */
  focusedId: string | null;
  setFocusedId: (id: string | null) => void;
}

export const TreeFocusContext = createContext<TreeFocusContextValue | null>(null);

export function useTreeFocus() {
  return useContext(TreeFocusContext);
}
