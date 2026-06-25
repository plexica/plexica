// workspace-danger-zone.tsx
// Danger Zone section for WorkspaceSettingsPage.
// Archive / restore actions with confirmation dialogs and error display.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, ConfirmDialog } from '@plexica/ui';

import { useDeleteWorkspace, useRestoreWorkspace } from '../../hooks/use-workspaces.js';

interface WorkspaceDangerZoneProps {
  workspaceId: string;
  status: 'active' | 'archived';
}

export function WorkspaceDangerZone({ workspaceId, status }: WorkspaceDangerZoneProps): JSX.Element {
  const intl = useIntl();
  const [showArchive, setShowArchive] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { mutate: archive, isPending: isArchiving } = useDeleteWorkspace();
  const { mutate: restore, isPending: isRestoring } = useRestoreWorkspace();

  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-neutral-900">
        <FormattedMessage id="workspace.dangerZone.title" />
      </h2>
      <div className="rounded-lg border border-error-light bg-white p-4">
        {actionError !== null && (
          <p role="alert" className="mb-3 text-sm text-error">{actionError}</p>
        )}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-900">
              {status === 'active'
                ? intl.formatMessage({ id: 'workspace.delete.confirm.title' })
                : intl.formatMessage({ id: 'workspace.restore.confirm.title' })}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {status === 'active'
                ? intl.formatMessage({ id: 'workspace.delete.confirm.description' })
                : intl.formatMessage({ id: 'workspace.restore.confirm.description' })}
            </p>
          </div>
          {status === 'active' ? (
            <Button
              variant="destructive" size="sm" disabled={isArchiving}
              onClick={() => { setActionError(null); setShowArchive(true); }}
            >
              <FormattedMessage id="common.delete" />
            </Button>
          ) : (
            <Button
              variant="secondary" size="sm" disabled={isRestoring}
              onClick={() => { setActionError(null); setShowRestore(true); }}
            >
              <FormattedMessage id="common.restore" />
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showArchive} onOpenChange={setShowArchive}
        title={intl.formatMessage({ id: 'workspace.delete.confirm.title' })}
        description={intl.formatMessage({ id: 'workspace.delete.confirm.description' })}
        confirmLabel={intl.formatMessage({ id: 'common.delete' })}
        cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
        variant="destructive"
        onConfirm={() => archive(workspaceId, {
          onSuccess: () => setShowArchive(false),
          onError: () => { setShowArchive(false); setActionError(intl.formatMessage({ id: 'common.error' })); },
        })}
        loading={isArchiving}
      />
      <ConfirmDialog
        open={showRestore} onOpenChange={setShowRestore}
        title={intl.formatMessage({ id: 'workspace.restore.confirm.title' })}
        description={intl.formatMessage({ id: 'workspace.restore.confirm.description' })}
        confirmLabel={intl.formatMessage({ id: 'common.restore' })}
        cancelLabel={intl.formatMessage({ id: 'common.cancel' })}
        onConfirm={() => restore(workspaceId, {
          onSuccess: () => setShowRestore(false),
          onError: () => { setShowRestore(false); setActionError(intl.formatMessage({ id: 'common.error' })); },
        })}
        loading={isRestoring}
      />
    </section>
  );
}
