// installed-plugins-page.tsx
// Tenant admin: view installed plugins, activate/deactivate, configure visibility, uninstall.

import { useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { Button } from '@plexica/ui';
import { Puzzle } from 'lucide-react';

import {
  useInstalledPlugins,
  usePluginVisibility,
  useDeactivatePlugin,
  useReactivatePlugin,
  useUninstallPlugin,
  useUpdatePluginVisibility,
} from '../hooks/use-plugins.js';
import { StatusBadge } from '../components/plugins/status-badge.js';
import { UninstallDialog } from '../components/plugins/uninstall-dialog.js';
import { VisibilityEditor } from '../components/plugins/visibility-editor.js';
import { SkeletonLoader } from '../components/feedback/skeleton-loader.js';
import { PageError } from '../components/feedback/page-error.js';

import type { PluginInstallation } from '../types/plugin.js';

export function InstalledPluginsPage(): JSX.Element {
  const [uninstallTarget, setUninstallTarget] = useState<PluginInstallation | null>(null);
  const [expandedVisibility, setExpandedVisibility] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<Set<string>>(new Set());

  const { data, isPending, isError, refetch } = useInstalledPlugins();
  const { mutate: deactivate } = useDeactivatePlugin();
  const { mutate: reactivate } = useReactivatePlugin();
  const { mutate: uninstall, isPending: isUninstalling } = useUninstallPlugin();

  const installations: PluginInstallation[] = data ?? [];

  function handleActivateToggle(inst: PluginInstallation): void {
    setPendingAction((prev) => new Set(prev).add(inst.id));
    const settle = {
      onSettled: () =>
        setPendingAction((prev) => {
          const next = new Set(prev);
          next.delete(inst.id);
          return next;
        }),
    };
    if (inst.status === 'active') {
      deactivate(inst.id, settle);
    } else if (inst.status === 'deactivated') {
      reactivate(inst.id, settle);
    }
  }

  function handleUninstall(installId: string): void {
    uninstall(installId, {
      onSuccess: () => setUninstallTarget(null),
    });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-neutral-900">
        <FormattedMessage id="plugins.installed.title" />
      </h1>

      {/* Loading state */}
      {isPending && (
        <div className="space-y-3" aria-busy="true" aria-live="polite">
          <span className="sr-only"><FormattedMessage id="skeleton.loading" /></span>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonLoader key={i} variant="card" className="h-24" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && <PageError onRetry={() => void refetch()} />}

      {/* Empty state */}
      {!isPending && !isError && installations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Puzzle className="mb-4 h-12 w-12 text-neutral-300" />
          <h3 className="text-lg font-medium text-neutral-600">
            <FormattedMessage id="plugins.installed.empty" />
          </h3>
        </div>
      )}

      {/* Installed plugin list */}
      {!isPending && !isError && installations.length > 0 && (
        <div className="space-y-4">
          {installations.map((inst) => (
            <div key={inst.id} className="rounded-lg border border-neutral-200 bg-white">
              {/* Header row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-sm text-primary-600">
                    {inst.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-neutral-900">{inst.name}</h3>
                    <p className="text-xs text-neutral-500">
                      v{inst.version}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={inst.status} />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleActivateToggle(inst)}
                    disabled={pendingAction.has(inst.id)}
                  >
                    <FormattedMessage
                      id={inst.status === 'active' ? 'plugins.deactivate' : 'plugins.activate'}
                    />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setUninstallTarget(inst)}
                  >
                    <FormattedMessage id="plugins.uninstall" />
                  </Button>
                </div>
              </div>

              {/* Visibility toggle */}
              <div className="border-t border-neutral-100 px-4 py-2">
                <button
                  className="text-sm text-primary-600 hover:text-primary-700"
                  aria-expanded={expandedVisibility === inst.id}
                  aria-controls={`visibility-panel-${inst.id}`}
                  onClick={() =>
                    setExpandedVisibility(
                      expandedVisibility === inst.id ? null : inst.id
                    )
                  }
                >
                  <FormattedMessage id="plugins.visibility.title" />
                </button>
              </div>

              {/* Expandable visibility section */}
              {expandedVisibility === inst.id && (
                <div id={`visibility-panel-${inst.id}`} className="border-t border-neutral-100 px-4 py-3">
                  <VisibilityEditorWrapper key={inst.id} installId={inst.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Uninstall confirmation dialog */}
      {uninstallTarget !== null && (
        <UninstallDialog
          isOpen={true}
          pluginName={uninstallTarget.name}
          isProcessing={isUninstalling}
          onConfirm={() => handleUninstall(uninstallTarget.id)}
          onCancel={() => setUninstallTarget(null)}
        />
      )}
    </div>
  );
}

function VisibilityEditorWrapper({ installId }: { installId: string }): JSX.Element {
  const { data, isPending, isError, refetch } = usePluginVisibility(installId);
  const { mutate: saveVisibility, isPending: isSaving } = useUpdatePluginVisibility(installId);

  return (
    <VisibilityEditor
      data={data}
      isPending={isPending}
      isError={isError}
      isSaving={isSaving}
      refetch={refetch}
      onSave={(updates) => saveVisibility(updates)}
    />
  );
}
