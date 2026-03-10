// File: apps/web/src/hooks/useResolvedLayout.ts
//
// T014-14 — React Query hook for fetching the resolved layout for the current user.
// Spec 014 Frontend Layout Engine — FR-017, NFR-002, NFR-008.
//
// Design decisions:
//   - staleTime: 60_000 (FR-017 — 60s client-side cache per plan §5.14)
//   - Fail-open: on any error, returns `null` so consuming components fall back
//     to plugin manifest defaults (NFR-008). The hook never throws.
//   - workspaceId passed as query param when provided (FR-009 workspace override).
//   - queryKey includes workspaceId so workspace-specific results are cached
//     separately from tenant-level results.

import { useQuery } from '@tanstack/react-query';
import { getResolvedLayout } from '@/api/layout-config';
import type { ResolvedLayout } from '@plexica/types';

export interface UseResolvedLayoutOptions {
  /** The form identifier (e.g. "crm-contact-form"). */
  formId: string;
  /**
   * Optional workspace UUID.
   * When provided, the backend resolves workspace-scope overrides.
   * Must be a non-empty string to activate workspace scope.
   */
  workspaceId?: string;
  /**
   * When false, the query will not execute.
   * Useful when the parent component does not yet have a formId.
   * Defaults to true.
   */
  enabled?: boolean;
}

export interface UseResolvedLayoutResult {
  /** The resolved layout, or `null` when not yet loaded or on error (fail-open). */
  data: ResolvedLayout | null;
  /** True while the initial fetch is in flight. */
  isLoading: boolean;
  /** True when the query has encountered an error. On error, `data` is `null`. */
  isError: boolean;
}

/**
 * Fetches the fully resolved layout for a form, personalised for the current user.
 *
 * - Returns `null` on error (fail-open — consuming components use manifest defaults).
 * - `staleTime: 60_000` keeps fresh data in cache for 60 seconds.
 * - The query is keyed by `[formId, workspaceId]` so workspace-specific results
 *   are cached separately.
 *
 * @example
 * ```tsx
 * const { data: layout, isLoading } = useResolvedLayout({ formId: 'crm-contact-form' });
 * if (isLoading) return <Skeleton />;
 * // layout is ResolvedLayout | null — null means use manifest defaults
 * ```
 */
export function useResolvedLayout({
  formId,
  workspaceId,
  enabled = true,
}: UseResolvedLayoutOptions): UseResolvedLayoutResult {
  const query = useQuery<ResolvedLayout | null, Error>({
    queryKey: ['layout-engine', 'resolved', formId, workspaceId ?? null],
    queryFn: async (): Promise<ResolvedLayout | null> => {
      try {
        return await getResolvedLayout(formId, workspaceId);
      } catch (err) {
        // Fail-open (NFR-008): log in dev, silently return null so the
        // consuming component falls back to plugin manifest defaults.
        if (import.meta.env.DEV) {
          console.warn('[useResolvedLayout] Failed to fetch resolved layout, using defaults', err);
        }
        return null;
      }
    },
    staleTime: 60_000,
    enabled: enabled && Boolean(formId),
  });

  return {
    // If the query errored out, the queryFn itself returns null (fail-open),
    // so query.data will be null rather than undefined. Coerce undefined → null
    // for a clean public interface.
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
