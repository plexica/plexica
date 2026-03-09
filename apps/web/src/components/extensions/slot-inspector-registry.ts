// apps/web/src/components/extensions/slot-inspector-registry.ts
//
// Non-component exports for the Extension Slot Inspector:
// the SlotInspectorEntry type, the module-level slot registry, and
// the registerSlot function used by ExtensionSlot instances.
//
// Separated from SlotInspectorOverlay.tsx to satisfy the
// react-refresh/only-export-components lint rule (Fast Refresh requires
// that files exporting components do not also export non-components).

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlotInspectorEntry {
  slotId: string;
  hostPluginId: string;
  contributionCount: number;
  validStatuses: string[];
}

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

export const slotRegistry = new Map<string, SlotInspectorEntry>();
export const listeners = new Set<() => void>();

// ---------------------------------------------------------------------------
// registerSlot
// ---------------------------------------------------------------------------

/**
 * Register an ExtensionSlot instance with the inspector overlay.
 * Returns an unregister function — call it from the slot's cleanup effect.
 *
 * FR-027, US-005 (T013-18)
 */
export function registerSlot(entry: SlotInspectorEntry): () => void {
  slotRegistry.set(entry.slotId, entry);
  listeners.forEach((fn) => fn());
  return () => {
    slotRegistry.delete(entry.slotId);
    listeners.forEach((fn) => fn());
  };
}
