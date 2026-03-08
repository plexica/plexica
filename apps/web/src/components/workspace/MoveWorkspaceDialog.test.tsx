// apps/web/src/components/workspace/MoveWorkspaceDialog.test.tsx
//
// T011-25: Unit tests for MoveWorkspaceDialog component.
// Spec 011 Phase 4 — FR-005, FR-006.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MoveWorkspaceDialog } from './MoveWorkspaceDialog';
import type { TreeNodeData } from './WorkspaceTreeNode';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api-client', () => ({
  apiClient: { patch: vi.fn() },
  default: { patch: vi.fn() },
}));

// Mock feature flags — ENABLE_WORKSPACE_HIERARCHY must be true so the component renders
vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: (flag: string) => flag === 'ENABLE_WORKSPACE_HIERARCHY',
}));

import { apiClient } from '@/lib/api-client';

// Mock WorkspaceTreeView to avoid nested data-fetch in unit tests
// The mock exposes a special "make root" button that calls onSelect(null) to
// test CRITICAL-1 fix (null parentId = valid "root" selection).
vi.mock('./WorkspaceTreeView', () => ({
  WorkspaceTreeView: ({
    onSelect,
    selectedId,
    disabledIds,
  }: {
    onSelect?: (id: string | null) => void;
    selectedId?: string | null;
    disabledIds?: Set<string>;
  }) => (
    <div data-testid="mock-tree-view">
      {['ws-parent-1', 'ws-parent-2', 'ws-self', 'ws-child-1'].map((id) => (
        <button
          key={id}
          onClick={() => !disabledIds?.has(id) && onSelect?.(id)}
          aria-pressed={selectedId === id}
          disabled={disabledIds?.has(id)}
          data-testid={`node-${id}`}
        >
          {id}
        </button>
      ))}
      {/* Special "Make root" option — passes null to onSelect */}
      <button
        data-testid="node-make-root"
        aria-pressed={selectedId === null}
        onClick={() => onSelect?.(null)}
      >
        make-root
      </button>
    </div>
  ),
}));

