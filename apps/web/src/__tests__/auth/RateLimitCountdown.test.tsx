// apps/web/src/__tests__/auth/RateLimitCountdown.test.tsx
//
// Tests for RateLimitCountdown (Spec 002, T7-12).
// Verifies: initial render, countdown ticking, announcement cadence,
//           onExpired callback, className passthrough, ARIA attributes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RateLimitCountdown } from '@/components/auth/RateLimitCountdown';

describe('RateLimitCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  it('should render the "Too many sign-in attempts" heading', () => {
    render(<RateLimitCountdown retryAfterSeconds={60} />);
    expect(screen.getByText('Too many sign-in attempts')).toBeInTheDocument();
  });

  it('should display formatted initial time as 1:00 for 60 seconds', () => {
    render(<RateLimitCountdown retryAfterSeconds={60} />);
    // The <span> with aria-label contains the formatted time
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('should display formatted initial time as 0:30 for 30 seconds', () => {
    render(<RateLimitCountdown retryAfterSeconds={30} />);
    expect(screen.getByText('0:30')).toBeInTheDocument();
  });

  it('should default to 60 seconds when retryAfterSeconds is not provided', () => {
    render(<RateLimitCountdown />);
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });

  it('should apply custom className to the container', () => {
    const { container } = render(
      <RateLimitCountdown retryAfterSeconds={10} className="my-custom-class" />
    );
    expect(container.firstChild).toHaveClass('my-custom-class');
  });

  // ---------------------------------------------------------------------------
  // ARIA / Accessibility
  // ---------------------------------------------------------------------------
  it('should have role="alert" on the container', () => {
    render(<RateLimitCountdown retryAfterSeconds={60} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should have a role="timer" aria-live="polite" sr-only span', () => {
    render(<RateLimitCountdown retryAfterSeconds={60} />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveAttribute('aria-live', 'polite');
    expect(timer).toHaveAttribute('aria-atomic', 'true');
    expect(timer).toHaveClass('sr-only');
  });

  it('should set aria-label on the time span to "{n} seconds"', () => {
    render(<RateLimitCountdown retryAfterSeconds={30} />);
    const timeSpan = screen.getByLabelText('30 seconds');
    expect(timeSpan).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Countdown ticking
  // ---------------------------------------------------------------------------
  it('should decrement the displayed time every second', () => {
    render(<RateLimitCountdown retryAfterSeconds={5} />);
    expect(screen.getByText('0:05')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('0:04')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('0:03')).toBeInTheDocument();
  });

  it('should call onExpired when countdown reaches 0', () => {
    const onExpired = vi.fn();
    render(<RateLimitCountdown retryAfterSeconds={3} onExpired={onExpired} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onExpired).toHaveBeenCalled();
  });

  it('should call onExpired when the countdown reaches zero', () => {
    const onExpired = vi.fn();
    render(<RateLimitCountdown retryAfterSeconds={2} onExpired={onExpired} />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onExpired).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Screen reader announcement cadence — only every 15 s (or last 5 s)
  // ---------------------------------------------------------------------------
  it('should not announce every second — timer text should be empty initially', () => {
    render(<RateLimitCountdown retryAfterSeconds={60} />);
    const timer = screen.getByRole('timer');
    // No announcement at t=0 (initial render)
    expect(timer.textContent).toBe('');
  });

  it('should announce after 15 seconds have elapsed', () => {
    render(<RateLimitCountdown retryAfterSeconds={60} />);
    const timer = screen.getByRole('timer');

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    // After 15s the text should contain a "Please wait" announcement
    expect(timer.textContent).toMatch(/please wait/i);
  });

  it('should announce during the last 5 seconds', () => {
    render(<RateLimitCountdown retryAfterSeconds={5} />);
    const timer = screen.getByRole('timer');

    act(() => {
      vi.advanceTimersByTime(1000); // t=4 — within last 5 s
    });

    expect(timer.textContent).toMatch(/please wait/i);
  });
});
