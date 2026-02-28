// File: apps/web/src/components/ui/ColorPickerField.tsx
//
// T005-09: ColorPickerField — controlled hex color picker for the tenant
//          theme settings UI.
//
// Renders a native <input type="color"> paired with a hex text input so
// users can either use the browser color picker or type a hex value directly.
// Displays a live WCAG contrast badge when a `contrastWith` prop is supplied.

import { useId, useState } from 'react';
import { contrastRatio, wcagLevel, type WcagLevel } from '@/lib/contrast-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ColorPickerFieldProps {
  /** Accessible label for this field */
  label: string;
  /** Current hex value (e.g. "#1976d2") */
  value: string;
  /** Called whenever the color changes with a valid 7-char hex string */
  onChange: (hex: string) => void;
  /** Optional hex color to compute contrast ratio against (e.g. the background) */
  contrastWith?: string;
  /** Disable the field */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// WCAG badge colors
// ---------------------------------------------------------------------------

const LEVEL_CLASSES: Record<WcagLevel, string> = {
  AAA: 'bg-green-100 text-green-800 border border-green-300',
  AA: 'bg-blue-100 text-blue-800 border border-blue-300',
  'AA Large': 'bg-yellow-100 text-yellow-800 border border-yellow-300',
  Fail: 'bg-red-100 text-red-800 border border-red-300',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise any valid hex value to 7-char lowercase form. */
function normaliseHex(value: string): string {
  const cleaned = value.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = cleaned[0] + cleaned[0];
    const g = cleaned[1] + cleaned[1];
    const b = cleaned[2] + cleaned[2];
    return `#${r}${g}${b}`.toLowerCase();
  }
  if (cleaned.length === 6) return `#${cleaned}`.toLowerCase();
  return value;
}

const HEX_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

function isValidHex(value: string): boolean {
  return HEX_RE.test(value);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ColorPickerField({
  label,
  value,
  onChange,
  contrastWith,
  disabled = false,
}: ColorPickerFieldProps) {
  const pickerId = useId();
  const textId = useId();

  // Local draft text while the user is typing in the text input
  const [draft, setDraft] = useState<string | null>(null);

  // Displayed hex text — draft while editing, committed value otherwise
  const displayText = draft !== null ? draft : value;

  // --- Native color picker changed ---
  const handlePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value; // Always a valid 7-char hex from <input type="color">
    setDraft(null);
    onChange(hex);
  };

  // --- Text input: update draft on every keystroke ---
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setDraft(raw);

    // Commit immediately if already a valid short or long hex
    const normalised = normaliseHex(raw.startsWith('#') ? raw : `#${raw}`);
    if (isValidHex(normalised)) {
      onChange(normalised);
    }
  };

  // --- Commit on blur if draft is valid ---
  const handleTextBlur = () => {
    if (draft !== null) {
      const normalised = normaliseHex(draft.startsWith('#') ? draft : `#${draft}`);
      if (isValidHex(normalised)) {
        onChange(normalised);
      }
      setDraft(null);
    }
  };

  // --- Contrast badge ---
  const ratio = contrastWith ? contrastRatio(value, contrastWith) : null;
  const level = ratio !== null ? wcagLevel(ratio) : null;

  // Safe color for the picker (must be 7-char hex for the browser input)
  const pickerValue = isValidHex(value) ? normaliseHex(value) : '#000000';

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={textId} className="text-sm font-medium text-foreground">
        {label}
      </label>

      <div className="flex items-center gap-2">
        {/* Native color picker — decorative, syncs with text input */}
        <input
          id={pickerId}
          type="color"
          value={pickerValue}
          onChange={handlePickerChange}
          disabled={disabled}
          aria-label={`${label} color picker`}
          className="h-9 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="color-picker-native"
        />

        {/* Hex text input */}
        <input
          id={textId}
          type="text"
          value={displayText}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          disabled={disabled}
          maxLength={9}
          spellCheck={false}
          placeholder="#000000"
          aria-label={`${label} hex value`}
          aria-describedby={level ? `${textId}-contrast` : undefined}
          className="h-9 w-32 rounded border border-border bg-background px-3 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="color-picker-text"
        />

        {/* Color swatch preview */}
        <div
          className="h-9 w-9 rounded border border-border"
          style={{ backgroundColor: isValidHex(value) ? value : 'transparent' }}
          aria-hidden="true"
          data-testid="color-picker-swatch"
        />

        {/* WCAG contrast badge */}
        {level !== null && (
          <span
            id={`${textId}-contrast`}
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${LEVEL_CLASSES[level]}`}
            aria-label={`WCAG contrast level: ${level} (${ratio!.toFixed(2)}:1)`}
            data-testid="contrast-badge"
          >
            {level}
          </span>
        )}
      </div>
    </div>
  );
}
