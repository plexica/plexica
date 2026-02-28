// File: apps/web/src/components/ui/FontSelector.tsx
//
// T005-11: FontSelector — a grouped <select> for choosing one of the
//          25 ADR-020 curated self-hosted fonts.
//
// Fonts are grouped by category (sans-serif, serif, monospace, display).
// Accepts and returns font IDs (kebab-case) so consumers don't need to
// know display names.

import { useId } from 'react';
import { FONT_CATALOG } from '@plexica/types';
import type { FontDefinition } from '@plexica/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FontSelectorProps {
  /** Accessible label shown above the selector */
  label: string;
  /** Currently-selected font ID (kebab-case, e.g. "inter") */
  value: string;
  /** Called with the newly selected font ID when the user changes selection */
  onChange: (fontId: string) => void;
  /** Disable the field */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: FontDefinition['category'][] = [
  'sans-serif',
  'serif',
  'monospace',
  'display',
];

const CATEGORY_LABELS: Record<FontDefinition['category'], string> = {
  'sans-serif': 'Sans-serif',
  serif: 'Serif',
  monospace: 'Monospace',
  display: 'Display',
};

// Pre-group the catalog once (module-level, stable reference)
const GROUPED = CATEGORY_ORDER.reduce<Record<FontDefinition['category'], FontDefinition[]>>(
  (acc, cat) => {
    acc[cat] = FONT_CATALOG.filter((f) => f.category === cat).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    return acc;
  },
  {} as Record<FontDefinition['category'], FontDefinition[]>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FontSelector({ label, value, onChange, disabled = false }: FontSelectorProps) {
  const selectId = useId();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm font-medium text-foreground">
        {label}
      </label>

      <select
        id={selectId}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        aria-label={label}
        data-testid="font-selector-select"
        className="h-9 rounded border border-border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {CATEGORY_ORDER.map((cat) => {
          const fonts = GROUPED[cat];
          if (!fonts || fonts.length === 0) return null;
          return (
            <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
              {fonts.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
