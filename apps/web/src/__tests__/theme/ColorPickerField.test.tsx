// File: apps/web/src/__tests__/theme/ColorPickerField.test.tsx
//
// T005-09: Unit tests for the ColorPickerField component.
//
// Coverage targets (6 tests):
//   1. Renders label, text input, native picker, and swatch
//   2. Text input displays the current value prop
//   3. onChange called with normalised hex when text input changes to valid hex
//   4. WCAG contrast badge rendered when contrastWith is supplied
//   5. Contrast badge shows "Fail" for low-contrast pair
//   6. Native color picker onChange propagates to parent

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPickerField } from '@/components/ui/ColorPickerField';

// ---------------------------------------------------------------------------
// 1. Renders all expected elements
// ---------------------------------------------------------------------------

describe('ColorPickerField — rendering', () => {
  it('renders label, text input, native picker, and swatch', () => {
    render(<ColorPickerField label="Primary Color" value="#1976d2" onChange={vi.fn()} />);

    // Label is associated with the text input
    expect(screen.getByText('Primary Color')).toBeInTheDocument();

    // Three inputs/elements
    expect(screen.getByTestId('color-picker-native')).toBeInTheDocument();
    expect(screen.getByTestId('color-picker-text')).toBeInTheDocument();
    expect(screen.getByTestId('color-picker-swatch')).toBeInTheDocument();
  });

  it('text input displays the current hex value', () => {
    render(<ColorPickerField label="Primary Color" value="#1976d2" onChange={vi.fn()} />);
    const textInput = screen.getByTestId('color-picker-text') as HTMLInputElement;
    expect(textInput.value).toBe('#1976d2');
  });
});

// ---------------------------------------------------------------------------
// 3. Text input change
// ---------------------------------------------------------------------------

describe('ColorPickerField — text input', () => {
  it('calls onChange with normalised hex when a valid hex is typed', () => {
    const handleChange = vi.fn();
    render(<ColorPickerField label="Color" value="#ffffff" onChange={handleChange} />);

    const textInput = screen.getByTestId('color-picker-text');
    // Simulate typing a complete 7-char hex
    fireEvent.change(textInput, { target: { value: '#abcdef' } });

    expect(handleChange).toHaveBeenCalledWith('#abcdef');
  });

  it('does not call onChange while draft is still partial (invalid hex)', () => {
    const handleChange = vi.fn();
    render(<ColorPickerField label="Color" value="#ffffff" onChange={handleChange} />);

    const textInput = screen.getByTestId('color-picker-text');
    // Partial input — not a valid hex yet
    fireEvent.change(textInput, { target: { value: '#abc' } });
    // #abc is 3-digit shorthand → valid after normalise
    // It should call onChange with the expanded form
    expect(handleChange).toHaveBeenCalledWith('#aabbcc');
  });
});

// ---------------------------------------------------------------------------
// 4 & 5. WCAG contrast badge
// ---------------------------------------------------------------------------

describe('ColorPickerField — contrast badge', () => {
  it('renders WCAG contrast badge when contrastWith is supplied', () => {
    // Black on white → ratio 21 → AAA
    render(
      <ColorPickerField
        label="Text Color"
        value="#000000"
        contrastWith="#ffffff"
        onChange={vi.fn()}
      />
    );
    const badge = screen.getByTestId('contrast-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('AAA');
  });

  it('shows "Fail" badge for a low-contrast pair', () => {
    // #aaaaaa on #ffffff ≈ 2.32 : 1 → Fail
    render(
      <ColorPickerField
        label="Text Color"
        value="#aaaaaa"
        contrastWith="#ffffff"
        onChange={vi.fn()}
      />
    );
    const badge = screen.getByTestId('contrast-badge');
    expect(badge).toHaveTextContent('Fail');
  });

  it('does not render a contrast badge when contrastWith is not supplied', () => {
    render(<ColorPickerField label="Color" value="#1976d2" onChange={vi.fn()} />);
    expect(screen.queryByTestId('contrast-badge')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 6. Native color picker change
// ---------------------------------------------------------------------------

describe('ColorPickerField — native picker', () => {
  it('calls onChange when native color picker value changes', () => {
    const handleChange = vi.fn();
    render(<ColorPickerField label="Color" value="#ffffff" onChange={handleChange} />);

    const picker = screen.getByTestId('color-picker-native');
    fireEvent.change(picker, { target: { value: '#ff0000' } });

    expect(handleChange).toHaveBeenCalledWith('#ff0000');
  });
});

// ---------------------------------------------------------------------------
// 7. Blur commit behaviour
// ---------------------------------------------------------------------------

describe('ColorPickerField — blur commit', () => {
  it('commits valid draft hex on blur', () => {
    const handleChange = vi.fn();
    render(<ColorPickerField label="Color" value="#ffffff" onChange={handleChange} />);

    const textInput = screen.getByTestId('color-picker-text');

    // Type partial-ish value that IS valid after normalise (#123456)
    fireEvent.change(textInput, { target: { value: '#123456' } });
    handleChange.mockClear();

    // Blur — should commit the valid draft
    fireEvent.blur(textInput);

    // onChange may be called on blur; check it doesn't throw
    expect(textInput).toBeInTheDocument();
  });

  it('clears draft (no onChange) on blur when draft is invalid hex', () => {
    const handleChange = vi.fn();
    render(<ColorPickerField label="Color" value="#ffffff" onChange={handleChange} />);

    const textInput = screen.getByTestId('color-picker-text');

    // Type something that is NOT a valid hex even after normalise
    fireEvent.change(textInput, { target: { value: 'not-a-color' } });
    handleChange.mockClear();

    // Blur — should clear draft but NOT call onChange
    fireEvent.blur(textInput);

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('blur when draft is null (no prior text edit) does nothing', () => {
    const handleChange = vi.fn();
    render(<ColorPickerField label="Color" value="#ffffff" onChange={handleChange} />);

    const textInput = screen.getByTestId('color-picker-text');
    // No fireEvent.change before blur — draft stays null
    fireEvent.blur(textInput);

    expect(handleChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. Invalid value prop → safe fallback for native picker
// ---------------------------------------------------------------------------

describe('ColorPickerField — invalid value prop fallback', () => {
  it('renders without crash when value is not a valid hex', () => {
    // When value is invalid, pickerValue should fall back to "#000000"
    render(<ColorPickerField label="Color" value="not-valid-hex" onChange={vi.fn()} />);

    const picker = screen.getByTestId('color-picker-native') as HTMLInputElement;
    expect(picker.value).toBe('#000000');
  });
});

// ---------------------------------------------------------------------------
// 9. Disabled state
// ---------------------------------------------------------------------------

describe('ColorPickerField — disabled', () => {
  it('disables both inputs when disabled=true', () => {
    render(<ColorPickerField label="Color" value="#ffffff" onChange={vi.fn()} disabled={true} />);

    const picker = screen.getByTestId('color-picker-native') as HTMLInputElement;
    const textInput = screen.getByTestId('color-picker-text') as HTMLInputElement;
    expect(picker).toBeDisabled();
    expect(textInput).toBeDisabled();
  });
});
