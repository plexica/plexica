// File: apps/web/src/components/layout-engine/VisibilityToggle.tsx
//
// T014-17 — Cycling icon button for field/column visibility state.
// Spec 014 Frontend Layout Engine — FR-003, FR-005, NFR-010.
//
// Two modes:
//   field  — 3-state cycle: visible (editable) → readonly → hidden → visible
//   column — 2-state cycle: visible → hidden → visible
//
// Visual tokens (design spec §5.9, WCAG 2.1 AA contrast ≥ 4.5:1):
//   visible  (editable) — Eye icon,     green  (#16A34A)
//   readonly            — Lock icon,    blue   (#2563EB)
//   hidden              — EyeOff icon,  red    (#DC2626)
//
// ARIA:
//   role="button" (implicit from <button>)
//   aria-label updated on each cycle to announce new state (design spec §§201-238)
//   Not aria-pressed because the control cycles rather than toggles
//
// Touch target: min 44×44px (Constitution Art. 1.3, design spec NFR-010)

import { Eye, EyeOff, Lock } from 'lucide-react';
import type { FieldVisibility, ColumnVisibility } from '@plexica/types';

// ---------------------------------------------------------------------------
// Field mode (3 states)
// ---------------------------------------------------------------------------

export interface FieldVisibilityToggleProps {
  mode: 'field';
  /** Current visibility state for the field. */
  value: FieldVisibility;
  /** Called with the next state when the user cycles. */
  onChange: (next: FieldVisibility) => void;
  /** The field label — used in the ARIA label for accessibility. */
  fieldLabel: string;
  /** The role this toggle controls — used in the ARIA label. */
  roleLabel: string;
  /** When true, the button is rendered but not interactive. */
  disabled?: boolean;
  /** Optional additional CSS class names. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Column mode (2 states)
// ---------------------------------------------------------------------------

export interface ColumnVisibilityToggleProps {
  mode: 'column';
  /** Current visibility state for the column. */
  value: ColumnVisibility;
  /** Called with the next state when the user cycles. */
  onChange: (next: ColumnVisibility) => void;
  /** The column label — used in the ARIA label for accessibility. */
  columnLabel: string;
  /** The role this toggle controls — used in the ARIA label. */
  roleLabel: string;
  /** When true, the button is rendered but not interactive. */
  disabled?: boolean;
  /** Optional additional CSS class names. */
  className?: string;
}

export type VisibilityToggleProps = FieldVisibilityToggleProps | ColumnVisibilityToggleProps;

// ---------------------------------------------------------------------------
// Field visibility cycle order (design spec §154: visible → readonly → hidden → visible)
// ---------------------------------------------------------------------------

const FIELD_CYCLE: FieldVisibility[] = ['visible', 'readonly', 'hidden'];

function nextFieldVisibility(current: FieldVisibility): FieldVisibility {
  const idx = FIELD_CYCLE.indexOf(current);
  return FIELD_CYCLE[(idx + 1) % FIELD_CYCLE.length];
}

// ---------------------------------------------------------------------------
// Column visibility cycle order (visible → hidden → visible)
// ---------------------------------------------------------------------------

const COLUMN_CYCLE: ColumnVisibility[] = ['visible', 'hidden'];

function nextColumnVisibility(current: ColumnVisibility): ColumnVisibility {
  const idx = COLUMN_CYCLE.indexOf(current);
  return COLUMN_CYCLE[(idx + 1) % COLUMN_CYCLE.length];
}

// ---------------------------------------------------------------------------
// Visual config helpers
// ---------------------------------------------------------------------------

interface VisualConfig {
  Icon: typeof Eye;
  /** Tailwind text-color class. */
  colorClass: string;
  /** Human-readable state label for ARIA. */
  stateLabel: string;
}

function getFieldVisualConfig(value: FieldVisibility): VisualConfig {
  switch (value) {
    case 'visible':
      return { Icon: Eye, colorClass: 'text-green-600', stateLabel: 'editable' };
    case 'readonly':
      return { Icon: Lock, colorClass: 'text-blue-600', stateLabel: 'read-only' };
    case 'hidden':
      return { Icon: EyeOff, colorClass: 'text-red-600', stateLabel: 'hidden' };
  }
}

