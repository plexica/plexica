// apps/web/src/components/workspace/WorkspaceTreeNode.test.tsx
//
// T011-20: Unit tests for WorkspaceTreeNode component.
// Spec 011 Phase 4 — FR-013, FR-014.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WorkspaceTreeNode, TreeFocusProvider } from './WorkspaceTreeNode';
import type { TreeNodeData } from './WorkspaceTreeNode';

// ---------------------------------------------------------------------------
// rAF stub helpers
// ---------------------------------------------------------------------------
// WorkspaceTreeNode's TreeFocusProvider debounces node-order rebuilds via
// requestAnimationFrame. In jsdom rAF callbacks never fire, so keyboard-
// navigation tests (ArrowDown / ArrowUp / Home / End) need to flush rAF
// synchronously.  We use vi.useFakeTimers() scoped to those describe blocks.
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<TreeNodeData> = {}): TreeNodeData {
  return {
    id: 'ws-1',
    slug: 'engineering',
    name: 'Engineering',
    description: null,
    depth: 0,
    path: 'ws-1',
    parentId: null,
    memberRole: 'ADMIN',
    _count: { members: 5, children: 0 },
    children: [],
    ...overrides,
  };
}

/** Wrap with TreeFocusProvider so keyboard navigation context is available */
function renderInTree(ui: React.ReactElement) {
  return render(<TreeFocusProvider>{ui}</TreeFocusProvider>);
}

