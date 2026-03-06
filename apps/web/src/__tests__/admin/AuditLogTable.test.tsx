// apps/web/src/__tests__/admin/AuditLogTable.test.tsx
//
// T008-60 — Unit tests for AuditLogTable component.
// Spec 008 Admin Interfaces — Phase 8: Frontend Tests

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vitest-axe setup
// ---------------------------------------------------------------------------

const { toHaveNoViolations } = (await import('vitest-axe/matchers')) as unknown as {
  toHaveNoViolations: Parameters<typeof expect.extend>[0][string];
};
expect.extend({ toHaveNoViolations });

function expectNoViolations(results: unknown): void {
  (expect(results) as unknown as { toHaveNoViolations(): void }).toHaveNoViolations();
}

import { configureAxe } from 'vitest-axe';
const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@plexica/ui', () => ({
  Skeleton: ({ height, width }: { height?: number; width?: number }) => (
    <div data-testid="skeleton" style={{ height, width }} aria-hidden="true" />
  ),
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
    variant,
    size,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    variant?: string;
    size?: string;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  ScrollText: () => <svg data-testid="scroll-text-icon" aria-hidden="true" />,
  ChevronFirst: () => <svg data-testid="chevron-first" aria-hidden="true" />,
  ChevronLast: () => <svg data-testid="chevron-last" aria-hidden="true" />,
  ChevronLeft: () => <svg data-testid="chevron-left" aria-hidden="true" />,
  ChevronRight: () => <svg data-testid="chevron-right" aria-hidden="true" />,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AuditLogTable } from '@/components/AuditLogTable';
import type { AuditLogEntry, AuditLogMeta } from '@/components/AuditLogTable';

// ---------------------------------------------------------------------------
// Silence console noise
// ---------------------------------------------------------------------------

const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(id: string, overrides?: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    id,
    userId: `user-${id}`,
    tenantId: `tenant-${id}`,
    action: `ACTION_${id.toUpperCase()}`,
    resourceType: 'workspace',
    resourceId: `resource-${id}`,
    details: {},
    ipAddress: '192.168.1.1',
    createdAt: '2026-03-01T10:00:00Z',
    ...overrides,
  };
}

