// apps/web/src/components/workspace/TemplatePickerGrid.tsx
//
// T011-23: TemplatePickerGrid — fetches template list and renders as a
// responsive selection grid.
// Spec 011 Phase 4 (FR-015, FR-021, FR-022).
// WCAG 2.1 AA: role="radiogroup", aria-label.
//
// Fixes applied:
//   F-022: Roving tabindex + arrow-key navigation within the radiogroup
//   F-033: Pino structured logging on fetch error

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@plexica/ui';
import { TemplateCard } from './TemplateCard';
import type { TemplateCardData } from './TemplateCard';
import { apiClient } from '@/lib/api-client';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchTemplates(): Promise<TemplateCardData[]> {
  return apiClient.get<TemplateCardData[]>('/api/workspace-templates');
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function GridSkeleton() {
  return (
    <div
      role="status"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      aria-label="Loading templates"
      aria-busy="true"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-2 p-4 border border-border rounded-md">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "No template" sentinel card data
// ---------------------------------------------------------------------------

const NO_TEMPLATE_OPTION: TemplateCardData = {
  id: '__none__',
  name: 'No template',
  description: 'Create an empty workspace with no pre-configured plugins or pages.',
  isDefault: false,
  sourcePluginName: null,
  items: [],
};

// ---------------------------------------------------------------------------
// TemplatePickerGrid
// ---------------------------------------------------------------------------

export interface TemplatePickerGridProps {
  /** Called when user selects a template; null means "no template" */
  onSelect?: (templateId: string | null) => void;
  /** Currently selected template id, null = no template, undefined = none yet */
  selectedId?: string | null;
}

/**
 * Fully controlled component.
 * The parent is responsible for tracking selected state via `selectedId` + `onSelect`.
 * When `selectedId` is undefined, no option is pre-selected.
 */
export function TemplatePickerGrid({ onSelect, selectedId }: TemplatePickerGridProps) {
  const {
    data: templates = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['workspace-templates'],
    queryFn: fetchTemplates,
    staleTime: 60_000,
  });

  // F-033: log structured error when fetch fails — in useEffect to avoid log spam on re-renders
  useEffect(() => {
    if (isError) {
      logger.error({ component: 'TemplatePickerGrid' }, 'Failed to fetch templates');
    }
  }, [isError]);

  // INFO-6 fix: memoize allOptions so the array reference is stable and can be
  // used as a useEffect dependency without triggering extra re-runs.
  const allOptions = useMemo(() => [NO_TEMPLATE_OPTION, ...templates], [templates]);

  // Map external selectedId → internal card id:
  // null      → '__none__'  (user wants no template)
  // undefined → undefined   (nothing highlighted yet)
  const effectiveSelected = selectedId === null ? '__none__' : selectedId;

  // F-022: Roving tabindex state — tracks which card index holds tabIndex=0.
  // M-002 fix: initialize from selectedId so tabstop matches the visually checked card on re-entry.
  const [focusedIndex, setFocusedIndex] = useState(() => {
    if (selectedId === undefined) return 0;
    const effectiveId = selectedId === null ? '__none__' : selectedId;
    const idx = allOptions.findIndex((o) => o.id === effectiveId);
    return idx >= 0 ? idx : 0;
  });

  // M-002 fix (continued): once templates have loaded, re-sync the tabstop with selectedId.
  // The lazy initializer above only has access to the initial allOptions (before the async
  // fetch resolves), so we need a secondary sync for the post-load case.
  useEffect(() => {
    if (selectedId === undefined) return;
    const effectiveId = selectedId === null ? '__none__' : selectedId;
    const idx = allOptions.findIndex((o) => o.id === effectiveId);
    if (idx >= 0) setFocusedIndex(idx);
  }, [allOptions, selectedId]);
  // Refs array to imperatively focus individual cards on arrow-key nav
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const focusCard = useCallback((index: number) => {
    setFocusedIndex(index);
    cardRefs.current[index]?.focus();
  }, []);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect?.(id === '__none__' ? null : id);
    },
    [onSelect]
  );

  // F-022: Arrow-key navigation on the radiogroup container
  // WAI-ARIA radiogroup pattern: moving focus also selects (H-005)
  // Note: role="radiogroup" IS an interactive ARIA role — no eslint-disable needed here.
  const handleGridKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const newIndex =
        e.key === 'ArrowRight' || e.key === 'ArrowDown'
          ? Math.min(focusedIndex + 1, allOptions.length - 1)
          : Math.max(focusedIndex - 1, 0);
      focusCard(newIndex);
      // H-005: Arrow-key navigation also triggers selection (WAI-ARIA radiogroup pattern)
      handleSelect(allOptions[newIndex].id);
    },
    [focusedIndex, allOptions, focusCard, handleSelect]
  );

  if (isLoading) return <GridSkeleton />;

  if (isError) {
    return (
      <div role="alert" className="text-sm text-destructive py-4 text-center">
        Failed to load templates.{' '}
        <button
          type="button"
          className="underline hover:no-underline"
          onClick={() => void refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Select workspace template"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      onKeyDown={handleGridKeyDown}
    >
      {allOptions.map((tmpl, idx) => (
        <TemplateCard
          key={tmpl.id}
          ref={(el: HTMLDivElement | null) => {
            cardRefs.current[idx] = el;
          }}
          template={tmpl}
          selected={effectiveSelected === tmpl.id}
          onSelect={(id) => {
            setFocusedIndex(idx);
            handleSelect(id);
          }}
          tabIndex={focusedIndex === idx ? 0 : -1}
        />
      ))}
    </div>
  );
}
