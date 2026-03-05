// File: apps/super-admin/src/__tests__/components/SystemHealthCard.test.tsx
//
// Unit tests for SystemHealthCard — covers both variants, status colours,
// a11y (aria-live), and the loading skeleton.
//
// Spec 008 — T008-43

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemHealthCard } from '@/components/SystemHealthCard';
import type { SystemHealth } from '@/api/admin';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const HEALTHY: SystemHealth = {
  status: 'healthy',
  timestamp: '2026-03-03T10:00:00.000Z',
  dependencies: {
    database: { status: 'healthy', latencyMs: 4 },
    redis: { status: 'healthy', latencyMs: 1 },
    keycloak: { status: 'healthy', latencyMs: 12 },
    storage: { status: 'healthy', latencyMs: 8 },
  },
};

const UNHEALTHY: SystemHealth = {
  status: 'unhealthy',
  timestamp: '2026-03-03T10:05:00.000Z',
  dependencies: {
    database: { status: 'unhealthy', latencyMs: 999 },
    redis: { status: 'healthy', latencyMs: 1 },
    keycloak: { status: 'degraded', latencyMs: 350 },
    storage: { status: 'healthy', latencyMs: 9 },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SystemHealthCard', () => {
  // ── compact variant ───────────────────────────────────────────────────────

  it('compact variant renders overall status badge', () => {
    render(<SystemHealthCard health={HEALTHY} variant="compact" />);
    // The overall "healthy" badge should be visible
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('compact variant shows the timestamp', () => {
    render(<SystemHealthCard health={HEALTHY} variant="compact" />);
    // Timestamp formatted string is present somewhere in the card
    const checked = screen.getByText(/Checked/i);
    expect(checked).toBeInTheDocument();
  });

  // ── detailed variant ──────────────────────────────────────────────────────

  it('detailed variant renders all 4 dependency rows', () => {
    render(<SystemHealthCard health={HEALTHY} variant="detailed" />);
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('Keycloak')).toBeInTheDocument();
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('detailed variant renders overall status badge and per-dep badges', () => {
    render(<SystemHealthCard health={HEALTHY} variant="detailed" />);
    // "Overall" row + 4 dep rows all show "healthy" — getAllByText returns ≥5
    const badges = screen.getAllByText('healthy');
    expect(badges.length).toBeGreaterThanOrEqual(5);
  });

  it('detailed variant shows latency values', () => {
    render(<SystemHealthCard health={HEALTHY} variant="detailed" />);
    expect(screen.getByText('4 ms')).toBeInTheDocument();
    expect(screen.getByText('1 ms')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();
    expect(screen.getByText('8 ms')).toBeInTheDocument();
  });

  // ── unhealthy status styling ──────────────────────────────────────────────

  it('unhealthy status badge applies red Tailwind classes', () => {
    render(<SystemHealthCard health={UNHEALTHY} variant="compact" />);
    const badge = screen.getByText('unhealthy');
    expect(badge).toHaveClass('bg-red-100');
    expect(badge).toHaveClass('text-red-800');
  });

  it('degraded status badge applies amber Tailwind classes in detailed view', () => {
    render(<SystemHealthCard health={UNHEALTHY} variant="detailed" />);
    const degradedBadge = screen.getByText('degraded');
    expect(degradedBadge).toHaveClass('bg-amber-100');
    expect(degradedBadge).toHaveClass('text-amber-800');
  });

  // ── a11y ──────────────────────────────────────────────────────────────────

  it('aria-live="polite" is present in the DOM', () => {
    const { container } = render(<SystemHealthCard health={HEALTHY} />);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
  });

  // ── loading skeleton ──────────────────────────────────────────────────────

  it('loading state renders skeleton when isLoading=true and health is undefined', () => {
    render(<SystemHealthCard health={undefined} isLoading={true} variant="compact" />);
    // Skeleton elements have aria-label="Loading status" or are animate-pulse divs
    // The status badge text should NOT be present
    expect(screen.queryByText('healthy')).not.toBeInTheDocument();
    expect(screen.queryByText('unhealthy')).not.toBeInTheDocument();
    // aria-label on the loading skeleton
    expect(screen.getByLabelText('Loading status')).toBeInTheDocument();
  });

  it('loading state for detailed variant renders 4 skeleton rows', () => {
    const { container } = render(
      <SystemHealthCard health={undefined} isLoading={true} variant="detailed" />
    );
    // 4 dependency labels should NOT be present during loading
    expect(screen.queryByText('Database')).not.toBeInTheDocument();
    // animate-pulse divs appear for each row
    const pulseEls = container.querySelectorAll('.animate-pulse');
    expect(pulseEls.length).toBeGreaterThanOrEqual(4);
  });
});
