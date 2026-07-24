import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Search } from 'lucide-react';
import { Input } from '@plexica/ui';

import { WorkspaceTree } from './workspace-tree.js';
import {
  buildWorkspaceTree,
  countWorkspaceTreeNodes,
  filterWorkspaceTree,
} from './workspace-tree-data.js';

import type { Workspace } from '../../types/workspace.js';

interface WorkspaceTreeSelectorProps {
  workspaces: Workspace[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function WorkspaceTreeSelector({
  workspaces,
  selectedId,
  onSelect,
}: WorkspaceTreeSelectorProps): JSX.Element {
  const intl = useIntl();
  const [search, setSearch] = useState('');
  const tree = filterWorkspaceTree(buildWorkspaceTree(workspaces), search);
  const resultCount = countWorkspaceTreeNodes(tree);
  const hasSearch = search.trim() !== '';

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-neutral-500"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={intl.formatMessage({ id: 'workspace.tree.search.label' })}
          placeholder={intl.formatMessage({ id: 'workspace.tree.search.placeholder' })}
          className="pl-8"
        />
      </div>
      <p className="sr-only" aria-live="polite">
        <FormattedMessage id="workspace.tree.search.results" values={{ count: resultCount }} />
      </p>
      <div className="max-h-64 overflow-y-auto p-0.5">
        {hasSearch && tree.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-neutral-500">
            <FormattedMessage id="workspace.tree.search.empty" />
          </p>
        ) : (
          <WorkspaceTree nodes={tree} selectedId={selectedId} onSelect={onSelect} />
        )}
      </div>
    </div>
  );
}
