// apps/web/src/hooks/useExtensionSlot.ts
//
// T013-14: Minimal-boilerplate hook for slot-declaring plugins.
// Wraps TanStack Query with staleTime ≥ 60s for contribution resolution.
// Returns { contributions, isLoading, error, slotProps } where slotProps
// is ready to spread onto <ExtensionSlot>.
//
// Handles the extension_points_enabled feature flag check — returns empty
// state when disabled to avoid unnecessary API calls (NFR-014).
//
// Signature: useExtensionSlot(slotId, context, options?)
// FR-028, NFR-014

import { useQuery } from '@tanstack/react-query';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useFeatureFlag } from '@/lib/feature-flags';
import { apiClient } from '@/lib/api-client';
import type { ResolvedContribution } from '@plexica/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseExtensionSlotOptions {
  /** Plugin ID that owns the slot. Required for the query key. */
  pluginId: string;
  /** Virtualization threshold to forward to <ExtensionSlot>. Default: 20. */
  virtualizationThreshold?: number;
  /** Optional CSS class to forward to <ExtensionSlot>. */
  className?: string;
  /** Human-readable label for the slot. */
  label?: string;
}

export interface UseExtensionSlotResult {
  /** Resolved contributions in priority order. */
  contributions: ResolvedContribution[];
  isLoading: boolean;
  error: Error | null;
  /**
   * Props ready to spread onto <ExtensionSlot>.
   * Includes slotId, pluginId, context, and the resolved contributions.
   */
  slotProps: {
    slotId: string;
    pluginId: string;
    context: Record<string, unknown>;
    label?: string;
    virtualizationThreshold?: number;
    className?: string;
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useExtensionSlot(
  slotId: string,
  context: Record<string, unknown>,
  options: UseExtensionSlotOptions = { pluginId: '' }
): UseExtensionSlotResult {
  const extensionPointsEnabled = useFeatureFlag('ENABLE_EXTENSION_POINTS');
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? '';

  const { pluginId, virtualizationThreshold, className, label } = options;

  const { data, isLoading, error } = useQuery<ResolvedContribution[]>({
    queryKey: ['extension-contributions', slotId, pluginId, workspaceId],
    queryFn: async () => {
      const params = new URLSearchParams({
        slotId: `${pluginId}:${slotId}`,
        ...(workspaceId ? { workspaceId } : {}),
      });
      const result = await (apiClient as unknown as { get: <T>(url: string) => Promise<T> }).get<{
        contributions: ResolvedContribution[];
      }>(`/api/v1/extension-registry/contributions?${params.toString()}`);
      return result.contributions ?? [];
    },
    // staleTime ≥ 60s per NFR-014 — don't refetch on every mount
    staleTime: 60_000,
    gcTime: 300_000,
    // Only run when the feature flag is enabled and we have a slotId
    enabled: extensionPointsEnabled && !!slotId && !!pluginId,
  });

  const contributions: ResolvedContribution[] = extensionPointsEnabled ? (data ?? []) : [];

  return {
    contributions,
    isLoading: extensionPointsEnabled ? isLoading : false,
    error: error as Error | null,
    slotProps: {
      slotId,
      pluginId,
      context,
      label,
      virtualizationThreshold,
      className,
    },
  };
}
