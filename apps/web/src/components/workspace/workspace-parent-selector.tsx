import { useId } from 'react';
import { FormattedMessage } from 'react-intl';
import { CircleOff } from 'lucide-react';
import { Button } from '@plexica/ui';

import { WorkspaceTreeSelector } from './workspace-tree-selector.js';

import type { Workspace } from '../../types/workspace.js';

interface WorkspaceParentSelectorProps {
  workspaces: Workspace[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}

export function WorkspaceParentSelector({
  workspaces,
  value,
  onChange,
}: WorkspaceParentSelectorProps): JSX.Element {
  const labelId = useId();

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium text-neutral-700">
        <FormattedMessage id="workspace.create.parent.label" />
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="rounded-md border border-neutral-200 p-2"
      >
        <WorkspaceTreeSelector workspaces={workspaces} selectedId={value} onSelect={onChange} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
          className="mt-2 w-full justify-start"
        >
          <CircleOff className="mr-2 h-4 w-4" aria-hidden="true" />
          <FormattedMessage id="workspace.tree.noParent" />
        </Button>
      </div>
    </div>
  );
}
