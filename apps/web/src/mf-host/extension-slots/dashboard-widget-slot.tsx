// extension-slots/dashboard-widget-slot.tsx
// Renders plugins at the dashboard-widget:grid extension point.

import { useMemo } from 'react';

import { PluginSlot } from './plugin-slot.js';

import type { PluginSlotEntry } from './plugin-slot.js';

interface DashboardWidgetSlotProps {
  pluginEntries: PluginSlotEntry[];
}

export function DashboardWidgetSlot({
  pluginEntries,
}: DashboardWidgetSlotProps): JSX.Element | null {
  // Stable identity across renders — see workspace-panel-slot.tsx (006-09).
  const widgetPlugins = useMemo(
    () => pluginEntries.filter((p) => p.extensionPoint === 'dashboard-widget:grid'),
    [pluginEntries]
  );

  if (widgetPlugins.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <PluginSlot entries={widgetPlugins} workspaceId="" />
    </div>
  );
}
