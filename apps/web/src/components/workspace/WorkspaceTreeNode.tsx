// apps/web/src/components/workspace/WorkspaceTreeNode.tsx
//
// T011-20: WorkspaceTreeNode — single node in the workspace hierarchy tree.
// Spec 011 Phase 4 (FR-013, FR-014).
// WCAG 2.1 AA: role="treeitem", aria-expanded, aria-level, aria-setsize,
// aria-posinset, keyboard nav, roving tabindex.
//
// Keyboard navigation per WAI-ARIA Tree View pattern:
//   Enter / Click  — select node (or toggle expand if has children & no onSelect)
//   Space          — toggle expand/collapse (if has children)
//   ArrowRight     — expand collapsed node (or move focus to first child if expanded)
//   ArrowLeft      — collapse expanded node (or move focus to parent if already collapsed)
//   ArrowDown      — move focus to next visible node
//   ArrowUp        — move focus to previous visible node
//   Home           — move focus to first node in tree
//   End            — move focus to last visible node in tree
//
// Fixes applied:
//   F-021: Roving tabindex — only the focused/selected node gets tabIndex=0
//   F-025: Removed nested <button> inside treeitem; chevron is now a decorative <span>
//   F-024: aria-setsize + aria-posinset on every treeitem
//   F-010: rAF-debounced registerNode sort to avoid O(n²) on each render cycle

import React, { useState, useCallback, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TreeFocusContext, useTreeFocus } from './WorkspaceTreeContext';

export interface TreeNodeData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  depth: number;
  path: string;
  parentId: string | null;
  /** null means read-only access via ancestor inheritance */
  memberRole: string | null;
  _count: {
    members: number;
    children: number;
  };
  children: TreeNodeData[];
}

// ---------------------------------------------------------------------------
// TreeFocusProvider — wraps a <ul role="tree"> and manages focus order
// ---------------------------------------------------------------------------

export interface TreeFocusProviderProps {
  children: React.ReactNode;
}

