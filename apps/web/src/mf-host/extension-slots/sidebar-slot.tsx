// extension-slots/sidebar-slot.tsx
// Renders plugins at the sidebar:admin extension point.
// Plugins are loaded from MinIO (prod) or dev server (dev) via the plugin loader.

import { PluginSlot } from './plugin-slot.js';

interface SidebarSlotProps {
  pluginEntries: Array<{
    slug: string;
    remoteEntryUrl: string;
    extensionPoint: string;
  }>;
}

export function SidebarSlot({ pluginEntries }: SidebarSlotProps): JSX.Element | null {
  const sidebarPlugins = pluginEntries.filter((p) => p.extensionPoint === 'sidebar:admin');

  if (sidebarPlugins.length === 0) {
    return null;
  }

  return (
    <div className="border-t border-neutral-200 pt-2 mt-2 dark:border-neutral-700">
      <PluginSlot entries={sidebarPlugins} />
    </div>
  );
}