describe('WorkspaceTreeNode', () => {
  it('renders the workspace name and slug', () => {
    renderInTree(<WorkspaceTreeNode node={makeNode()} />);
    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('engineering')).toBeInTheDocument();
  });

  it('has role="treeitem" with correct aria-level', () => {
    renderInTree(<WorkspaceTreeNode node={makeNode()} level={2} />);
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-level', '3');
  });

  it('does not render expand toggle when node has no children', () => {
    const { container } = renderInTree(
      <WorkspaceTreeNode node={makeNode({ _count: { members: 1, children: 0 }, children: [] })} />
    );
    // The chevron is a decorative <span aria-hidden="true">, not a <button> (F-025).
    const chevron = container.querySelector('span[aria-hidden="true"]');
    expect(chevron).toHaveClass('invisible');
  });

  it('shows expand toggle when node has children in _count', () => {
    const node = makeNode({ _count: { members: 2, children: 3 }, children: [] });
    const { container } = renderInTree(<WorkspaceTreeNode node={node} />);
    const chevron = container.querySelector('span[aria-hidden="true"]');
    expect(chevron).not.toHaveClass('invisible');
  });

  it('expands children on toggle click', () => {
    const child = makeNode({
      id: 'ws-child',
      name: 'Frontend',
      slug: 'frontend',
      depth: 1,
      parentId: 'ws-1',
    });
    const parent = makeNode({ _count: { members: 2, children: 1 }, children: [child] });
    renderInTree(<WorkspaceTreeNode node={parent} />);

    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();
    // Clicking the treeitem (no onSelect provided) toggles expand (F-025: no nested button)
    fireEvent.click(screen.getByRole('treeitem'));
    expect(screen.getByText('Frontend')).toBeInTheDocument();
  });

  it('calls onSelect with node id on click', () => {
    const onSelect = vi.fn();
    renderInTree(<WorkspaceTreeNode node={makeNode()} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('treeitem'));
    expect(onSelect).toHaveBeenCalledWith('ws-1');
  });

  it('calls onSelect on Enter key press', () => {
    const onSelect = vi.fn();
    renderInTree(<WorkspaceTreeNode node={makeNode()} onSelect={onSelect} />);
    fireEvent.keyDown(screen.getByRole('treeitem'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('ws-1');
  });

  it('Space key toggles expand/collapse (does NOT select) — WAI-ARIA tree pattern', () => {
    const child = makeNode({
      id: 'ws-child',
      name: 'Frontend',
      slug: 'frontend',
      depth: 1,
      parentId: 'ws-1',
    });
    const parent = makeNode({ _count: { members: 2, children: 1 }, children: [child] });
    const onSelect = vi.fn();
    renderInTree(<WorkspaceTreeNode node={parent} onSelect={onSelect} />);

    const treeItem = screen.getByRole('treeitem', { name: /engineering/i });

    // Space should expand (not select)
    fireEvent.keyDown(treeItem, { key: ' ' });
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();

    // Space again should collapse
    fireEvent.keyDown(treeItem, { key: ' ' });
    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();
  });

  it('expands on ArrowRight key and collapses on ArrowLeft', () => {
    const child = makeNode({
      id: 'ws-child',
      name: 'Frontend',
      slug: 'frontend',
      depth: 1,
      parentId: 'ws-1',
    });
    const parent = makeNode({ _count: { members: 1, children: 1 }, children: [child] });
    renderInTree(<WorkspaceTreeNode node={parent} />);

    const treeItem = screen.getByRole('treeitem', { name: /engineering/i });
    // expand
    fireEvent.keyDown(treeItem, { key: 'ArrowRight' });
    expect(screen.getByText('Frontend')).toBeInTheDocument();
    // collapse
    fireEvent.keyDown(treeItem, { key: 'ArrowLeft' });
    expect(screen.queryByText('Frontend')).not.toBeInTheDocument();
  });

  it('ArrowLeft on already-collapsed child moves focus to parent (WAI-ARIA H-001)', () => {
    vi.useFakeTimers();
    const child = makeNode({
      id: 'ws-child',
      name: 'Frontend',
      slug: 'frontend',
      depth: 1,
      parentId: 'ws-1',
    });
    const parent = makeNode({ _count: { members: 1, children: 1 }, children: [child] });
    renderInTree(
      <ul role="tree">
        <WorkspaceTreeNode node={parent} defaultExpanded />
      </ul>
    );

    act(() => {
      vi.runAllTimers();
    });

    // Focus the child (it is already collapsed — no grandchildren)
    const childItem = screen.getByRole('treeitem', { name: /frontend/i });
    childItem.focus();

    // ArrowLeft on collapsed child should return focus to parent
    act(() => {
      fireEvent.keyDown(childItem, { key: 'ArrowLeft' });
    });

    const parentItem = screen.getByRole('treeitem', { name: /engineering/i });
    expect(document.activeElement).toBe(parentItem);
    vi.useRealTimers();
  });

  it('ArrowDown moves focus to the first child of an expanded node', () => {
    // rAF is used to debounce node-order rebuild inside TreeFocusProvider.
    // Use fake timers + vi.runAllTimers() to flush it synchronously.
    vi.useFakeTimers();
    const child = makeNode({
      id: 'ws-child',
      name: 'Frontend',
      slug: 'frontend',
      depth: 1,
      parentId: 'ws-1',
    });
    const parent = makeNode({ _count: { members: 1, children: 1 }, children: [child] });

    // Render two root nodes so there is a "next" node to focus
    renderInTree(
      <ul role="tree">
        <WorkspaceTreeNode node={parent} defaultExpanded />
        <WorkspaceTreeNode node={makeNode({ id: 'ws-sibling', name: 'Design', slug: 'design' })} />
      </ul>
    );

    // Flush the rAF that rebuilds node order
    act(() => {
      vi.runAllTimers();
    });

    const engineeringItem = screen.getByRole('treeitem', { name: /engineering/i });
    // The child node should have been registered; pressing ArrowDown from root
    // should move focus to the first child (Frontend)
    engineeringItem.focus();
    act(() => {
      fireEvent.keyDown(engineeringItem, { key: 'ArrowDown' });
    });

    const frontendItem = screen.getByRole('treeitem', { name: /frontend/i });
    expect(document.activeElement).toBe(frontendItem);
    vi.useRealTimers();
  });

  it('ArrowUp moves focus to the previous visible node', () => {
    vi.useFakeTimers();
    renderInTree(
      <ul role="tree">
        <WorkspaceTreeNode node={makeNode({ id: 'ws-first', name: 'First', slug: 'first' })} />
        <WorkspaceTreeNode node={makeNode({ id: 'ws-second', name: 'Second', slug: 'second' })} />
      </ul>
    );

    act(() => {
      vi.runAllTimers();
    });

    const secondItem = screen.getByRole('treeitem', { name: /second/i });
    secondItem.focus();
    act(() => {
      fireEvent.keyDown(secondItem, { key: 'ArrowUp' });
    });

    const firstItem = screen.getByRole('treeitem', { name: /first/i });
    expect(document.activeElement).toBe(firstItem);
    vi.useRealTimers();
  });

  it('Home key moves focus to the first node in the tree', () => {
    vi.useFakeTimers();
    renderInTree(
      <ul role="tree">
        <WorkspaceTreeNode node={makeNode({ id: 'ws-a', name: 'Alpha', slug: 'alpha' })} />
        <WorkspaceTreeNode node={makeNode({ id: 'ws-b', name: 'Beta', slug: 'beta' })} />
        <WorkspaceTreeNode node={makeNode({ id: 'ws-c', name: 'Gamma', slug: 'gamma' })} />
      </ul>
    );

    act(() => {
      vi.runAllTimers();
    });

    const gammaItem = screen.getByRole('treeitem', { name: /gamma/i });
    gammaItem.focus();
    act(() => {
      fireEvent.keyDown(gammaItem, { key: 'Home' });
    });

    const alphaItem = screen.getByRole('treeitem', { name: /alpha/i });
    expect(document.activeElement).toBe(alphaItem);
    vi.useRealTimers();
  });

  it('End key moves focus to the last visible node in the tree', () => {
    vi.useFakeTimers();
    renderInTree(
      <ul role="tree">
        <WorkspaceTreeNode node={makeNode({ id: 'ws-a', name: 'Alpha', slug: 'alpha' })} />
        <WorkspaceTreeNode node={makeNode({ id: 'ws-b', name: 'Beta', slug: 'beta' })} />
        <WorkspaceTreeNode node={makeNode({ id: 'ws-c', name: 'Gamma', slug: 'gamma' })} />
      </ul>
    );

    act(() => {
      vi.runAllTimers();
    });

    const alphaItem = screen.getByRole('treeitem', { name: /alpha/i });
    alphaItem.focus();
    act(() => {
      fireEvent.keyDown(alphaItem, { key: 'End' });
    });

    const gammaItem = screen.getByRole('treeitem', { name: /gamma/i });
    expect(document.activeElement).toBe(gammaItem);
    vi.useRealTimers();
  });

  it('shows INHERITED badge when memberRole is null (hierarchical reader)', () => {
    renderInTree(<WorkspaceTreeNode node={makeNode({ memberRole: null })} />);
    expect(screen.getByText('INHERITED')).toBeInTheDocument();
    expect(screen.getByLabelText('Read-only via ancestor admin access')).toBeInTheDocument();
  });

  it('does not show INHERITED badge for direct members', () => {
    renderInTree(<WorkspaceTreeNode node={makeNode({ memberRole: 'MEMBER' })} />);
    expect(screen.queryByText('INHERITED')).not.toBeInTheDocument();
  });

  it('applies depth-based indentation via inline style', () => {
    const { container } = renderInTree(<WorkspaceTreeNode node={makeNode()} level={3} />);
    const treeItem = container.querySelector('[role="treeitem"]');
    expect(treeItem).toHaveStyle({ paddingLeft: '80px' }); // 3 * 24 + 8
  });

  it('does not call onSelect when disabled', () => {
    const onSelect = vi.fn();
    renderInTree(<WorkspaceTreeNode node={makeNode()} onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByRole('treeitem'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks treeitem as aria-selected when selectedId matches node id', () => {
    renderInTree(<WorkspaceTreeNode node={makeNode()} selectedId="ws-1" />);
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-selected', 'true');
  });

  it('marks child treeitem as aria-selected when selectedId matches child id', () => {
    const child = makeNode({
      id: 'ws-child',
      name: 'Frontend',
      slug: 'frontend',
      depth: 1,
      parentId: 'ws-1',
    });
    const parent = makeNode({ _count: { members: 1, children: 1 }, children: [child] });
    renderInTree(<WorkspaceTreeNode node={parent} defaultExpanded selectedId="ws-child" />);

    const items = screen.getAllByRole('treeitem');
    const parentItem = items.find((el) => el.getAttribute('aria-level') === '1');
    const childItem = items.find((el) => el.getAttribute('aria-level') === '2');

    expect(parentItem).toHaveAttribute('aria-selected', 'false');
    expect(childItem).toHaveAttribute('aria-selected', 'true');
  });

  it('is initially expanded when defaultExpanded is true', () => {
    const child = makeNode({
      id: 'ws-child',
      name: 'Frontend',
      slug: 'frontend',
      depth: 1,
      parentId: 'ws-1',
    });
    const parent = makeNode({ _count: { members: 1, children: 1 }, children: [child] });
    renderInTree(<WorkspaceTreeNode node={parent} defaultExpanded />);
    expect(screen.getByText('Frontend')).toBeInTheDocument();
  });
});
