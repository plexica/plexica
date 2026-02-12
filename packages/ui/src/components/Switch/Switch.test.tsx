import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './Switch';

describe('Switch', () => {
  it('renders without crashing', () => {
    render(<Switch aria-label="Toggle feature" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Switch className="custom-switch" aria-label="Toggle" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveClass('custom-switch');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Switch ref={ref} aria-label="Toggle" />);
    expect(ref).toHaveBeenCalled();
  });

  it('is unchecked by default', () => {
    render(<Switch aria-label="Toggle" />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
  });

  it('toggles on click', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" />);
    const switchEl = screen.getByRole('switch');

    await user.click(switchEl);
    expect(switchEl).toHaveAttribute('data-state', 'checked');
  });

  it('toggles back to unchecked on second click', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" />);
    const switchEl = screen.getByRole('switch');

    await user.click(switchEl);
    expect(switchEl).toHaveAttribute('data-state', 'checked');

    await user.click(switchEl);
    expect(switchEl).toHaveAttribute('data-state', 'unchecked');
  });

  it('calls onCheckedChange when toggled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" onCheckedChange={onChange} />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders as disabled', () => {
    render(<Switch aria-label="Toggle" disabled />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toBeDisabled();
  });

  it('does not toggle when disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Switch aria-label="Toggle" disabled onCheckedChange={onChange} />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders with controlled checked state', () => {
    render(<Switch aria-label="Toggle" checked={true} />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl).toHaveAttribute('data-state', 'checked');
  });
});
