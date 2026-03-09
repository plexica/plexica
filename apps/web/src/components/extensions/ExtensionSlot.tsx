// apps/web/src/components/extensions/ExtensionSlot.tsx
//
// T013-11: Core host component for rendering extension contributions inside
// a plugin's UI. Queries TanStack Query cache (staleTime ≥ 60s per NFR-014).
//
// Rules:
//   - Loads each contribution via React.lazy + Module Federation (ADR-004/011)
//   - Renders contributions in ascending priority order; alpha tie-break by pluginId (FR-005)
//   - Wraps each contribution in <ExtensionContribution>
//   - Delegates to <VirtualizedSlotContainer> when count > virtualizationThreshold (default 20)
//   - feature flag gate: return null when ENABLE_EXTENSION_POINTS is off
//   - SSE cache invalidation removes stale contributions from cache (FR-010)
//
// A11y: role="region" on outer container, aria-label="Extensions: {label}",
//       aria-busy="true" while loading AND while any ExtensionContribution child
//       is still resolving its lazy module (NFR-011). aria-busy is only set to
//       "false" once ALL contributions have signalled onLoad (Fix-10).
//
// FR-007, FR-008, FR-009, FR-010, NFR-008, NFR-011, NFR-014

import React, { useMemo, useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useFeatureFlag } from '@/lib/feature-flags';
import { apiClient } from '@/lib/api-client';
import { ExtensionContribution } from './ExtensionContribution';
import { ExtensionErrorFallback } from './ExtensionErrorFallback';
import { ExtensionSlotSkeleton } from './ExtensionSlotSkeleton';
import { VirtualizedSlotContainer } from './VirtualizedSlotContainer';
import type { ResolvedContribution, ExtensionSlotType } from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExtensionSlotProps {
  /** Local identifier for the slot (e.g. "toolbar-actions"). Combined with pluginId for the API key. */
  slotId: string;
  /** Plugin ID that owns/declares this slot. */
  pluginId: string;
  /** Contextual data passed through to contributions. Only keys declared in contextSchema are forwarded. */
  context: Record<string, unknown>;
  /** Human-readable label used for aria-label. Falls back to slotId. */
  label?: string;
  /** Number of contributions above which VirtualizedSlotContainer is used. Default: 20. */
  virtualizationThreshold?: number;
  /** Optional CSS class for the outer container. */
  className?: string;
  /**
   * W-03: Explicit slot type override.
   * When provided, used directly instead of inferring from slotId string.
   * Prevents surprises when slotId doesn't follow the naming convention.
   */
  slotType?: ExtensionSlotType;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sort contributions: ascending priority, alpha tie-break by contributingPluginId. */
function sortContributions(contributions: ResolvedContribution[]): ResolvedContribution[] {
  return [...contributions].sort((a, b) => {
    const pDiff = a.priority - b.priority;
    if (pDiff !== 0) return pDiff;
    return a.contributingPluginId.localeCompare(b.contributingPluginId);
  });
}

// ---------------------------------------------------------------------------
// ExtensionSlot
// ---------------------------------------------------------------------------

export const ExtensionSlot: React.FC<ExtensionSlotProps> = ({
  slotId,
  pluginId,
  context,
  label,
  virtualizationThreshold = 20,
  className,
  slotType: slotTypeProp,
}) => {
  const extensionPointsEnabled = useFeatureFlag('ENABLE_EXTENSION_POINTS');
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? '';

  const queryKey = ['extension-contributions', slotId, pluginId, workspaceId];

  // Fetch contributions. staleTime ≥ 60s (NFR-014) — no refetch on every mount.
  // Fix-6: send targetPluginId and targetSlotId as separate query params rather than
  // the composite "pluginId:slotId" string, so the backend where-clause can filter
  // on individual indexed columns (extension-registry.repository.ts fix).
  const { data, isLoading, error, refetch } = useQuery<ResolvedContribution[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ targetPluginId: pluginId, targetSlotId: slotId });
      if (workspaceId) params.set('workspaceId', workspaceId);
      // W-01: apiClient is typed as WebApiClient & ApiClient (api-client.ts line 66),
      // so .get<T>() is directly available — no double-cast needed.
      const result = await apiClient.get<{
        contributions: ResolvedContribution[];
      }>(`/api/v1/extension-registry/contributions?${params.toString()}`);
      return result.contributions ?? [];
    },
    staleTime: 60_000,
    gcTime: 300_000,
    enabled: extensionPointsEnabled && !!slotId && !!pluginId,
  });

  // Fix-10: track how many ExtensionContribution children have signalled onLoad.
  // aria-busy must remain "true" until ALL contributions have resolved their lazy
  // module (NFR-011). Reset to 0 whenever the contribution list changes so that a
  // fresh SSE-driven refetch re-arms the counter.
  const [loadedCount, setLoadedCount] = useState(0);
  const totalCount = (data ?? []).length;

  const handleContributionLoad = useCallback(() => {
    setLoadedCount((n) => n + 1);
  }, []);

  // Reset counter when the data changes (e.g. after SSE cache invalidation).
  const prevDataRef = React.useRef(data);
  if (prevDataRef.current !== data) {
    prevDataRef.current = data;
    // Intentional synchronous state reset during render — safe because we only
    // do this when `data` identity changes, which React handles correctly.
    setLoadedCount(0);
  }

  const allChildrenLoaded = !isLoading && totalCount > 0 && loadedCount >= totalCount;

  // Sorted contribution list — memoised to avoid re-sorting on every render
  const sorted = useMemo(() => sortContributions(data ?? []), [data]);

  // Stable retry callback for the slot-level fetch error fallback
  const handleFetchRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Feature flag off — render nothing (zero overhead)
  if (!extensionPointsEnabled) return null;

  const slotLabel = label ?? slotId;
  // W-03: Use the explicit slotType prop when provided; otherwise infer from slotId suffix.
  // Inference is kept as a convenience fallback for callers that follow naming conventions.
  const inferredSlotType: ExtensionSlotType =
    slotTypeProp ??
    (() => {
      const id = slotId.toLowerCase();
      if (id.includes('toolbar')) return 'toolbar';
      if (id.includes('action')) return 'action';
      if (id.includes('form')) return 'form';
      return 'panel';
    })();

  // Loading state
  if (isLoading) {
    return (
      <div
        role="region"
        aria-label={`Extensions: ${slotLabel}`}
        aria-busy="true"
        className={className}
        data-testid={`extension-slot-${slotId}`}
      >
        <ExtensionSlotSkeleton slotType={inferredSlotType} />
      </div>
    );
  }

  // Fetch error — show actionable fallback so the user can retry (FR-008, US-007).
  // Empty slots (no contributions) are silently hidden — that is intentional.
  if (error) {
    return (
      <div
        role="region"
        aria-label={`Extensions: ${slotLabel}`}
        className={className}
        data-testid={`extension-slot-${slotId}`}
      >
        <ExtensionErrorFallback
          pluginName={slotLabel}
          error={error instanceof Error ? error : new Error(String(error))}
          onRetry={handleFetchRetry}
          variant={inferredSlotType === 'panel' || inferredSlotType === 'form' ? 'card' : 'compact'}
        />
      </div>
    );
  }

  // No contributions registered for this slot — render nothing silently
  if (sorted.length === 0) {
    return null;
  }

  // Build contribution elements
  const contributionElements = sorted.map((contribution) => (
    <ExtensionContribution
      key={contribution.id}
      contribution={contribution}
      context={context}
      slotType={inferredSlotType}
      slotId={slotId}
      onLoad={handleContributionLoad}
    />
  ));

  return (
    <div
      role="region"
      aria-label={`Extensions: ${slotLabel}`}
      aria-busy={allChildrenLoaded ? 'false' : 'true'}
      className={className}
      data-testid={`extension-slot-${slotId}`}
      data-slot-id={slotId}
      data-plugin-id={pluginId}
    >
      {sorted.length > virtualizationThreshold ? (
        <VirtualizedSlotContainer slotLabel={slotLabel} threshold={virtualizationThreshold}>
          {contributionElements}
        </VirtualizedSlotContainer>
      ) : (
        <div className="space-y-2">{contributionElements}</div>
      )}
    </div>
  );
};
