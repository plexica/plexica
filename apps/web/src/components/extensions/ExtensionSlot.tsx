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
//       aria-busy="true" while loading (NFR-011)
//
// FR-007, FR-008, FR-009, FR-010, NFR-008, NFR-011, NFR-014

import React, { useMemo, useCallback } from 'react';
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
}) => {
  const extensionPointsEnabled = useFeatureFlag('ENABLE_EXTENSION_POINTS');
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? '';

  const slotKey = `${pluginId}:${slotId}`;
  const queryKey = ['extension-contributions', slotId, pluginId, workspaceId];

  // Fetch contributions. staleTime ≥ 60s (NFR-014) — no refetch on every mount.
  const { data, isLoading, error, refetch } = useQuery<ResolvedContribution[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ slotId: slotKey });
      if (workspaceId) params.set('workspaceId', workspaceId);
      const result = await (apiClient as unknown as { get: <T>(url: string) => Promise<T> }).get<{
        contributions: ResolvedContribution[];
      }>(`/api/v1/extension-registry/contributions?${params.toString()}`);
      return result.contributions ?? [];
    },
    staleTime: 60_000,
    gcTime: 300_000,
    enabled: extensionPointsEnabled && !!slotId && !!pluginId,
  });

  // Sorted contribution list — memoised to avoid re-sorting on every render
  const sorted = useMemo(() => sortContributions(data ?? []), [data]);

  // Stable retry callback for the slot-level fetch error fallback
  const handleFetchRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // Feature flag off — render nothing (zero overhead)
  if (!extensionPointsEnabled) return null;

  const slotLabel = label ?? slotId;
  // Infer slot type from slotId suffix (e.g. "my-plugin:toolbar-actions" → toolbar).
  // Falls back to 'panel' when no recognized keyword is present.
  const inferredSlotType: ExtensionSlotType = (() => {
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
    />
  ));

  return (
    <div
      role="region"
      aria-label={`Extensions: ${slotLabel}`}
      aria-busy="false"
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
