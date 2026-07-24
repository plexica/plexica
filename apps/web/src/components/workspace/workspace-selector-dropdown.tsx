// workspace-selector-dropdown.tsx
import { useState } from 'react';
import { useIntl, FormattedMessage } from 'react-intl';
import { Link } from '@tanstack/react-router';
import { Folder, ChevronsUpDown, ListTree } from 'lucide-react';
import { PopoverRoot, PopoverTrigger, PopoverContent, Button } from '@plexica/ui';

import { useParentWorkspaceOptions } from '../../hooks/use-workspaces.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';

import { WorkspaceTreeSelector } from './workspace-tree-selector.js';

export function WorkspaceSelectorDropdown(): JSX.Element {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const { currentWorkspaceId, setCurrentWorkspace } = useWorkspaceStore();
  const { data: workspaces = [], isPending, isError } = useParentWorkspaceOptions();

  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  const label = current?.name ?? intl.formatMessage({ id: 'nav.workspaces' });

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={intl.formatMessage({ id: 'workspace.selector.label' }, { name: label })}
          className="max-w-[160px] truncate"
        >
          <Folder className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-50 w-72 rounded-md border border-neutral-200 bg-white p-2 shadow-md">
        {isPending ? (
          <p className="px-2 py-1.5 text-sm text-neutral-500">
            <FormattedMessage id="common.loading" />
          </p>
        ) : isError ? (
          <p role="alert" className="px-2 py-1.5 text-sm text-error">
            <FormattedMessage id="common.error" />
          </p>
        ) : workspaces.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-neutral-500">
            <FormattedMessage id="workspace.list.empty" />
          </p>
        ) : (
          <WorkspaceTreeSelector
            workspaces={workspaces}
            selectedId={currentWorkspaceId ?? undefined}
            onSelect={(id) => {
              setCurrentWorkspace(id);
              setOpen(false);
            }}
          />
        )}
        <Link
          to="/workspaces"
          onClick={() => setOpen(false)}
          className="mt-2 flex items-center rounded-md px-2 py-1.5 text-sm font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <ListTree className="mr-2 h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="workspace.selector.viewAll" />
        </Link>
      </PopoverContent>
    </PopoverRoot>
  );
}
