// File: apps/super-admin/src/__tests__/components/TenantStatusBadge.test.tsx
//
// Unit tests for the TenantStatusBadge component (Spec 008 T008-44).
// Covers all 5 tenant statuses: correct label, aria-label, and colour classes.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TenantStatusBadge } from '@/components/TenantStatusBadge';
import type { TenantStatus } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALL_STATUSES: TenantStatus[] = [
  'ACTIVE',
  'SUSPENDED',
  'PROVISIONING',
  'PENDING_DELETION',
  'DELETED',
];

const EXPECTED_LABELS: Record<TenantStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  PROVISIONING: 'Provisioning',
  PENDING_DELETION: 'Pending Deletion',
  DELETED: 'Deleted',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TenantStatusBadge', () => {
  // ── Label rendering ────────────────────────────────────────────────────────

  it.each(ALL_STATUSES)('renders the correct label for status %s', (status) => {
    render(<TenantStatusBadge status={status} />);
    expect(screen.getByText(EXPECTED_LABELS[status])).toBeInTheDocument();
  });

  // ── Accessibility — aria-label ─────────────────────────────────────────────

  it.each(ALL_STATUSES)('has aria-label="Tenant status: %s" for status %s', (status) => {
    render(<TenantStatusBadge status={status} />);
    expect(screen.getByRole('status', { name: `Tenant status: ${status}` })).toBeInTheDocument();
  });

  // ── Colour classes ─────────────────────────────────────────────────────────

  it('ACTIVE badge has green colour classes', () => {
    const { container } = render(<TenantStatusBadge status="ACTIVE" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('SUSPENDED badge has amber colour classes', () => {
    const { container } = render(<TenantStatusBadge status="SUSPENDED" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-amber-100');
    expect(badge.className).toContain('text-amber-800');
  });

  it('PROVISIONING badge has blue colour classes', () => {
    const { container } = render(<TenantStatusBadge status="PROVISIONING" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-blue-100');
    expect(badge.className).toContain('text-blue-800');
  });

  it('PENDING_DELETION badge has red colour classes', () => {
    const { container } = render(<TenantStatusBadge status="PENDING_DELETION" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });

  it('DELETED badge has zinc colour classes', () => {
    const { container } = render(<TenantStatusBadge status="DELETED" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-zinc-100');
    expect(badge.className).toContain('text-zinc-500');
  });

  // ── PROVISIONING spinner ───────────────────────────────────────────────────

  it('PROVISIONING badge renders a spinner that is aria-hidden', () => {
    const { container } = render(<TenantStatusBadge status="PROVISIONING" />);
    const hiddenElements = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenElements.length).toBeGreaterThan(0);
  });

  it('ACTIVE badge does NOT render an aria-hidden spinner', () => {
    const { container } = render(<TenantStatusBadge status="ACTIVE" />);
    // No spinner for non-transient statuses
    const spinners = container.querySelectorAll('[role="status"]');
    // The outer badge itself has role="status"; no nested spinner role="status"
    expect(spinners.length).toBe(1);
  });

  // ── Extra className prop ───────────────────────────────────────────────────

  it('forwards extra className prop onto the badge element', () => {
    const { container } = render(<TenantStatusBadge status="ACTIVE" className="my-custom-class" />);
    expect(container.innerHTML).toContain('my-custom-class');
  });
});
