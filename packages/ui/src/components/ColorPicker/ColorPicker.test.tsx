// File: packages/ui/src/components/ColorPicker/ColorPicker.test.tsx
// T001-27: Unit tests for ColorPicker component.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorPicker } from './ColorPicker';

describe('ColorPicker', () => {
  it('renders swatch button with current color in aria-label', () => {
    render(<ColorPicker value="#ff0000" onChange={vi.fn()} label="Primary" />);
    expect(screen.getByRole('button', { name: /primary: #ff0000/i })).toBeInTheDocument();
  });

  it('renders hex text input with current value', () => {
    render(<ColorPicker value="#3b82f6" onChange={vi.fn()} label="Accent" />);
    const input = screen.getByRole('textbox', { name: /accent hex code/i });
    expect(input).toHaveValue('#3b82f6');
  });

  it('calls onChange with valid hex on text input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#ffffff" onChange={onChange} label="Color" />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '#abc123');
    expect(onChange).toHaveBeenCalledWith('#abc123');
  });

  it('does NOT call onChange for invalid hex values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorPicker value="#ffffff" onChange={onChange} label="Color" />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'notvalid');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows invalid hex error message for bad input', async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#ffffff" onChange={vi.fn()} label="Color" />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, '#gg');
    expect(screen.getByText(/invalid hex/i)).toBeInTheDocument();
  });

  it('marks the text input aria-invalid when hex is invalid', async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#ffffff" onChange={vi.fn()} label="Color" />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'bad');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('reverts text to last valid value on blur when invalid', async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#abcdef" onChange={vi.fn()} label="Color" />);
    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'invalid');
    await user.tab(); // trigger blur
    expect(input).toHaveValue('#abcdef');
  });

  it('disables swatch and text input when disabled prop is set', () => {
    render(<ColorPicker value="#ff0000" onChange={vi.fn()} label="Color" disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
  });
});
