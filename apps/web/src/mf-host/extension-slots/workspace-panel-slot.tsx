// extension-slots/workspace-panel-slot.tsx
// Renders plugins at the workspace-panel:main extension point.

import { useMemo } from 'react';

import { PluginSlot } from './plugin-slot.js';

import type { PluginSlotEntry } from './plugin-slot.js';

interface WorkspacePanelSlotProps {
  pluginEntries: PluginSlotEntry[];
  workspaceId: string;
}

export function WorkspacePanelSlot({
  pluginEntries,
  workspaceId,
}: WorkspacePanelSlotProps): JSX.Element | null {
  // Stable identity across renders (006-09 loop fix): the filter must not mint
  // a new array per render or the PluginSlot i18n effect re-fires on every
  // render. Memoized on `pluginEntries`, so renders preserve the effect deps.
  const panelPlugins = useMemo(
    () => pluginEntries.filter((p) => p.extensionPoint === 'workspace-panel:main'),
    [pluginEntries]
  );

  if (panelPlugins.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <PluginSlot entries={panelPlugins} workspaceId={workspaceId} />
    </div>
  );
}
