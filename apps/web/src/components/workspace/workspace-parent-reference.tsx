import { FormattedMessage } from 'react-intl';
import { Link } from '@tanstack/react-router';

import { useWorkspace } from '../../hooks/use-workspaces.js';

interface WorkspaceParentReferenceProps {
  parentId: string;
}

export function WorkspaceParentReference({
  parentId,
}: WorkspaceParentReferenceProps): JSX.Element | null {
  const { data: parent } = useWorkspace(parentId);

  if (parent === undefined) return null;

  return (
    <p className="text-sm text-neutral-600">
      <FormattedMessage id="workspace.detail.parent" />{' '}
      <Link
        to="/workspaces/$workspaceId"
        params={{ workspaceId: parentId }}
        className="font-medium text-neutral-900 hover:text-primary-600"
      >
        {parent.name}
      </Link>
    </p>
  );
}
