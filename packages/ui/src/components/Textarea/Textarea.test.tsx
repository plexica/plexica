import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('renders without crashing', () => {
    render(<Textarea aria-label="Message" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('renders as a native textarea element', () => {
    render(<Textarea aria-label="Message" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('applies custom className to the textarea', () => {
    render(<Textarea className="custom-textarea" aria-label="Message" />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('custom-textarea');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Textarea ref={ref} aria-label="Message" />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLTextAreaElement);
  });

  it('handles text input', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Message" />);
    const textarea = screen.getByRole('textbox');

    await user.type(textarea, 'Hello world');
    expect(textarea).toHaveValue('Hello world');
  });

  it('renders placeholder text', () => {
    render(<Textarea placeholder="Type here..." />);
    expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
  });

  it('renders disabled state', () => {
    render(<Textarea aria-label="Message" disabled />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('shows helper text when provided', () => {
    render(<Textarea aria-label="Message" helperText="Max 500 characters" />);
    expect(screen.getByText('Max 500 characters')).toBeInTheDocument();
  });

  it('applies error styling when error prop is true', () => {
    render(<Textarea aria-label="Message" error />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveClass('border-destructive');
  });

  it('shows helper text with error styling when both error and helperText are set', () => {
    render(<Textarea aria-label="Message" error helperText="This field is required" />);
    const helperText = screen.getByText('This field is required');
    expect(helperText).toHaveClass('text-destructive');
  });

  it('shows helper text with default styling when no error', () => {
    render(<Textarea aria-label="Message" helperText="Optional note" />);
    const helperText = screen.getByText('Optional note');
    expect(helperText).toHaveClass('text-muted-foreground');
  });
});
