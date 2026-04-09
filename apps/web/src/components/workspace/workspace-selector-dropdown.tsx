// workspace-selector-dropdown.tsx
// Popover dropdown to select the current workspace.
// Calls setCurrentWorkspace from workspace-store on selection.

import { useIntl, FormattedMessage } from 'react-intl';
import { Folder, ChevronsUpDown } from 'lucide-react';
import { PopoverRoot, PopoverTrigger, PopoverContent, Button } from '@plexica/ui';

import { useWorkspaces } from '../../hooks/use-workspaces.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';

export function WorkspaceSelectorDropdown(): JSX.Element {
  const intl = useIntl();
  const { currentWorkspaceId, setCurrentWorkspace } = useWorkspaceStore();
  const { data } = useWorkspaces();

  const workspaces = data?.data ?? [];
  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  const label = current?.name ?? intl.formatMessage({ id: 'nav.workspaces' });

  return (
    <PopoverRoot>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={intl.formatMessage({ id: 'nav.workspaces' })}
          className="max-w-[160px] truncate"
        >
          <Folder className="mr-1 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-50 w-56 rounded-md border border-neutral-200 bg-white p-1 shadow-md">
        {workspaces.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-neutral-500">
            <FormattedMessage id="workspace.list.empty" />
          </p>
        ) : (
          <ul className="space-y-0.5">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <button
                  type="button"
                  onClick={() => setCurrentWorkspace(ws.id)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm ${
                    ws.id === currentWorkspaceId
                      ? 'bg-primary-100 font-medium text-primary-800'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {ws.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
