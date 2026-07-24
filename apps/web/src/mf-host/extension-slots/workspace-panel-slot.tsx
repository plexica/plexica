// extension-slots/workspace-panel-slot.tsx
// Renders plugins at the workspace-panel:main extension point.

import { PluginSlot } from './plugin-slot.js';

interface WorkspacePanelSlotProps {
  pluginEntries: Array<{
    slug: string;
    installId: string;
    remoteEntryUrl: string;
    extensionPoint: string;
  }>;
  workspaceId: string;
}

export function WorkspacePanelSlot({ pluginEntries, workspaceId }: WorkspacePanelSlotProps): JSX.Element | null {
  const panelPlugins = pluginEntries.filter((p) => p.extensionPoint === 'workspace-panel:main');

  if (panelPlugins.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <PluginSlot entries={panelPlugins} workspaceId={workspaceId} />
    </div>
  );
}