// Mock @plexica/ui Modal components
vi.mock('@plexica/ui', () => ({
  Modal: ({
    open,
    children,
    onOpenChange,
  }: {
    open?: boolean;
    children: React.ReactNode;
    onOpenChange?: (v: boolean) => void;
  }) =>
    open ? (
      <div role="dialog" aria-modal="true">
        {children}
        <button onClick={() => onOpenChange?.(false)} data-testid="modal-backdrop-close">
          close-backdrop
        </button>
      </div>
    ) : null,
  ModalContent: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
    <div {...props}>{children}</div>
  ),
  ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalTitle: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <h2 id={id}>{children}</h2>
  ),
  ModalDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <button>{children}</button>,
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTree(): TreeNodeData[] {
  return [
    {
      id: 'ws-parent-1',
      slug: 'parent-1',
      name: 'Parent One',
      description: null,
      depth: 0,
      path: 'ws-parent-1',
      parentId: null,
      memberRole: 'ADMIN',
      _count: { members: 1, children: 1 },
      children: [
        {
          id: 'ws-self',
          slug: 'self',
          name: 'Self',
          description: null,
          depth: 1,
          path: 'ws-parent-1/ws-self',
          parentId: 'ws-parent-1',
          memberRole: 'ADMIN',
          _count: { members: 1, children: 1 },
          children: [
            {
              id: 'ws-child-1',
              slug: 'child-1',
              name: 'Child One',
              description: null,
              depth: 2,
              path: 'ws-parent-1/ws-self/ws-child-1',
              parentId: 'ws-self',
              memberRole: 'MEMBER',
              _count: { members: 1, children: 0 },
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'ws-parent-2',
      slug: 'parent-2',
      name: 'Parent Two',
      description: null,
      depth: 0,
      path: 'ws-parent-2',
      parentId: null,
      memberRole: 'ADMIN',
      _count: { members: 1, children: 0 },
      children: [],
    },
  ];
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MoveWorkspaceDialog', () => {
  it('renders dialog when open=true', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Move workspace' })).toBeInTheDocument();
  });

  it('does not render dialog when open=false', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={false}
        onOpenChange={vi.fn()}
      />,
      { wrapper }
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders tree picker inside dialog', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    expect(screen.getByTestId('mock-tree-view')).toBeInTheDocument();
  });

  it('disables self and descendants in the tree', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    expect(screen.getByTestId('node-ws-self')).toBeDisabled();
    expect(screen.getByTestId('node-ws-child-1')).toBeDisabled();
  });

  it('does not disable valid parent targets', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    expect(screen.getByTestId('node-ws-parent-1')).not.toBeDisabled();
    expect(screen.getByTestId('node-ws-parent-2')).not.toBeDisabled();
  });

  it('confirm button is disabled when no parent selected (undefined sentinel)', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    // Initially selectedParentId = undefined → Confirm disabled
    expect(screen.getByTestId('confirm-move')).toBeDisabled();
  });

  it('confirm button enabled after selecting a parent', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    expect(screen.getByTestId('confirm-move')).not.toBeDisabled();
  });

  it('confirm button is enabled when "make root" (parentId=null) is selected', () => {
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    // Selecting null parentId (make root) must enable the Confirm button
    fireEvent.click(screen.getByTestId('node-make-root'));
    expect(screen.getByTestId('confirm-move')).not.toBeDisabled();
  });

  it('calls PATCH /api/workspaces/:id/parent with null when making root', async () => {
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={onOpenChange}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    // Select "make root" then confirm
    fireEvent.click(screen.getByTestId('node-make-root'));
    fireEvent.click(screen.getByTestId('confirm-move'));
    await waitFor(() => {
      expect(
        (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
      ).toHaveBeenCalledWith('/api/workspaces/ws-self/parent', { parentId: null });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls PATCH /api/workspaces/:id/parent on confirm', async () => {
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={onOpenChange}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    fireEvent.click(screen.getByTestId('confirm-move'));
    await waitFor(() => {
      expect(
        (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
      ).toHaveBeenCalledWith('/api/workspaces/ws-self/parent', { parentId: 'ws-parent-2' });
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('displays REPARENT_CYCLE_DETECTED error message', async () => {
    const error = Object.assign(new Error('Cycle'), { code: 'REPARENT_CYCLE_DETECTED' });
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockRejectedValue(error);
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    fireEvent.click(screen.getByTestId('confirm-move'));
    await waitFor(() => {
      expect(screen.getByTestId('move-error')).toHaveTextContent(
        'Cannot move a workspace into one of its own descendants.'
      );
    });
  });

  it('displays WORKSPACE_SLUG_CONFLICT error message', async () => {
    const error = Object.assign(new Error('Conflict'), { code: 'WORKSPACE_SLUG_CONFLICT' });
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockRejectedValue(error);
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    fireEvent.click(screen.getByTestId('confirm-move'));
    await waitFor(() => {
      expect(screen.getByTestId('move-error')).toHaveTextContent(
        'A workspace with this slug already exists under the selected parent.'
      );
    });
  });

  it('displays INSUFFICIENT_PERMISSIONS error message', async () => {
    const error = Object.assign(new Error('Forbidden'), { code: 'INSUFFICIENT_PERMISSIONS' });
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockRejectedValue(error);
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    fireEvent.click(screen.getByTestId('confirm-move'));
    await waitFor(() => {
      expect(screen.getByTestId('move-error')).toHaveTextContent(
        'You do not have permission to move this workspace.'
      );
    });
  });

  it('calls onSuccess after successful move', async () => {
    vi.mocked(
      (apiClient as unknown as { patch: ReturnType<typeof vi.fn> }).patch
    ).mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    fireEvent.click(screen.getByTestId('confirm-move'));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });

  it('resets selection when dialog is closed and reopened', () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="My Workspace"
        open={true}
        onOpenChange={onOpenChange}
        treeData={makeTree()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    expect(screen.getByTestId('confirm-move')).not.toBeDisabled();

    // Close dialog
    fireEvent.click(screen.getByTestId('modal-backdrop-close'));

    // Reopen
    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MoveWorkspaceDialog
          workspaceId="ws-self"
          workspaceName="My Workspace"
          open={true}
          onOpenChange={onOpenChange}
          treeData={makeTree()}
        />
      </QueryClientProvider>
    );
    // After reopen, no selection → Confirm disabled again
    expect(screen.getByTestId('confirm-move')).toBeDisabled();
  });

  it('resets selection when workspaceId changes while dialog is open (WARNING #7)', () => {
    // This tests the useEffect([workspaceId, open]) reset guard.
    // If a parent swaps the workspaceId prop while the dialog is open, any
    // stale selectedParentId must be cleared to prevent an invalid move.
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <MoveWorkspaceDialog
        workspaceId="ws-self"
        workspaceName="Self"
        open={true}
        onOpenChange={onOpenChange}
        treeData={makeTree()}
      />,
      { wrapper }
    );

    // Select a parent
    fireEvent.click(screen.getByTestId('node-ws-parent-2'));
    expect(screen.getByTestId('confirm-move')).not.toBeDisabled();

    // Swap workspaceId while dialog stays open
    rerender(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MoveWorkspaceDialog
          workspaceId="ws-parent-1"
          workspaceName="Parent One"
          open={true}
          onOpenChange={onOpenChange}
          treeData={makeTree()}
        />
      </QueryClientProvider>
    );

    // selectedParentId must have been reset → Confirm button disabled again
    expect(screen.getByTestId('confirm-move')).toBeDisabled();
  });
});
