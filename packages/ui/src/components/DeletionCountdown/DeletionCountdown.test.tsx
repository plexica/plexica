// File: packages/ui/src/components/DeletionCountdown/DeletionCountdown.test.tsx
// T001-27: Unit tests for DeletionCountdown component.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeletionCountdown } from './DeletionCountdown';

/** Build a date N days from now */
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
}

/** Build a date N hours from now */
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

/** Build a date in the past */
function pastDate(): string {
  return new Date(Date.now() - 1000).toISOString();
}

describe('DeletionCountdown — inline variant', () => {
  it('renders inline timer with days remaining (> 7 days)', () => {
    // Add a 0.1-day buffer so Math.floor doesn't slip to N-1 due to test execution time.
    render(<DeletionCountdown deletionScheduledAt={daysFromNow(15.1)} variant="inline" />);
    const timer = screen.getByRole('timer');
    expect(timer).toBeInTheDocument();
    expect(timer.textContent).toMatch(/15 days/i);
  });

  it('renders "Deletion imminent" when date has passed', () => {
    render(<DeletionCountdown deletionScheduledAt={pastDate()} variant="inline" />);
    expect(screen.getByText(/deletion imminent/i)).toBeInTheDocument();
  });

  it('has aria-live="polite" for screen reader updates', () => {
    render(<DeletionCountdown deletionScheduledAt={daysFromNow(10)} variant="inline" />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'polite');
  });

  it('has role="timer" attribute', () => {
    render(<DeletionCountdown deletionScheduledAt={daysFromNow(5)} />);
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});

describe('DeletionCountdown — banner variant', () => {
  it('renders full banner with warning text for > 7 days', () => {
    render(<DeletionCountdown deletionScheduledAt={daysFromNow(20)} variant="banner" />);
    const timer = screen.getByRole('timer');
    expect(timer).toBeInTheDocument();
    // Banner should contain the scheduled deletion text
    expect(timer.textContent).toMatch(/scheduled for deletion/i);
  });

  it('renders urgent banner text for <= 7 days', () => {
    // Add buffer so Math.floor doesn't slip to N-1.
    render(<DeletionCountdown deletionScheduledAt={daysFromNow(5.1)} variant="banner" />);
    const timer = screen.getByRole('timer');
    expect(timer.textContent).toMatch(/deletion in 5 day/i);
  });

  it('renders "Deletion imminent" heading for past date', () => {
    render(<DeletionCountdown deletionScheduledAt={pastDate()} variant="banner" />);
    expect(screen.getByText(/deletion imminent/i)).toBeInTheDocument();
  });

  it('has aria-live="polite" on banner element', () => {
    render(<DeletionCountdown deletionScheduledAt={daysFromNow(10)} variant="banner" />);
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders hours remaining for < 24h', () => {
    render(<DeletionCountdown deletionScheduledAt={hoursFromNow(10)} variant="banner" />);
    // Banner shows "less than 24 hours!" heading
    expect(screen.getByText(/deletion in less than 24 hours/i)).toBeInTheDocument();
  });
});
