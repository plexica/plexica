// apps/web/src/components/workspace/MoveWorkspaceDialog.tsx
//
// T011-25: MoveWorkspaceDialog — pick a new parent workspace and re-parent.
// Spec 011 Phase 4 (FR-005, FR-006).
// WCAG 2.1 AA: role="dialog", aria-modal, focus trap (Radix Dialog).
//
// Fixes applied:
//   F-001: Guard against self-reparenting (selectedParentId === workspaceId)
//   F-033: Pino structured logging on mutation error
//   F-013: WorkspaceTreeView showMoveToRoot=true so "move to root" is available

import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
  ModalClose,
} from '@plexica/ui';
import { cn } from '@/lib/utils';
import { WorkspaceTreeView } from './WorkspaceTreeView';
import { apiClient } from '@/lib/api-client';
import type { TreeNodeData } from './WorkspaceTreeNode';
import { logger } from '@/lib/logger';
import { useFeatureFlag } from '@/lib/feature-flags';

// ---------------------------------------------------------------------------
// Error code → user-facing message
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  REPARENT_CYCLE_DETECTED: 'Cannot move a workspace into one of its own descendants.',
  WORKSPACE_SLUG_CONFLICT: 'A workspace with this slug already exists under the selected parent.',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to move this workspace.',
};

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    return ERROR_MESSAGES[code] ?? 'An unexpected error occurred. Please try again.';
  }
  return 'An unexpected error occurred. Please try again.';
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function reparentWorkspace(workspaceId: string, newParentId: string | null): Promise<void> {
  await apiClient.patch(`/api/workspaces/${workspaceId}/parent`, {
    parentId: newParentId,
  });
}

// ---------------------------------------------------------------------------
// Collect descendant IDs from a TreeNodeData[]
// ---------------------------------------------------------------------------

function collectDescendantIds(
  nodes: TreeNodeData[],
  targetId: string,
  collecting: boolean = false
): Set<string> {
  const result = new Set<string>();

  function walk(list: TreeNodeData[], active: boolean) {
    for (const node of list) {
      const isTarget = node.id === targetId;
      const shouldCollect = active || isTarget;
      if (shouldCollect) result.add(node.id);
      if (node.children.length > 0) walk(node.children, shouldCollect);
    }
  }

  walk(nodes, collecting);
  return result;
}

// ---------------------------------------------------------------------------
// MoveWorkspaceDialog
// ---------------------------------------------------------------------------

export interface MoveWorkspaceDialogProps {
  /** The workspace being moved */
  workspaceId: string;
  workspaceName: string;
  /** Controlled open state */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful move */
  onSuccess?: () => void;
  /**
   * Full tree data (passed in so the dialog can compute disabled descendant IDs
   * without a second fetch). If not provided, the dialog will still render but
   * cannot pre-disable descendants until the WorkspaceTreeView loads.
   */
  treeData?: TreeNodeData[];
}

export function MoveWorkspaceDialog({
  workspaceId,
  workspaceName,
  open,
  onOpenChange,
  onSuccess,
  treeData = [],
}: MoveWorkspaceDialogProps) {
  const enabled = useFeatureFlag('ENABLE_WORKSPACE_HIERARCHY');
  const queryClient = useQueryClient();
  /**
   * `undefined`        — no selection yet (Confirm disabled)
   * `null`             — "make root" (parentId: null is valid)
   * `string` (UUID)    — selected parent workspace id
   */
  const [selectedParentId, setSelectedParentId] = useState<string | null | undefined>(undefined);
  const [apiError, setApiError] = useState<string | null>(null);

  // Compute disabled IDs: the workspace itself and all its descendants
  // INFO-5 fix: memoize so the Set reference is stable across re-renders
  const disabledIds = useMemo(
    () => collectDescendantIds(treeData, workspaceId),
    [treeData, workspaceId]
  );

  // WARNING #7 fix: reset selection if workspaceId changes while the dialog is
  // open (e.g. parent component swaps the prop). Stale selection would allow
  // confirming a move to a previously-selected parent that may now be invalid.
  useEffect(() => {
    if (open) {
      setSelectedParentId(undefined);
      setApiError(null);
    }
  }, [workspaceId, open]);

  const { mutate, isPending } = useMutation({
    // selectedParentId is guaranteed non-undefined when handleConfirm fires
    mutationFn: () => reparentWorkspace(workspaceId, selectedParentId ?? null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-tree'] });
      setApiError(null);
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (err) => {
      // F-033: structured error log
      logger.error(
        { component: 'MoveWorkspaceDialog', workspaceId, selectedParentId },
        'Failed to reparent workspace'
      );
      setApiError(getErrorMessage(err));
    },
  });

  function handleConfirm() {
    if (selectedParentId === undefined) return;
    // F-001: guard against self-reparenting
    if (selectedParentId === workspaceId) {
      logger.warn(
        { component: 'MoveWorkspaceDialog', workspaceId },
        'Self-reparenting attempt blocked'
      );
      setApiError('Cannot move a workspace into itself.');
      return;
    }
    setApiError(null);
    mutate();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedParentId(undefined);
      setApiError(null);
    }
    onOpenChange(nextOpen);
  }

  if (!enabled) return null;

  return (
    <Modal open={open} onOpenChange={handleOpenChange}>
      <ModalContent
        aria-modal="true"
        aria-labelledby="move-dialog-title"
        className="max-w-xl"
        data-testid="move-workspace-dialog"
      >
        <ModalHeader>
          <ModalTitle id="move-dialog-title">Move workspace</ModalTitle>
          <ModalDescription>
            Select a new parent for <strong>{workspaceName}</strong>. The current workspace and its
            descendants cannot be selected as the new parent.
          </ModalDescription>
        </ModalHeader>

        {/* Tree picker */}
        <div
          className="max-h-72 overflow-y-auto rounded-md border border-border p-2"
          aria-label="Select new parent workspace"
        >
          <WorkspaceTreeView
            selectedId={selectedParentId}
            disabledIds={disabledIds}
            onSelect={setSelectedParentId}
            showMoveToRoot
          />
        </div>

        {/* Error message */}
        {apiError && (
          <p className="text-sm text-destructive" role="alert" data-testid="move-error">
            {apiError}
          </p>
        )}

        <ModalFooter>
          <ModalClose asChild>
            <button
              type="button"
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium border border-border',
                'hover:bg-muted transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]'
              )}
            >
              Cancel
            </button>
          </ModalClose>
          <button
            type="button"
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground',
              'hover:opacity-90 transition-opacity',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
              (selectedParentId === undefined || isPending) && 'opacity-50 cursor-not-allowed'
            )}
            onClick={handleConfirm}
            disabled={selectedParentId === undefined || isPending}
            aria-label="Confirm move workspace"
            data-testid="confirm-move"
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                Moving…
              </span>
            ) : (
              'Move workspace'
            )}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
