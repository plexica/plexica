// workspace-tree.tsx
// Recursive tree component for displaying workspace hierarchy.
// WCAG 2.1 AA: role="tree"/"treeitem", aria-expanded, keyboard arrow keys.

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';

import type { WorkspaceTreeNode } from '../../types/workspace.js';

interface WorkspaceTreeProps {
  nodes: WorkspaceTreeNode[];
  activeId?: string;
  onSelect: (id: string) => void;
}

interface TreeItemProps {
  node: WorkspaceTreeNode;
  activeId: string | undefined;
  onSelect: (id: string) => void;
  level: number;
}

function TreeItem({ node, activeId, onSelect, level }: TreeItemProps): JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isActive = node.id === activeId;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLLIElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(node.id);
      }
      if (e.key === 'ArrowRight' && hasChildren) {
        e.preventDefault();
        setExpanded(true);
      }
      if (e.key === 'ArrowLeft' && hasChildren) {
        e.preventDefault();
        setExpanded(false);
      }
    },
    [node.id, onSelect, hasChildren]
  );

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={isActive}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ paddingLeft: `${level * 16}px` }}
      className="list-none"
    >
      <div
        onClick={() => onSelect(node.id)}
        className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm ${
          isActive
            ? 'bg-primary-100 font-medium text-primary-800'
            : 'text-neutral-700 hover:bg-neutral-100'
        }`}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((p) => !p);
            }}
            className="shrink-0 text-neutral-400 hover:text-neutral-700"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden="true" />
        )}
        <Folder className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        <span className="truncate">{node.name}</span>
      </div>

      {hasChildren && expanded && (
        <ul role="group" className="list-none">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              activeId={activeId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function WorkspaceTree({ nodes, activeId, onSelect }: WorkspaceTreeProps): JSX.Element {
  if (nodes.length === 0) {
    return <p className="text-sm text-neutral-500">No workspaces.</p>;
  }

  return (
    <ul role="tree" className="list-none space-y-0.5">
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} activeId={activeId} onSelect={onSelect} level={0} />
      ))}
    </ul>
  );
}
