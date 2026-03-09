// apps/web/src/components/extensions/ExtensionSlotSkeleton.tsx
//
// T013-13: Loading placeholder matching slot type dimensions (FR-008).
// 4 variants matching the 4 extension slot types (action, panel, form, toolbar).
// Uses Skeleton from @plexica/ui.
// ARIA: aria-busy="true", aria-label="Loading extension"

import React from 'react';
import { Skeleton } from '@plexica/ui';
import type { ExtensionSlotType } from '@plexica/types';

export interface ExtensionSlotSkeletonProps {
  /** Slot type drives the skeleton dimensions */
  slotType?: ExtensionSlotType;
  /** Optional CSS class */
  className?: string;
}

/**
 * Loading skeleton for an ExtensionSlot.
 * Dimensions reflect the expected rendered size per slot type so the layout
 * does not shift when contributions arrive.
 */
export const ExtensionSlotSkeleton: React.FC<ExtensionSlotSkeletonProps> = ({
  slotType = 'action',
  className,
}) => {
  return (
    <div
      className={className}
      aria-busy="true"
      aria-label="Loading extension"
      data-testid={`extension-slot-skeleton-${slotType}`}
    >
      {slotType === 'action' && <ActionSkeleton />}
      {slotType === 'toolbar' && <ToolbarSkeleton />}
      {slotType === 'panel' && <PanelSkeleton />}
      {slotType === 'form' && <FormSkeleton />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Skeleton variants
// ---------------------------------------------------------------------------

/** action: a row of small button-shaped skeletons */
function ActionSkeleton() {
  return (
    <div className="flex gap-2 items-center" aria-hidden="true">
      <Skeleton width={80} height={32} shape="rect" />
      <Skeleton width={80} height={32} shape="rect" />
      <Skeleton width={80} height={32} shape="rect" />
    </div>
  );
}

/** toolbar: a full-width strip */
function ToolbarSkeleton() {
  return (
    <div className="flex gap-2 items-center w-full" aria-hidden="true">
      <Skeleton width={32} height={32} shape="rect" />
      <Skeleton width={32} height={32} shape="rect" />
      <Skeleton width={32} height={32} shape="rect" />
      <Skeleton width={32} height={32} shape="rect" />
      <div className="flex-1" />
      <Skeleton width={48} height={32} shape="rect" />
    </div>
  );
}

/** panel: a card-shaped skeleton */
function PanelSkeleton() {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3" aria-hidden="true">
      <Skeleton width="60%" height={18} shape="line" />
      <Skeleton width="100%" height={14} shape="line" />
      <Skeleton width="85%" height={14} shape="line" />
      <Skeleton width="70%" height={14} shape="line" />
    </div>
  );
}

/** form: a multi-field form skeleton */
function FormSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1">
          <Skeleton width="30%" height={14} shape="line" />
          <Skeleton width="100%" height={36} shape="rect" />
        </div>
      ))}
      <Skeleton width={120} height={36} shape="rect" />
    </div>
  );
}