function getColumnVisualConfig(value: ColumnVisibility): VisualConfig {
  switch (value) {
    case 'visible':
      return { Icon: Eye, colorClass: 'text-green-600', stateLabel: 'visible' };
    case 'hidden':
      return { Icon: EyeOff, colorClass: 'text-red-600', stateLabel: 'hidden' };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Cycling icon button for toggling field or column visibility in the layout
 * engine admin panel.
 *
 * @example Field mode
 * ```tsx
 * <VisibilityToggle
 *   mode="field"
 *   value={field.visibility.ADMIN ?? 'visible'}
 *   onChange={(next) => updateFieldVisibility(fieldId, 'ADMIN', next)}
 *   fieldLabel="Budget"
 *   roleLabel="ADMIN"
 * />
 * ```
 *
 * @example Column mode
 * ```tsx
 * <VisibilityToggle
 *   mode="column"
 *   value={col.visibility.MEMBER ?? 'visible'}
 *   onChange={(next) => updateColumnVisibility(colId, 'MEMBER', next)}
 *   columnLabel="Created At"
 *   roleLabel="MEMBER"
 * />
 * ```
 */
export function VisibilityToggle(props: VisibilityToggleProps) {
  if (props.mode === 'field') {
    return <FieldVisibilityToggle {...props} />;
  }
  return <ColumnVisibilityToggle {...props} />;
}

// ---------------------------------------------------------------------------
// Field visibility toggle (3-state)
// ---------------------------------------------------------------------------

function FieldVisibilityToggle({
  value,
  onChange,
  fieldLabel,
  roleLabel,
  disabled = false,
  className = '',
}: FieldVisibilityToggleProps) {
  const { Icon, colorClass, stateLabel } = getFieldVisualConfig(value);
  // L01: aria-label announces the *next* state (what clicking will do), not the current state.
  // Announce current state via aria-describedby text instead.
  const { stateLabel: nextStateLabel } = getFieldVisualConfig(nextFieldVisibility(value));

  function handleClick() {
    if (!disabled) {
      onChange(nextFieldVisibility(value));
    }
  }

  // L01: "Set <field> visibility for <role> to <next state>" — announces the action, not current state.
  const ariaLabel = `Set ${fieldLabel} visibility for ${roleLabel} to ${nextStateLabel}. Currently ${stateLabel}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
      // 44×44px min touch target (Constitution Art. 1.3, NFR-010)
      className={[
        'inline-flex items-center justify-center',
        'min-h-[44px] min-w-[44px] rounded',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'transition-colors hover:bg-gray-100',
        colorClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon
        size={18}
        aria-hidden="true"
        // Announce the icon label via the parent button's aria-label instead
        focusable={false}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Column visibility toggle (2-state)
// ---------------------------------------------------------------------------

function ColumnVisibilityToggle({
  value,
  onChange,
  columnLabel,
  roleLabel,
  disabled = false,
  className = '',
}: ColumnVisibilityToggleProps) {
  const { Icon, colorClass, stateLabel } = getColumnVisualConfig(value);
  // L01: aria-label announces the *next* state (what clicking will do), not the current state.
  const { stateLabel: nextStateLabel } = getColumnVisualConfig(nextColumnVisibility(value));

  function handleClick() {
    if (!disabled) {
      onChange(nextColumnVisibility(value));
    }
  }

  // L01: "Set <column> visibility for <role> to <next state>" — announces the action, not current state.
  const ariaLabel = `Set ${columnLabel} visibility for ${roleLabel} to ${nextStateLabel}. Currently ${stateLabel}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={[
        'inline-flex items-center justify-center',
        'min-h-[44px] min-w-[44px] rounded',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'transition-colors hover:bg-gray-100',
        colorClass,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Icon size={18} aria-hidden="true" focusable={false} />
    </button>
  );
}
