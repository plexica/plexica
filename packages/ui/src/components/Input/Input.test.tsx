import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

describe('Input', () => {
  it('renders without crashing', () => {
    render(<Input aria-label="test input" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders with placeholder', () => {
    render(<Input placeholder="Enter text..." />);
    expect(screen.getByPlaceholderText('Enter text...')).toBeInTheDocument();
  });

  it('applies custom className to the input element', () => {
    render(<Input className="custom-input" aria-label="input" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('custom-input');
  });

  it('forwards ref to the input element', () => {
    const ref = vi.fn();
    render(<Input ref={ref} aria-label="input" />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLInputElement);
  });

  it('applies default base classes', () => {
    render(<Input aria-label="input" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('flex', 'h-10', 'w-full', 'rounded-md', 'border', 'border-border');
  });

  it('handles text input', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="input" />);
    const input = screen.getByRole('textbox');

    await user.type(input, 'Hello world');
    expect(input).toHaveValue('Hello world');
  });

  it('calls onChange handler', async () => {
    const handleChange = vi.fn();
    const user = userEvent.setup();
    render(<Input aria-label="input" onChange={handleChange} />);

    await user.type(screen.getByRole('textbox'), 'a');
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('renders with specified type', () => {
    render(<Input type="password" placeholder="password" />);
    const input = screen.getByPlaceholderText('password');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('applies error styling when error is true', () => {
    render(<Input error aria-label="input" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveClass('border-destructive');
  });

  it('does not apply error styling when error is false', () => {
    render(<Input error={false} aria-label="input" />);
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveClass('border-destructive');
  });

  it('renders helperText below the input', () => {
    render(<Input helperText="This is a hint" aria-label="input" />);
    expect(screen.getByText('This is a hint')).toBeInTheDocument();
  });

  it('renders helperText with secondary color when no error', () => {
    render(<Input helperText="Hint text" aria-label="input" />);
    const helper = screen.getByText('Hint text');
    expect(helper).toHaveClass('text-muted-foreground');
    expect(helper).not.toHaveClass('text-destructive');
  });

  it('renders helperText with error color when error is true', () => {
    render(<Input error helperText="Error message" aria-label="input" />);
    const helper = screen.getByText('Error message');
    expect(helper).toHaveClass('text-destructive');
  });

  it('does not render helperText when not provided', () => {
    const { container } = render(<Input aria-label="input" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('is disabled when disabled prop is true', () => {
    render(<Input disabled aria-label="input" />);
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('passes through HTML attributes', () => {
    render(<Input aria-label="input" id="my-input" name="email" autoComplete="email" />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('id', 'my-input');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
  });
});
