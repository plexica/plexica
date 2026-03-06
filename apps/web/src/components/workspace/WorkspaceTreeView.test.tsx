// apps/web/src/components/workspace/WorkspaceTreeView.test.tsx
//
// T011-21: Unit tests for WorkspaceTreeView component.
// Spec 011 Phase 4 — FR-013, FR-014.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WorkspaceTreeView } from './WorkspaceTreeView';
import type { TreeNodeData } from './WorkspaceTreeNode';

// Mock apiClient
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
  default: {
    get: vi.fn(),
  },
}));

// Mock feature flags — ENABLE_WORKSPACE_HIERARCHY must be true so the component renders
vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: (flag: string) => flag === 'ENABLE_WORKSPACE_HIERARCHY',
}));

import { apiClient } from '@/lib/api-client';

function makeTree(count = 2): TreeNodeData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `ws-${i}`,
    slug: `workspace-${i}`,
    name: `Workspace ${i}`,
    description: null,
    depth: 0,
    path: `ws-${i}`,
    parentId: null,
    memberRole: 'ADMIN',
    _count: { members: 3, children: 0 },
    children: [],
  }));
}

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('WorkspaceTreeView', () => {
  it('shows loading skeleton while fetching', () => {
    // Never resolves
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockReturnValue(
      new Promise(() => {})
    );
    render(<WorkspaceTreeView />, { wrapper });
    expect(screen.getByLabelText('Loading workspace tree')).toBeInTheDocument();
  });

  it('renders tree nodes when data loads', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(3)
    );
    render(<WorkspaceTreeView />, { wrapper });
    expect(await screen.findByText('Workspace 0')).toBeInTheDocument();
    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
    expect(screen.getByText('Workspace 2')).toBeInTheDocument();
  });

  it('renders role="tree" with aria-label', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(1)
    );
    render(<WorkspaceTreeView />, { wrapper });
    const tree = await screen.findByRole('tree', { name: 'Workspace hierarchy' });
    expect(tree).toBeInTheDocument();
  });

  it('shows empty state when tree is empty', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      []
    );
    render(<WorkspaceTreeView />, { wrapper });
    expect(await screen.findByText('No workspaces found.')).toBeInTheDocument();
  });

  it('shows error message on fetch failure', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockRejectedValue(
      new Error('Network error')
    );
    render(<WorkspaceTreeView />, { wrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Failed to load workspace hierarchy.'
    );
  });

  it('marks selected node via selectedId prop', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView selectedId="ws-1" />, { wrapper });
    // All treeitem elements load — the matching one should have aria-selected=true
    await screen.findByText('Workspace 0');
    const items = screen.getAllByRole('treeitem');
    const selected = items.find((el) => el.getAttribute('aria-selected') === 'true');
    expect(selected).toBeTruthy();
  });

  it('disables nodes in disabledIds set', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView disabledIds={new Set(['ws-0'])} />, { wrapper });
    await screen.findByText('Workspace 0');
    const items = screen.getAllByRole('treeitem');
    const disabled = items.find((el) => el.getAttribute('aria-disabled') === 'true');
    expect(disabled).toBeTruthy();
  });

  it('disables a non-root workspace when its id is in disabledIds (WARNING-1 regression)', async () => {
    // ws-root is NOT in disabledIds; ws-child IS in disabledIds.
    // Before the fix, ws-child inherited disabled={false} from ws-root and was
    // incorrectly enabled. After the fix, each node is checked against disabledIds.
    const tree: TreeNodeData[] = [
      {
        id: 'ws-root',
        slug: 'ws-root',
        name: 'Root',
        description: null,
        depth: 0,
        path: 'ws-root',
        parentId: null,
        memberRole: 'ADMIN',
        _count: { members: 1, children: 1 },
        children: [
          {
            id: 'ws-child',
            slug: 'ws-child',
            name: 'Child',
            description: null,
            depth: 1,
            path: 'ws-root/ws-child',
            parentId: 'ws-root',
            memberRole: 'ADMIN',
            _count: { members: 0, children: 0 },
            children: [],
          },
        ],
      },
    ];
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      tree
    );
    render(<WorkspaceTreeView disabledIds={new Set(['ws-child'])} />, { wrapper });
    await screen.findByText('Root');
    // The Child node must be rendered (tree is defaultExpanded)
    expect(await screen.findByText('Child')).toBeInTheDocument();
    const items = screen.getAllByRole('treeitem');
    const childItem = items.find((el) => el.textContent?.includes('Child'));
    expect(childItem).toBeTruthy();
    // Child must be aria-disabled even though its parent (Root) is not disabled
    expect(childItem).toHaveAttribute('aria-disabled', 'true');
    // Root must NOT be disabled
    const rootItem = items.find((el) => el.textContent?.includes('Root'));
    expect(rootItem).toHaveAttribute('aria-disabled', 'false');
  });

  it('handles trees with nested children (depth > 1)', async () => {
    const tree: TreeNodeData[] = [
      {
        id: 'root',
        slug: 'root',
        name: 'Root',
        description: null,
        depth: 0,
        path: 'root',
        parentId: null,
        memberRole: 'ADMIN',
        _count: { members: 1, children: 1 },
        children: [
          {
            id: 'child',
            slug: 'child',
            name: 'Child',
            description: null,
            depth: 1,
            path: 'root/child',
            parentId: 'root',
            memberRole: 'MEMBER',
            _count: { members: 1, children: 0 },
            children: [],
          },
        ],
      },
    ];
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      tree
    );
    render(<WorkspaceTreeView />, { wrapper });
    // defaultExpanded=true on root should show child
    expect(await screen.findByText('Root')).toBeInTheDocument();
    expect(await screen.findByText('Child')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Search functionality tests (WARNING #7 — previously zero coverage)
// ---------------------------------------------------------------------------

describe('WorkspaceTreeView — search', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a search input', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');
    expect(screen.getByRole('searchbox', { name: 'Search workspaces' })).toBeInTheDocument();
  });

  it('filters nodes by name after 300ms debounce', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(3)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    fireEvent.change(input, { target: { value: 'Workspace 1' } });

    // Before debounce fires, all nodes still visible
    expect(screen.getByText('Workspace 0')).toBeInTheDocument();

    // Advance timers to fire the 300ms debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Only the matching node should remain
    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
    expect(screen.queryByText('Workspace 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Workspace 2')).not.toBeInTheDocument();
  });

  it('filters nodes by slug after debounce', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    // Slugs are "workspace-0", "workspace-1"
    fireEvent.change(input, { target: { value: 'workspace-1' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
    expect(screen.queryByText('Workspace 0')).not.toBeInTheDocument();
  });

  it('is case-insensitive in name matching', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    fireEvent.change(input, { target: { value: 'WORKSPACE 0' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('Workspace 0')).toBeInTheDocument();
    expect(screen.queryByText('Workspace 1')).not.toBeInTheDocument();
  });

  it('shows "No workspaces match" message after debounce when no results', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    fireEvent.change(input, { target: { value: 'zzznotfound' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole('status')).toHaveTextContent(/No workspaces match/);
    // Confirm the tree is hidden (no treeitem roles)
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
  });

  it('does NOT show "No workspaces match" message before the 300ms debounce fires', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    fireEvent.change(input, { target: { value: 'zzznotfound' } });

    // Still within debounce window — original tree should be visible
    expect(screen.queryByText(/No workspaces match/)).not.toBeInTheDocument();
    expect(screen.getByText('Workspace 0')).toBeInTheDocument();

    // Clean up to avoid timer leaks
    act(() => {
      vi.advanceTimersByTime(300);
    });
  });

  it('restores full tree after clearing the search input', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    fireEvent.change(input, { target: { value: 'Workspace 1' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText('Workspace 0')).not.toBeInTheDocument();

    // Clear the search
    fireEvent.change(input, { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText('Workspace 0')).toBeInTheDocument();
    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
  });

  it('announces result count via aria-live region when search returns results', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(3)
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Workspace 0');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    fireEvent.change(input, { target: { value: 'Workspace 1' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // The sr-only aria-live region should announce the count
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion?.textContent).toBe('1 workspace found');
  });

  it('shows ancestor nodes dimmed (opacity-40) when they match only via child', async () => {
    const tree: TreeNodeData[] = [
      {
        id: 'ws-root',
        slug: 'ws-root',
        name: 'Root Workspace',
        description: null,
        depth: 0,
        path: 'ws-root',
        parentId: null,
        memberRole: 'ADMIN',
        _count: { members: 1, children: 1 },
        children: [
          {
            id: 'ws-child',
            slug: 'matching-child',
            name: 'Matching Child',
            description: null,
            depth: 1,
            path: 'ws-root/ws-child',
            parentId: 'ws-root',
            memberRole: 'ADMIN',
            _count: { members: 0, children: 0 },
            children: [],
          },
        ],
      },
    ];
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      tree
    );
    render(<WorkspaceTreeView />, { wrapper });
    await screen.findByText('Root Workspace');

    const input = screen.getByRole('searchbox', { name: 'Search workspaces' });
    // Search matches the child but NOT the root
    fireEvent.change(input, { target: { value: 'Matching Child' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Both root and child should be visible
    expect(screen.getByText('Root Workspace')).toBeInTheDocument();
    expect(screen.getByText('Matching Child')).toBeInTheDocument();

    // Root ancestor should have opacity-40 (dimmed)
    const treeitems = screen.getAllByRole('treeitem');
    const rootItem = treeitems.find((el) => el.textContent?.includes('Root Workspace'));
    expect(rootItem?.className).toMatch(/opacity-40/);

    // Child (direct match) should NOT be dimmed
    const childItem = treeitems.find((el) => el.textContent?.includes('Matching Child'));
    expect(childItem?.className).not.toMatch(/opacity-40/);
  });
});

// ---------------------------------------------------------------------------
// showMoveToRoot / MoveToRootItem tests (WARNING #8 — previously zero coverage)
// ---------------------------------------------------------------------------

describe('WorkspaceTreeView — showMoveToRoot', () => {
  it('does not render "Move to root level" option by default', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(1)
    );
    render(<WorkspaceTreeView onSelect={vi.fn()} />, { wrapper });
    await screen.findByText('Workspace 0');
    expect(screen.queryByTestId('move-to-root-option')).not.toBeInTheDocument();
  });

  it('renders "Move to root level" option when showMoveToRoot=true', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(1)
    );
    render(<WorkspaceTreeView showMoveToRoot onSelect={vi.fn()} />, { wrapper });
    await screen.findByText('Move to root level');
    expect(screen.getByTestId('move-to-root-option')).toBeInTheDocument();
  });

  it('calls onSelect(null) when "Move to root level" is clicked', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(1)
    );
    const onSelect = vi.fn();
    render(<WorkspaceTreeView showMoveToRoot onSelect={onSelect} />, { wrapper });
    await screen.findByText('Move to root level');
    fireEvent.click(screen.getByTestId('move-to-root-option'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('"Move to root level" has aria-selected=true when selectedId=null', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(1)
    );
    render(<WorkspaceTreeView showMoveToRoot onSelect={vi.fn()} selectedId={null} />, { wrapper });
    await screen.findByText('Move to root level');
    const rootOption = screen.getByTestId('move-to-root-option');
    expect(rootOption).toHaveAttribute('aria-selected', 'true');
  });

  it('"Move to root level" has aria-selected=false when selectedId is a workspace id', async () => {
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView showMoveToRoot onSelect={vi.fn()} selectedId="ws-0" />, { wrapper });
    await screen.findByText('Move to root level');
    const rootOption = screen.getByTestId('move-to-root-option');
    expect(rootOption).toHaveAttribute('aria-selected', 'false');
  });

  it('"Move to root level" responds to Enter key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(1)
    );
    const onSelect = vi.fn();
    render(<WorkspaceTreeView showMoveToRoot onSelect={onSelect} />, { wrapper });
    await waitFor(() => screen.getByText('Move to root level'));
    act(() => vi.runAllTimers());

    const rootOption = screen.getByTestId('move-to-root-option');
    fireEvent.keyDown(rootOption, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(null);
    vi.useRealTimers();
  });

  it('"Move to root level" responds to Space key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(1)
    );
    const onSelect = vi.fn();
    render(<WorkspaceTreeView showMoveToRoot onSelect={onSelect} />, { wrapper });
    await waitFor(() => screen.getByText('Move to root level'));
    act(() => vi.runAllTimers());

    const rootOption = screen.getByTestId('move-to-root-option');
    fireEvent.keyDown(rootOption, { key: ' ' });
    expect(onSelect).toHaveBeenCalledWith(null);
    vi.useRealTimers();
  });

  it('ArrowDown from "Move to root level" moves focus to the first workspace node', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked((apiClient as unknown as { get: ReturnType<typeof vi.fn> }).get).mockResolvedValue(
      makeTree(2)
    );
    render(<WorkspaceTreeView showMoveToRoot onSelect={vi.fn()} />, { wrapper });
    await waitFor(() => screen.getByText('Move to root level'));

    // Flush rAF node-order rebuild
    act(() => vi.runAllTimers());

    const rootOption = screen.getByTestId('move-to-root-option');
    rootOption.focus();
    act(() => {
      fireEvent.keyDown(rootOption, { key: 'ArrowDown' });
    });

    // Focus should have moved to the first workspace treeitem
    const treeitems = screen.getAllByRole('treeitem');
    const workspaceItems = treeitems.filter(
      (el) => el.getAttribute('data-testid') !== 'move-to-root-option'
    );
    expect(document.activeElement).toBe(workspaceItems[0]);
    vi.useRealTimers();
  });
});
