// apps/web/src/components/extensions/index.ts
//
// T013-19: Barrel export for the extensions component library.
//
// Usage:
//   import { ExtensionSlot, ExtensionContribution } from '@/components/extensions';

export { ExtensionSlot } from './ExtensionSlot.js';
export { ExtensionContribution } from './ExtensionContribution.js';
export { ExtensionSlotSkeleton } from './ExtensionSlotSkeleton.js';
export { ExtensionErrorFallback } from './ExtensionErrorFallback.js';
export { VirtualizedSlotContainer } from './VirtualizedSlotContainer.js';
export { ContributionRow } from './ContributionRow.js';
export { SlotInspectorOverlay } from './SlotInspectorOverlay.js';
export { registerSlot } from './slot-inspector-registry.js';
export type { SlotInspectorEntry } from './slot-inspector-registry.js';