function makeMeta(overrides?: Partial<AuditLogMeta>): AuditLogMeta {
  return {
    page: 1,
    limit: 20,
    total: 100,
    totalPages: 5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditLogTable', () => {
  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('renders 5 skeleton rows when isLoading=true', () => {
      render(<AuditLogTable entries={[]} isLoading={true} />);
      const skeletons = screen.getAllByTestId('skeleton');
      // 5 rows × 6 columns = 30 skeleton cells
      expect(skeletons.length).toBe(30);
    });

    it('skeleton rows have aria-hidden="true"', () => {
      render(<AuditLogTable entries={[]} isLoading={true} />);
      // All skeleton-containing rows should have aria-hidden
      const hiddenRows = document.querySelectorAll('tr[aria-hidden="true"]');
      expect(hiddenRows.length).toBe(5);
    });

    it('does not render data rows when loading', () => {
      const entries = [makeEntry('e1')];
      render(<AuditLogTable entries={entries} isLoading={true} />);
      expect(screen.queryByText('ACTION_E1')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders "No audit log entries found" when entries is empty and not loading', () => {
      render(<AuditLogTable entries={[]} isLoading={false} />);
      expect(screen.getByText('No audit log entries found')).toBeInTheDocument();
    });

    it('renders the scroll-text icon in empty state', () => {
      render(<AuditLogTable entries={[]} />);
      expect(screen.getByTestId('scroll-text-icon')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Column headers
  // -------------------------------------------------------------------------

  describe('column headers', () => {
    it('renders default 6 column headers', () => {
      render(<AuditLogTable entries={[]} />);
      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(6);
      expect(headers[0]).toHaveTextContent('Timestamp');
      expect(headers[1]).toHaveTextContent('Action');
      expect(headers[2]).toHaveTextContent('Resource Type');
      expect(headers[3]).toHaveTextContent('Resource ID');
      expect(headers[4]).toHaveTextContent('User ID');
      expect(headers[5]).toHaveTextContent('IP Address');
    });

    it('renders 7 column headers when showTenantColumn=true', () => {
      render(<AuditLogTable entries={[]} showTenantColumn={true} />);
      const headers = screen.getAllByRole('columnheader');
      expect(headers).toHaveLength(7);
      // Tenant ID inserted after User ID
      expect(headers[5]).toHaveTextContent('Tenant ID');
      expect(headers[6]).toHaveTextContent('IP Address');
    });

    it('all column headers have scope="col"', () => {
      render(<AuditLogTable entries={[]} />);
      const headers = screen.getAllByRole('columnheader');
      headers.forEach((th) => {
        expect(th).toHaveAttribute('scope', 'col');
      });
    });
  });

  // -------------------------------------------------------------------------
  // Data rows
  // -------------------------------------------------------------------------

  describe('data rows', () => {
    it('renders one row per entry', () => {
      const entries = [makeEntry('e1'), makeEntry('e2'), makeEntry('e3')];
      render(<AuditLogTable entries={entries} />);
      expect(screen.getByText('ACTION_E1')).toBeInTheDocument();
      expect(screen.getByText('ACTION_E2')).toBeInTheDocument();
      expect(screen.getByText('ACTION_E3')).toBeInTheDocument();
    });

    it('renders resource type and ip address', () => {
      const entry = makeEntry('e1', { resourceType: 'plugin', ipAddress: '10.0.0.1' });
      render(<AuditLogTable entries={[entry]} />);
      expect(screen.getByText('plugin')).toBeInTheDocument();
      expect(screen.getByText('10.0.0.1')).toBeInTheDocument();
    });

    it('renders "—" when optional fields are absent', () => {
      const entry = makeEntry('e1', {
        resourceType: undefined,
        ipAddress: undefined,
        userId: undefined,
        resourceId: undefined,
      });
      render(<AuditLogTable entries={[entry]} />);
      const dashes = screen.getAllByText('—');
      // resourceType, resourceId (truncated to "—"), userId (truncated), ipAddress
      expect(dashes.length).toBeGreaterThanOrEqual(2);
    });

    it('truncates long IDs to 12 chars with ellipsis', () => {
      const entry = makeEntry('e1', { resourceId: 'this-is-a-very-long-resource-id' });
      render(<AuditLogTable entries={[entry]} />);
      // Truncated to 12 chars: "this-is-a-ve…"
      expect(screen.getByText('this-is-a-ve…')).toBeInTheDocument();
    });

    it('renders Tenant ID column only when showTenantColumn=true', () => {
      const entry = makeEntry('e1', { tenantId: 'tenant-abc' });
      const { rerender } = render(<AuditLogTable entries={[entry]} showTenantColumn={false} />);
      // tenantId is not shown
      expect(screen.queryByText('tenant-abc')).not.toBeInTheDocument();

      rerender(<AuditLogTable entries={[entry]} showTenantColumn={true} />);
      // Now it's shown (truncated to 12: "tenant-abc")
      expect(screen.getByText('tenant-abc')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------

  describe('pagination nav', () => {
    it('does not render pagination when meta is not provided', () => {
      render(<AuditLogTable entries={[makeEntry('e1')]} />);
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });

    it('renders pagination nav when meta and onPageChange are provided', () => {
      render(
        <AuditLogTable entries={[]} meta={makeMeta()} onPageChange={vi.fn()} currentPage={1} />
      );
      expect(screen.getByRole('navigation', { name: /audit log pagination/i })).toBeInTheDocument();
    });

    it('shows correct "Showing X–Y of Z entries" text', () => {
      render(
        <AuditLogTable
          entries={[makeEntry('e1')]}
          meta={makeMeta({ page: 1, limit: 20, total: 100, totalPages: 5 })}
          onPageChange={vi.fn()}
          currentPage={1}
        />
      );
      expect(screen.getByText(/showing 1–20 of 100 entries/i)).toBeInTheDocument();
    });

    it('shows "No entries" when total is 0', () => {
      render(
        <AuditLogTable
          entries={[]}
          meta={makeMeta({ total: 0, totalPages: 0 })}
          onPageChange={vi.fn()}
          currentPage={1}
        />
      );
      expect(screen.getByText('No entries')).toBeInTheDocument();
    });

    it('First and Prev buttons are disabled on page 1', () => {
      render(
        <AuditLogTable entries={[]} meta={makeMeta()} onPageChange={vi.fn()} currentPage={1} />
      );
      expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    });

    it('Next and Last buttons are disabled on last page', () => {
      render(
        <AuditLogTable
          entries={[]}
          meta={makeMeta({ totalPages: 5 })}
          onPageChange={vi.fn()}
          currentPage={5}
        />
      );
      expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled();
    });

    it('calls onPageChange(1) when First page clicked', () => {
      const onPageChange = vi.fn();
      render(
        <AuditLogTable entries={[]} meta={makeMeta()} onPageChange={onPageChange} currentPage={3} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'First page' }));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('calls onPageChange(currentPage - 1) when Prev clicked', () => {
      const onPageChange = vi.fn();
      render(
        <AuditLogTable entries={[]} meta={makeMeta()} onPageChange={onPageChange} currentPage={3} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('calls onPageChange(currentPage + 1) when Next clicked', () => {
      const onPageChange = vi.fn();
      render(
        <AuditLogTable entries={[]} meta={makeMeta()} onPageChange={onPageChange} currentPage={2} />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('calls onPageChange(totalPages) when Last page clicked', () => {
      const onPageChange = vi.fn();
      render(
        <AuditLogTable
          entries={[]}
          meta={makeMeta({ totalPages: 5 })}
          onPageChange={onPageChange}
          currentPage={2}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Last page' }));
      expect(onPageChange).toHaveBeenCalledWith(5);
    });

    it('current page indicator has aria-current="page"', () => {
      render(
        <AuditLogTable
          entries={[]}
          meta={makeMeta({ totalPages: 5 })}
          onPageChange={vi.fn()}
          currentPage={3}
        />
      );
      const pageIndicator = screen.getByText('3 / 5');
      expect(pageIndicator).toHaveAttribute('aria-current', 'page');
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  describe('accessibility', () => {
    it('has no WCAG 2.1 AA violations in empty state', async () => {
      const { container } = render(<AuditLogTable entries={[]} />);
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations with data rows', async () => {
      const entries = [makeEntry('e1'), makeEntry('e2')];
      const { container } = render(<AuditLogTable entries={entries} />);
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations with pagination', async () => {
      const { container } = render(
        <AuditLogTable
          entries={[makeEntry('e1')]}
          meta={makeMeta()}
          onPageChange={vi.fn()}
          currentPage={2}
        />
      );
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations with showTenantColumn', async () => {
      const { container } = render(
        <AuditLogTable entries={[makeEntry('e1')]} showTenantColumn={true} />
      );
      expectNoViolations(await axe(container));
    });
  });
});