export function TreeFocusProvider({ children }: TreeFocusProviderProps) {
  // Map from node id → DOM element, in DOM order
  const nodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // Ordered list of ids (DOM order); rebuilt via rAF-debounced registerNode (F-010)
  const orderRef = useRef<string[]>([]);
  // rAF handle — used to batch concurrent registerNode calls in one render cycle
  const rafRef = useRef<number | null>(null);

  // Roving tabindex state (F-021)
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const rebuildOrder = useCallback(() => {
    const all = Array.from(nodesRef.current.entries());
    all.sort(([, a], [, b]) => {
      const pos = a.compareDocumentPosition(b);
      // pos === 0 means same element — return 0 to satisfy the sort contract.
      // Otherwise: DOCUMENT_POSITION_FOLLOWING (4) means b comes after a → a < b → -1.
      if (pos === 0) return 0;
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    orderRef.current = all.map(([id]) => id);
  }, []);

  const registerNode = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) {
        nodesRef.current.set(id, el);
      } else {
        nodesRef.current.delete(id);
        orderRef.current = orderRef.current.filter((i) => i !== id);
        return; // No need to re-sort after deletion
      }
      // Debounce: cancel pending rAF and schedule a fresh one (F-010)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        rebuildOrder();
      });
    },
    [rebuildOrder]
  );

  const focusById = useCallback((id: string) => {
    nodesRef.current.get(id)?.focus();
    setFocusedId(id);
  }, []);

  const focusNext = useCallback(
    (currentId: string) => {
      const idx = orderRef.current.indexOf(currentId);
      if (idx < orderRef.current.length - 1) focusById(orderRef.current[idx + 1]);
    },
    [focusById]
  );

  const focusPrev = useCallback(
    (currentId: string) => {
      const idx = orderRef.current.indexOf(currentId);
      if (idx > 0) focusById(orderRef.current[idx - 1]);
    },
    [focusById]
  );

  const focusFirst = useCallback(() => {
    if (orderRef.current.length > 0) focusById(orderRef.current[0]);
  }, [focusById]);

  const focusLast = useCallback(() => {
    const last = orderRef.current[orderRef.current.length - 1];
    if (last) focusById(last);
  }, [focusById]);

  return (
    <TreeFocusContext.Provider
      value={{ registerNode, focusNext, focusPrev, focusFirst, focusLast, focusedId, setFocusedId }}
    >
      {children}
    </TreeFocusContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceTreeNode
// ---------------------------------------------------------------------------

export interface WorkspaceTreeNodeProps {
  node: TreeNodeData;
  /** 0-indexed nesting level (may differ from node.depth when tree is rooted mid-hierarchy) */
  level?: number;
  /** Whether this node should be expanded initially */
  defaultExpanded?: boolean;
  /** Called when user activates the node (Enter / click) */
  onSelect?: (nodeId: string) => void;
  /**
   * The id of the currently selected node.
   * Used to derive `aria-selected` correctly at every level of the tree.
   */
  selectedId?: string;
  /** @deprecated use `selectedId` — kept for backward-compat with callers that pass a boolean */
  selected?: boolean;
  /** Disabled nodes cannot be selected (used in move-workspace picker) */
  disabled?: boolean;
  /**
   * ARIA: total number of sibling nodes at this level (for aria-setsize).
   * Provided by the parent node or WorkspaceTreeView.
   */
  siblingCount?: number;
  /**
   * ARIA: 1-based position among siblings (for aria-posinset).
   * Provided by the parent node or WorkspaceTreeView.
   */
  posInSet?: number;
  /**
   * H-001: WAI-ARIA tree pattern — ArrowLeft on a collapsed/childless node must
   * move focus to the parent node. Parent passes this callback so children can
   * trigger it without knowing the parent's DOM element directly.
   */
  onFocusParent?: () => void;
  /**
   * Set of workspace IDs that should be rendered as disabled.
   * Passed all the way down so that non-root disabled targets are correctly
   * marked (Fix for WARNING #1: disabled boolean only propagated parent→child,
   * so mid-tree disabled nodes were never picked up).
   */
  disabledIds?: Set<string>;
  /**
   * When true, this node is displayed at reduced opacity to indicate it is
   * shown only for tree-context during a search (not a direct match).
   * Spec 011 design-spec: non-matching ancestor nodes appear dimmed (opacity-40).
   */
  isDimmed?: boolean;
}

const DEPTH_ACCENT_CLASSES = [
  'border-l-[var(--ws-depth-0)]',
  'border-l-[var(--ws-depth-1)]',
  'border-l-[var(--ws-depth-2)]',
  'border-l-[var(--ws-depth-3)]',
] as const;

function depthAccentClass(depth: number): string {
  return DEPTH_ACCENT_CLASSES[Math.min(depth, DEPTH_ACCENT_CLASSES.length - 1)];
}

export function WorkspaceTreeNode({
  node,
  level = 0,
  defaultExpanded = false,
  onSelect,
  selectedId,
  selected: selectedProp = false,
  disabled = false,
  siblingCount = 1,
  posInSet = 1,
  onFocusParent,
  disabledIds,
  isDimmed = false,
}: WorkspaceTreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children.length > 0 || node._count.children > 0;
  const isHierarchicalReader = node.memberRole === null;

  // Derive selected: prefer selectedId (correct recursive behaviour) over legacy boolean prop
  const isSelected = selectedId !== undefined ? selectedId === node.id : selectedProp;

  const focusCtx = useTreeFocus();
  const nodeRef = useRef<HTMLDivElement>(null);

  // Register this node with the focus context whenever it mounts/unmounts
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      (nodeRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      focusCtx?.registerNode(node.id, el);
    },
    [focusCtx, node.id]
  );

  // Roving tabindex: this node gets tabIndex=0 only when it is the focused node
  // or when no node is focused yet and this is the first node (posInSet===1, level===0).
  // All other nodes get tabIndex=-1.  (F-021)
  const isRovingFocused =
    focusCtx?.focusedId === node.id ||
    (focusCtx?.focusedId === null && posInSet === 1 && level === 0);
  const tabIndex = disabled ? -1 : isRovingFocused ? 0 : -1;

  const handleSelect = useCallback(() => {
    if (!disabled) onSelect?.(node.id);
  }, [disabled, onSelect, node.id]);

  const handleClick = useCallback(() => {
    if (disabled) return; // WAI-ARIA: disabled nodes must not respond to interaction
    focusCtx?.setFocusedId(node.id);
    if (hasChildren && !onSelect) {
      // If there's no selection handler, treat click as expand toggle
      setExpanded((prev) => !prev);
    } else {
      handleSelect();
    }
  }, [disabled, focusCtx, node.id, hasChildren, onSelect, handleSelect]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return; // WAI-ARIA: disabled nodes must not respond to keyboard interaction
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          handleSelect();
          break;
        case ' ':
          e.preventDefault();
          // Space toggles expand/collapse (WAI-ARIA tree pattern); does not select
          if (hasChildren) setExpanded((prev) => !prev);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (hasChildren && !expanded) {
            setExpanded(true);
          } else if (hasChildren && expanded && focusCtx) {
            // Move focus to first child by delegating to next-node logic
            focusCtx.focusNext(node.id);
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (expanded) {
            setExpanded(false);
          } else {
            // H-001: WAI-ARIA tree pattern — move focus to parent when already collapsed
            onFocusParent?.();
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          focusCtx?.focusNext(node.id);
          break;
        case 'ArrowUp':
          e.preventDefault();
          focusCtx?.focusPrev(node.id);
          break;
        case 'Home':
          e.preventDefault();
          focusCtx?.focusFirst();
          break;
        case 'End':
          e.preventDefault();
          focusCtx?.focusLast();
          break;
      }
    },
    [disabled, handleSelect, hasChildren, expanded, focusCtx, node.id, onFocusParent]
  );

  // Update focusedId in context when this node receives browser focus
  const handleFocus = useCallback(() => {
    focusCtx?.setFocusedId(node.id);
  }, [focusCtx, node.id]);

  // H-001: stable callback so child ArrowLeft can return focus to this node
  // without recreating the function on every render (F-010 / INFO fix).
  const handleFocusParent = useCallback(() => {
    nodeRef.current?.focus();
    focusCtx?.setFocusedId(node.id);
  }, [focusCtx, node.id]);

  return (
    <li role="none">
      <div
        ref={setRef}
        role="treeitem"
        aria-level={level + 1}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        aria-disabled={disabled}
        aria-setsize={siblingCount}
        aria-posinset={posInSet}
        tabIndex={tabIndex}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        className={cn(
          'group flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm cursor-pointer outline-none',
          'focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1',
          'border-l-2',
          depthAccentClass(node.depth),
          isSelected && 'bg-[var(--ws-tree-node-selected)] text-[var(--ws-tree-node-selected-fg)]',
          !isSelected && 'hover:bg-[var(--ws-tree-node-hover)]',
          disabled && 'opacity-50 cursor-not-allowed',
          // design-spec: non-matching ancestor nodes shown at reduced opacity during search
          isDimmed && !disabled && 'opacity-40'
        )}
        style={{ paddingLeft: `${level * 24 + 8}px` }}
      >
        {/* Expand / collapse indicator — purely decorative (F-025: no nested <button>) */}
        <span
          aria-hidden="true"
          className={cn(
            'flex-none w-4 h-4 flex items-center justify-center rounded-sm',
            'text-muted-foreground transition-transform duration-150',
            expanded && 'rotate-90',
            !hasChildren && 'invisible'
          )}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </span>

        {/* Label */}
        <span className="flex-1 min-w-0 truncate font-medium">{node.name}</span>

        {/* Child count badge (F-026) */}
        {node._count.children > 0 && (
          <span
            className="flex-none text-[10px] text-muted-foreground tabular-nums"
            aria-label={`${node._count.children} child workspaces`}
          >
            {node._count.children}
          </span>
        )}

        {/* Slug */}
        <span className="text-xs text-muted-foreground truncate hidden sm:block">{node.slug}</span>

        {/* Hierarchical reader badge */}
        {isHierarchicalReader && (
          <span
            className="flex-none text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{
              background: 'var(--ws-hierarchical-reader-bg)',
              color: 'var(--ws-hierarchical-reader-fg)',
            }}
            aria-label="Read-only via ancestor admin access"
          >
            INHERITED
          </span>
        )}
      </div>

      {/* Children — rendered with expand animation (F-026) */}
      {hasChildren && expanded && (
        <ul role="group" className="animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {node.children.map((child, idx) => (
            <WorkspaceTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              // WARNING-1 fix: check disabledIds per-child rather than inheriting
              // the parent's boolean — this ensures mid-tree disabled targets are
              // correctly marked regardless of whether their ancestor is disabled.
              disabled={disabledIds ? disabledIds.has(child.id) : disabled}
              disabledIds={disabledIds}
              siblingCount={node.children.length}
              posInSet={idx + 1}
              // H-001: pass focus-parent callback so child ArrowLeft can return focus here
              onFocusParent={handleFocusParent}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
