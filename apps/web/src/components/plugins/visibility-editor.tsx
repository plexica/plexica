// visibility-editor.tsx
// Workspace visibility toggles for a single installed plugin.
// Shows per-workspace overrides with toggle switches.

import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Button, ToggleSwitch } from '@plexica/ui';

import { SkeletonLoader } from '../feedback/skeleton-loader.js';
import { PageError } from '../feedback/page-error.js';

import type { PluginVisibilityEntry, PluginVisibilityUpdate } from '../../types/plugin.js';

interface VisibilityEditorProps {
  data: PluginVisibilityEntry[] | undefined;
  isPending: boolean;
  isError: boolean;
  isSaving: boolean;
  refetch: () => void;
  onSave: (updates: PluginVisibilityUpdate[]) => void;
}

export function VisibilityEditor({
  data,
  isPending,
  isError,
  isSaving,
  refetch,
  onSave,
}: VisibilityEditorProps): JSX.Element {
  const intl = useIntl();
  const [localUpdates, setLocalUpdates] = useState<PluginVisibilityUpdate[]>([]);

  const entries = data ?? [];
  const currentUpdates = localUpdates;

  function handleToggle(workspaceId: string, checked: boolean): void {
    setLocalUpdates((prev) => {
      const existing = prev.findIndex((u) => u.workspaceId === workspaceId);
      const update: PluginVisibilityUpdate = { workspaceId, isEnabled: checked };
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = update;
        return next;
      }
      return [...prev, update];
    });
  }

  function isModified(wsId: string): boolean {
    return currentUpdates.some((u) => u.workspaceId === wsId);
  }

  function getEffectiveEnabled(entry: PluginVisibilityEntry): boolean {
    const update = currentUpdates.find((u) => u.workspaceId === entry.workspaceId);
    return update !== undefined ? update.isEnabled : entry.isEnabled;
  }

  function handleSave(): void {
    onSave(currentUpdates);
    setLocalUpdates([]);
  }

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <SkeletonLoader className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonLoader key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <PageError onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">
          <FormattedMessage id="plugins.installed.empty" />
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.workspaceId}
                className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-700">{entry.workspaceName}</span>
                  {isModified(entry.workspaceId) && (
                    <span className="rounded bg-warning-base/10 px-1.5 py-0.5 text-[10px] text-warning-base">
                      <FormattedMessage id="plugins.visibility.enabled" />
                    </span>
                  )}
                </div>
                <ToggleSwitch
                  checked={getEffectiveEnabled(entry)}
                  onCheckedChange={(checked: boolean) => handleToggle(entry.workspaceId, checked)}
                  label={`${entry.workspaceName} visibility`}
                />
              </div>
            ))}
          </div>
          {currentUpdates.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="primary"
                onClick={handleSave}
                disabled={isSaving}
                loading={isSaving}
              >
                <FormattedMessage id="plugins.visibility.save" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
