// apps/web/src/components/workspace/WorkspaceTreeView.tsx
//
// T011-21: WorkspaceTreeView — fetches and renders the full workspace tree.
// Spec 011 Phase 4 (FR-013, FR-014).
// WCAG 2.1 AA: role="tree", aria-label, keyboard navigation.
//
// Fixes applied:
//   F-013: onSelect type widened to (string | null) — null = "move to root"
//   F-015/F-023: Retry button added to error state
//   F-026: Search input + child-count badge (badge is in WorkspaceTreeNode)
//          + expand animation (on <ul role="group"> in WorkspaceTreeNode)
//   F-033: Pino structured logging on fetch error

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@plexica/ui';
import { FolderTree, Home } from 'lucide-react';
import { WorkspaceTreeNode, TreeFocusProvider, useTreeFocus } from './WorkspaceTreeNode';
import type { TreeNodeData } from './WorkspaceTreeNode';
import { apiClient } from '@/lib/api-client';
import type { ApiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useFeatureFlag } from '@/lib/feature-flags';

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchWorkspaceTree(): Promise<TreeNodeData[]> {
  return (apiClient as unknown as ApiClient).get<TreeNodeData[]>('/api/workspaces/tree');
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TreeSkeleton() {
  return (
    <div className="space-y-1.5" aria-label="Loading workspace tree" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-8 rounded-sm"
          style={{ width: `${80 - i * 8}%`, marginLeft: `${i * 24}px` }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function TreeEmpty() {
  return (
    <div
      className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground"
      role="status"
      aria-label="No workspaces"
    >
      <FolderTree className="w-10 h-10 opacity-40" />
      <p className="text-sm">No workspaces found.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter helper — returns only nodes whose name/slug matches the query.
// Also populates `dimmedIds` with IDs of nodes that are included solely as
// ancestor context (design-spec: non-matching ancestors appear at opacity-40).
// ---------------------------------------------------------------------------

function filterTree(nodes: TreeNodeData[], query: string, dimmedIds: Set<string>): TreeNodeData[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  return nodes.reduce<TreeNodeData[]>((acc, node) => {
    const matchesSelf = node.name.toLowerCase().includes(q) || node.slug.toLowerCase().includes(q);
    const filteredChildren = filterTree(node.children, q, dimmedIds);
    if (matchesSelf || filteredChildren.length > 0) {
      // Node is included as ancestor-context only if it doesn't match itself
      if (!matchesSelf) dimmedIds.add(node.id);
      acc.push({ ...node, children: filteredChildren });
    }
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// WorkspaceTreeView
// ---------------------------------------------------------------------------

export interface WorkspaceTreeViewProps {
  /**
   * Called when a node is selected.
   * `null` means "move to root level" (no parent).
   * `string` is the selected workspace id.
   */
  onSelect?: (workspaceId: string | null) => void;
  /** Currently selected workspace id; null = root-level selection */
  selectedId?: string | null;
  /** IDs of workspaces that should be shown as disabled (move dialog: descendants of current) */
  disabledIds?: Set<string>;
  /** Optional additional CSS class */
  className?: string;
  /** When true, show a "Move to root level" option at the top of the tree (F-013) */
  showMoveToRoot?: boolean;
}

// ---------------------------------------------------------------------------
// MoveToRootItem — "Move to root level" treeitem that participates in the
// roving tabindex managed by TreeFocusProvider (WARNING-3 fix).
//
// Rules:
//  - Rendered as a <li role="none"> / <div role="treeitem"> to mirror
//    WorkspaceTreeNode's DOM shape so the focus context can manage it the
//    same way as any other node.
//  - No aria-expanded (leaf node — WARNING-2 fix: aria-expanded must only be
//    present on nodes that CAN be expanded).
//  - Registered with TreeFocusProvider via useTreeFocus().registerNode so
//    ArrowDown from this item moves focus to the first workspace node.
// ---------------------------------------------------------------------------

const ROOT_OPTION_ID = '__move-to-root__';

interface MoveToRootItemProps {
  isSelected: boolean;
  onSelect: () => void;
}

function MoveToRootItem({ isSelected, onSelect }: MoveToRootItemProps) {
  const focusCtx = useTreeFocus();
  const ref = useRef<HTMLDivElement>(null);

  // Register with the shared focus order (WARNING-3 fix)
  useEffect(() => {
    const el = ref.current;
    focusCtx?.registerNode(ROOT_OPTION_ID, el);
    return () => {
      focusCtx?.registerNode(ROOT_OPTION_ID, null);
    };
  }, [focusCtx]);

  const isRovingFocused = focusCtx?.focusedId === ROOT_OPTION_ID || focusCtx?.focusedId === null;

  return (
    <li role="none">
      <div
        ref={ref}
        role="treeitem"
        aria-level={1}
        aria-selected={isSelected}
        // No aria-expanded — leaf node (WARNING-2 fix: aria-expanded must be
        // omitted on nodes that cannot be expanded per WAI-ARIA 1.1 §6.6)
        tabIndex={isRovingFocused ? 0 : -1}
        onClick={() => {
          focusCtx?.setFocusedId(ROOT_OPTION_ID);
          onSelect();
        }}
        onFocus={() => focusCtx?.setFocusedId(ROOT_OPTION_ID)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusCtx?.focusNext(ROOT_OPTION_ID);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusCtx?.focusPrev(ROOT_OPTION_ID);
          } else if (e.key === 'Home') {
            e.preventDefault();
            focusCtx?.focusFirst();
          } else if (e.key === 'End') {
            e.preventDefault();
            focusCtx?.focusLast();
          }
        }}
        className={cn(
          'flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer outline-none',
          'focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1',
          'border border-dashed border-border',
          isSelected
            ? 'bg-[var(--ws-tree-node-selected)] text-[var(--ws-tree-node-selected-fg)]'
            : 'hover:bg-[var(--ws-tree-node-hover)]'
        )}
        data-testid="move-to-root-option"
      >
        <Home className="w-4 h-4 flex-none text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">Move to root level</span>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceTreeView
// ---------------------------------------------------------------------------

export function WorkspaceTreeView({
  onSelect,
  selectedId,
  disabledIds,
  className,
  showMoveToRoot = false,
}: WorkspaceTreeViewProps) {
  const enabled = useFeatureFlag('ENABLE_WORKSPACE_HIERARCHY');
  const [search, setSearch] = useState('');
  // Debounced search value — updated 300ms after the user stops typing
  // (design-spec §3 Screen 1 and Screen 4: "debounced 300ms")
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  }, []);

  // Clean up pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const {
    data: tree = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['workspace-tree'],
    queryFn: fetchWorkspaceTree,
    staleTime: 30_000,
    enabled,
  });

  // Log structured error on fetch failure (F-033) — in useEffect to avoid log spam on re-renders
  useEffect(() => {
    if (isError) {
      logger.error({ component: 'WorkspaceTreeView' }, 'Failed to fetch workspace tree');
    }
  }, [isError]);

  const { filteredTree, dimmedIds } = useMemo(() => {
    const dimmedIds = new Set<string>();
    const filteredTree = filterTree(tree, debouncedSearch.trim(), dimmedIds);
    return { filteredTree, dimmedIds };
  }, [tree, debouncedSearch]);

  if (!enabled) return null;

  if (isLoading) return <TreeSkeleton />;

  if (isError) {
    return (
      <div role="alert" className="text-sm text-destructive py-4 text-center space-y-2">
        <p>Failed to load workspace hierarchy.</p>
        <button
          type="button"
          className="underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          onClick={() => void refetch()}
          aria-label="Retry loading workspace hierarchy"
        >
          Retry
        </button>
      </div>
    );
  }

  if (tree.length === 0) return <TreeEmpty />;

  const isRootSelected = selectedId === null;
  const showRootOption = showMoveToRoot && !!onSelect;

  // Total treeitem count for the single tree (root option counts as one sibling at level 1)
  const topLevelCount = filteredTree.length + (showRootOption ? 1 : 0);

  return (
    <TreeFocusProvider>
      <div className={cn('flex flex-col gap-2', className)}>
        {/* Search input (F-026) */}
        <div className="relative">
          <input
            type="search"
            placeholder="Search workspaces…"
            value={search}
            onChange={handleSearchChange}
            aria-label="Search workspaces"
            className={cn(
              'w-full rounded-sm border border-border bg-background px-3 py-1.5 text-sm',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-2 focus:ring-[var(--ring)]'
            )}
          />
        </div>

        {filteredTree.length === 0 && debouncedSearch ? (
          <p className="text-sm text-muted-foreground text-center py-4" role="status">
            No workspaces match &ldquo;{debouncedSearch}&rdquo;
          </p>
        ) : (
          // Single role="tree" — WARNING-3 fix: both the "Move to root" option
          // and the workspace nodes live in the same tree so there is exactly
          // one Tab stop managed by the shared TreeFocusProvider.
          <>
            {/* aria-live result count announcement (WARNING #6 fix):
                screen readers announce the count when search filters results */}
            {debouncedSearch && filteredTree.length > 0 && (
              <span className="sr-only" role="status" aria-live="polite">
                {filteredTree.length === 1
                  ? '1 workspace found'
                  : `${filteredTree.length} workspaces found`}
              </span>
            )}
            <ul role="tree" aria-label="Workspace hierarchy">
              {/* "Move to root level" treeitem (F-013, M-001, WARNING-2, WARNING-3) */}
              {showRootOption && (
                <MoveToRootItem isSelected={isRootSelected} onSelect={() => onSelect!(null)} />
              )}
              {filteredTree.map((node, idx) => (
                <WorkspaceTreeNode
                  key={node.id}
                  node={node}
                  level={0}
                  defaultExpanded
                  onSelect={onSelect ?? undefined}
                  selectedId={selectedId ?? undefined}
                  disabled={disabledIds?.has(node.id) ?? false}
                  disabledIds={disabledIds}
                  isDimmed={dimmedIds.has(node.id)}
                  siblingCount={topLevelCount}
                  posInSet={(showRootOption ? 2 : 1) + idx}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </TreeFocusProvider>
  );
}
