// extension-slots/dashboard-widget-slot.tsx
// Renders plugins at the dashboard-widget:grid extension point.

import { PluginSlot } from './plugin-slot.js';

interface DashboardWidgetSlotProps {
  pluginEntries: Array<{
    slug: string;
    remoteEntryUrl: string;
    extensionPoint: string;
  }>;
}

export function DashboardWidgetSlot({ pluginEntries }: DashboardWidgetSlotProps): JSX.Element | null {
  const widgetPlugins = pluginEntries.filter((p) => p.extensionPoint === 'dashboard-widget:grid');

  if (widgetPlugins.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <PluginSlot entries={widgetPlugins} />
    </div>
  );
}
