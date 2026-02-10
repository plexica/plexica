import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './Label';

describe('Label', () => {
  it('renders without crashing', () => {
    render(<Label>Username</Label>);
    expect(screen.getByText('Username')).toBeInTheDocument();
  });

  it('renders as a label element', () => {
    render(<Label>Email</Label>);
    const label = screen.getByText('Email');
    expect(label.tagName).toBe('LABEL');
  });

  it('applies custom className', () => {
    render(<Label className="custom-label">Name</Label>);
    expect(screen.getByText('Name')).toHaveClass('custom-label');
  });

  it('applies default styling', () => {
    render(<Label>Field</Label>);
    const label = screen.getByText('Field');
    expect(label).toHaveClass('text-sm', 'font-medium');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Label ref={ref}>Name</Label>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLLabelElement);
  });

  it('associates with input via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email-input">Email</Label>
        <input id="email-input" type="email" />
      </>
    );
    const label = screen.getByText('Email');
    expect(label).toHaveAttribute('for', 'email-input');
  });

  it('passes through additional HTML attributes', () => {
    render(<Label data-testid="my-label">Test</Label>);
    expect(screen.getByTestId('my-label')).toBeInTheDocument();
  });
});
