import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';

import type { KeyboardEvent } from 'react';
import type { WorkspaceTreeNode } from '../../types/workspace.js';

interface WorkspaceTreeProps {
  nodes: WorkspaceTreeNode[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

interface VisibleNode {
  node: WorkspaceTreeNode;
  level: number;
  parentId: string | undefined;
}

function flattenVisible(
  nodes: WorkspaceTreeNode[],
  collapsedIds: ReadonlySet<string>,
  level = 1,
  parentId?: string
): VisibleNode[] {
  return nodes.flatMap((node) => [
    { node, level, parentId },
    ...(collapsedIds.has(node.id)
      ? []
      : flattenVisible(node.children, collapsedIds, level + 1, node.id)),
  ]);
}

export function WorkspaceTree({ nodes, selectedId, onSelect }: WorkspaceTreeProps): JSX.Element {
  const intl = useIntl();
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string>();
  const visibleNodes = flattenVisible(nodes, collapsedIds);
  const visibleIds = new Set(visibleNodes.map(({ node }) => node.id));
  const rovingId =
    (focusedId !== undefined && visibleIds.has(focusedId) ? focusedId : undefined) ??
    (selectedId !== undefined && visibleIds.has(selectedId) ? selectedId : undefined) ??
    visibleNodes[0]?.node.id;

  function focusItem(id: string): void {
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  }

  function setExpanded(id: string, expanded: boolean): void {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (expanded) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, current: VisibleNode): void {
    const index = visibleNodes.findIndex(({ node }) => node.id === current.node.id);
    const hasChildren = current.node.children.length > 0;
    const expanded = hasChildren && !collapsedIds.has(current.node.id);
    let nextId: string | undefined;

    if (event.key === 'ArrowDown') nextId = visibleNodes[index + 1]?.node.id;
    else if (event.key === 'ArrowUp') nextId = visibleNodes[index - 1]?.node.id;
    else if (event.key === 'Home') nextId = visibleNodes[0]?.node.id;
    else if (event.key === 'End') nextId = visibleNodes.at(-1)?.node.id;
    else if (event.key === 'ArrowRight' && hasChildren) {
      if (!expanded) setExpanded(current.node.id, true);
      else nextId = current.node.children[0]?.id;
    } else if (event.key === 'ArrowLeft') {
      if (expanded) setExpanded(current.node.id, false);
      else nextId = current.parentId;
    } else if (event.key === 'Enter' || event.key === ' ') {
      onSelect(current.node.id);
    } else return;

    event.preventDefault();
    if (nextId !== undefined) focusItem(nextId);
  }

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        {intl.formatMessage({ id: 'workspace.tree.empty' })}
      </p>
    );
  }

  return (
    <div role="tree" aria-label={intl.formatMessage({ id: 'workspace.tree.label' })}>
      {visibleNodes.map((current) => {
        const { node, level } = current;
        const hasChildren = node.children.length > 0;
        const expanded = hasChildren && !collapsedIds.has(node.id);
        return (
          <div
            key={node.id}
            ref={(element) => {
              if (element === null) itemRefs.current.delete(node.id);
              else itemRefs.current.set(node.id, element);
            }}
            role="treeitem"
            aria-label={node.name}
            aria-level={level}
            aria-expanded={hasChildren ? expanded : undefined}
            aria-selected={node.id === selectedId}
            tabIndex={node.id === rovingId ? 0 : -1}
            onFocus={() => setFocusedId(node.id)}
            onClick={() => {
              focusItem(node.id);
              onSelect(node.id);
            }}
            onKeyDown={(event) => handleKeyDown(event, current)}
            style={{ paddingLeft: `${String((level - 1) * 16 + 8)}px` }}
            className={`flex cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              node.id === selectedId
                ? 'bg-primary-100 font-medium text-primary-800'
                : 'text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            {hasChildren ? (
              <button
                type="button"
                tabIndex={-1}
                aria-label={intl.formatMessage(
                  { id: expanded ? 'workspace.tree.collapse' : 'workspace.tree.expand' },
                  { name: node.name }
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  focusItem(node.id);
                  setExpanded(node.id, !expanded);
                }}
                className="shrink-0 rounded text-neutral-500 hover:text-neutral-700"
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" aria-hidden="true" />
            )}
            <Folder className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
            <span className="truncate">{node.name}</span>
          </div>
        );
      })}
    </div>
  );
}
