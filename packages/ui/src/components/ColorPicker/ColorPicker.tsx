// File: packages/ui/src/components/ColorPicker/ColorPicker.tsx
// T001-19: Color picker composite input per Spec 001 design spec.
//
// Features:
// - Color swatch button displaying the current color
// - Native <input type="color"> opened on swatch click
// - Hex text input with inline validation for #RRGGBB
// - Keyboard: Enter/Space open picker, Esc closes
// - Accessible: aria-label, disabled state

import * as React from 'react';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

function isValidHex(value: string): boolean {
  return HEX_REGEX.test(value);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  /** Current color in #RRGGBB format */
  value: string;
  /** Called only with valid #RRGGBB values */
  onChange: (color: string) => void;
  /** Accessible label for the input */
  label?: string;
  /** Whether the picker is interactive */
  disabled?: boolean;
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ColorPicker({
  value,
  onChange,
  label = 'Color',
  disabled = false,
  className,
}: ColorPickerProps) {
  // Track the raw text input separately so users can type partial values
  const [textValue, setTextValue] = React.useState(value);
  const [isInvalid, setIsInvalid] = React.useState(false);
  const nativeInputRef = React.useRef<HTMLInputElement>(null);

  // Sync textValue when controlled value changes from outside
  React.useEffect(() => {
    setTextValue(value);
    setIsInvalid(false);
  }, [value]);

  // Open the native color picker
  const openPicker = () => {
    if (!disabled) {
      nativeInputRef.current?.click();
    }
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value; // Always valid hex from native picker
    setTextValue(newColor);
    setIsInvalid(false);
    onChange(newColor);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextValue(raw);
    if (isValidHex(raw)) {
      setIsInvalid(false);
      onChange(raw);
    } else {
      setIsInvalid(true);
    }
  };

  const handleTextBlur = () => {
    if (!isValidHex(textValue)) {
      // Revert to last valid value
      setTextValue(value);
      setIsInvalid(false);
    }
  };

  const handleSwatchKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker();
    }
  };

  const safeSwatchColor = isValidHex(value) ? value : '#cccccc';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Swatch button */}
      <button
        type="button"
        aria-label={`${label}: ${value}. Click to open color picker.`}
        disabled={disabled}
        onClick={openPicker}
        onKeyDown={handleSwatchKeyDown}
        className={cn(
          'w-8 h-8 rounded-md border-2 border-border shrink-0 transition-opacity',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
        )}
        style={{ backgroundColor: safeSwatchColor }}
      />

      {/* Hidden native color input (triggers the OS picker) */}
      <input
        ref={nativeInputRef}
        type="color"
        value={isValidHex(value) ? value : '#000000'}
        onChange={handleNativeChange}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />

      {/* Hex text input */}
      <input
        type="text"
        value={textValue}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        disabled={disabled}
        aria-label={`${label} hex code`}
        aria-invalid={isInvalid}
        placeholder="#000000"
        maxLength={7}
        className={cn(
          'w-28 h-8 rounded-md border border-border bg-background px-2 text-sm font-mono',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          'transition-colors',
          isInvalid && 'border-destructive focus:ring-destructive',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
      />

      {isInvalid && (
        <span className="text-xs text-destructive" aria-live="polite" role="alert">
          Invalid hex (#RRGGBB)
        </span>
      )}
    </div>
  );
}
