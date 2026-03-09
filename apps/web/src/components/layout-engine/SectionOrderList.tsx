// File: apps/web/src/components/layout-engine/SectionOrderList.tsx
//
// T014-21 — Reorderable section list for the admin panel.
// Spec 014 Frontend Layout Engine — FR-004, FR-012, NFR-010.
//
// Shows all manifest sections with Up/Down order controls.
// The section order affects how sections are rendered in LayoutAwareForm.
//
// ARIA:
//   list role (implicit from <ol>)
//   Each item: role="listitem"
//   Up/Down buttons: aria-label="Move {section} up/down"
//   aria-disabled="true" at boundaries

import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import type { ManifestSection, SectionOverride } from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SectionOrderListProps {
  /** All sections declared in the plugin manifest. */
  sections: ManifestSection[];
  /** Current section order overrides. */
  overrides: SectionOverride[];
  /** Callback when the admin moves a section up or down. */
  onOrderChange: (sectionId: string, direction: 'up' | 'down') => void;
  /** When true, all interactive controls are disabled. */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSectionOrder(
  overrides: SectionOverride[],
  sectionId: string,
  defaultOrder: number
): number {
  return overrides.find((o) => o.sectionId === sectionId)?.order ?? defaultOrder;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reorderable list for managing section display order in the layout config.
 *
 * @example
 * ```tsx
 * <SectionOrderList
 *   sections={schema.sections}
 *   overrides={currentConfig.sections}
 *   onOrderChange={handleSectionOrderChange}
 * />
 * ```
 */
export function SectionOrderList({
  sections,
  overrides,
  onOrderChange,
  disabled = false,
}: SectionOrderListProps) {
  if (sections.length === 0) {
    return null;
  }

  // Sort sections by current configured order
  const sortedSections = [...sections].sort((a, b) => {
    const aOrder = getSectionOrder(overrides, a.sectionId, a.order);
    const bOrder = getSectionOrder(overrides, b.sectionId, b.order);
    return aOrder - bOrder;
  });

  const total = sortedSections.length;

  return (
    <ol aria-label="Section order" className="space-y-1" data-testid="section-order-list">
      {sortedSections.map((section, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === total - 1;
        const position = idx + 1;

        return (
          <li
            key={section.sectionId}
            className="flex items-center gap-2 px-3 py-2 rounded border border-border bg-card hover:bg-muted/30 transition-colors"
            data-testid={`section-item-${section.sectionId}`}
          >
            {/* Order controls */}
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => onOrderChange(section.sectionId, 'up')}
                disabled={disabled || isFirst}
                aria-label={`Move ${section.label} up`}
                aria-disabled={isFirst ? 'true' : undefined}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronUp size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onOrderChange(section.sectionId, 'down')}
                disabled={disabled || isLast}
                aria-label={`Move ${section.label} down`}
                aria-disabled={isLast ? 'true' : undefined}
                className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>

            {/* Position number */}
            <span
              aria-live="polite"
              aria-label={`${section.label} is at position ${position} of ${total}`}
              className="w-5 text-center text-xs text-muted-foreground tabular-nums flex-shrink-0"
            >
              {position}.
            </span>

            {/* Section label */}
            <span className="text-sm font-medium">{section.label}</span>

            {/* Section ID (small/muted for admin context) */}
            <span className="ml-auto text-xs text-muted-foreground font-mono">
              {section.sectionId}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
