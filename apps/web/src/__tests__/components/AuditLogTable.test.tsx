// apps/web/src/__tests__/components/AuditLogTable.test.tsx
//
// T008-58: Unit tests for AuditLogTable component.
//
// Covers:
//  1. renders table headers
//  2. renders entries with correct data
//  3. shows empty state when no entries
//  4. shows skeleton rows when isLoading
//  5. pagination nav shows correct page info
//  6. onPageChange called when next button clicked
//  7. first/last buttons disabled at boundaries
//  8. showTenantColumn=true shows Tenant ID column

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogTable } from '@/components/AuditLogTable';
import type { AuditLogEntry, AuditLogMeta } from '@/components/AuditLogTable';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTRY_1: AuditLogEntry = {
  id: 'entry-001',
  tenantId: 'tenant-abc-def-123',
  userId: 'user-xyz-789',
  action: 'tenant.created',
  resourceType: 'Tenant',
  resourceId: 'resource-id-001',
  details: { source: 'api' },
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
  createdAt: '2026-01-15T10:30:00.000Z',
};

const ENTRY_2: AuditLogEntry = {
  id: 'entry-002',
  userId: 'user-abc-111',
  action: 'workspace.deleted',
  resourceType: 'Workspace',
  resourceId: 'ws-resource-999',
  details: {},
  createdAt: '2026-01-16T08:00:00.000Z',
};

const META_PAGE_1: AuditLogMeta = {
  page: 1,
  limit: 20,
  total: 45,
  totalPages: 3,
};

const META_LAST_PAGE: AuditLogMeta = {
  page: 3,
  limit: 20,
  total: 45,
  totalPages: 3,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditLogTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Table headers ───────────────────────────────────────────────────────

  it('renders all default table headers', () => {
    render(<AuditLogTable entries={[]} />);

    expect(screen.getByRole('columnheader', { name: /timestamp/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /action/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /resource type/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /resource id/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /user id/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /ip address/i })).toBeInTheDocument();
  });

  it('does not render Tenant ID header by default', () => {
    render(<AuditLogTable entries={[]} />);
    expect(screen.queryByRole('columnheader', { name: /tenant id/i })).not.toBeInTheDocument();
  });

  // ── 2. Entries rendered ────────────────────────────────────────────────────

  it('renders entry data correctly', () => {
    render(<AuditLogTable entries={[ENTRY_1]} />);

    // Action column
    expect(screen.getByText('tenant.created')).toBeInTheDocument();

    // Resource type
    expect(screen.getByText('Tenant')).toBeInTheDocument();

    // Resource ID truncated to 12 chars: 'resource-id-'
    expect(screen.getByText('resource-id-…')).toBeInTheDocument();

    // User ID truncated to 12 chars: 'user-xyz-789'
    expect(screen.getByText('user-xyz-789')).toBeInTheDocument();

    // IP Address
    expect(screen.getByText('192.168.1.1')).toBeInTheDocument();
  });

  it('renders multiple entries as table rows', () => {
    render(<AuditLogTable entries={[ENTRY_1, ENTRY_2]} />);
    expect(screen.getByText('tenant.created')).toBeInTheDocument();
    expect(screen.getByText('workspace.deleted')).toBeInTheDocument();
  });

  it('shows dash for optional fields when missing', () => {
    render(<AuditLogTable entries={[ENTRY_2]} />);
    // ENTRY_2 has no ipAddress or tenantId
    // Should render '—' for missing fields
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  // ── 3. Empty state ─────────────────────────────────────────────────────────

  it('shows empty state message when entries array is empty', () => {
    render(<AuditLogTable entries={[]} />);
    expect(screen.getByText('No audit log entries found')).toBeInTheDocument();
  });

  it('does not render a data row when empty', () => {
    render(<AuditLogTable entries={[]} />);
    // The table body should have no action text cells
    expect(screen.queryByText('tenant.created')).not.toBeInTheDocument();
  });

  // ── 4. Loading state ───────────────────────────────────────────────────────

  it('renders 5 skeleton rows when isLoading=true', () => {
    render(<AuditLogTable entries={[]} isLoading={true} />);
    // Skeleton rows are aria-hidden; they contribute multiple cells each.
    // We verify the empty state is NOT shown and loading rows are present.
    expect(screen.queryByText('No audit log entries found')).not.toBeInTheDocument();

    // Each skeleton row has aria-hidden="true"
    const hiddenRows = document.querySelectorAll('tr[aria-hidden="true"]');
    expect(hiddenRows).toHaveLength(5);
  });

  it('does not show empty state when isLoading=true', () => {
    render(<AuditLogTable entries={[]} isLoading={true} />);
    expect(screen.queryByText('No audit log entries found')).not.toBeInTheDocument();
  });

  // ── 5. Pagination info ─────────────────────────────────────────────────────

  it('shows correct page info in pagination nav', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={META_PAGE_1}
        onPageChange={onPageChange}
        currentPage={1}
      />
    );

    const nav = screen.getByRole('navigation', { name: /audit log pagination/i });
    expect(nav).toBeInTheDocument();
    // "Showing 1–20 of 45 entries"
    expect(screen.getByText(/showing 1–20 of 45 entries/i)).toBeInTheDocument();
  });

  it('shows correct range for second page', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={{ page: 2, limit: 20, total: 45, totalPages: 3 }}
        onPageChange={onPageChange}
        currentPage={2}
      />
    );

    expect(screen.getByText(/showing 21–40 of 45 entries/i)).toBeInTheDocument();
  });

  it('does not render pagination nav when meta is absent', () => {
    render(<AuditLogTable entries={[ENTRY_1]} />);
    expect(
      screen.queryByRole('navigation', { name: /audit log pagination/i })
    ).not.toBeInTheDocument();
  });

  // ── 6. onPageChange called ─────────────────────────────────────────────────

  it('calls onPageChange with next page when Next is clicked', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={META_PAGE_1}
        onPageChange={onPageChange}
        currentPage={1}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with previous page when Prev is clicked', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={{ page: 2, limit: 20, total: 45, totalPages: 3 }}
        onPageChange={onPageChange}
        currentPage={2}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange with 1 when First is clicked', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={{ page: 2, limit: 20, total: 45, totalPages: 3 }}
        onPageChange={onPageChange}
        currentPage={2}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /first page/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange with totalPages when Last is clicked', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={META_PAGE_1}
        onPageChange={onPageChange}
        currentPage={1}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /last page/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  // ── 7. Pagination button disabled states ───────────────────────────────────

  it('disables First and Prev buttons on the first page', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={META_PAGE_1}
        onPageChange={onPageChange}
        currentPage={1}
      />
    );

    expect(screen.getByRole('button', { name: /first page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /last page/i })).not.toBeDisabled();
  });

  it('disables Next and Last buttons on the last page', () => {
    const onPageChange = vi.fn();
    render(
      <AuditLogTable
        entries={[ENTRY_1]}
        meta={META_LAST_PAGE}
        onPageChange={onPageChange}
        currentPage={3}
      />
    );

    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /last page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /first page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /previous page/i })).not.toBeDisabled();
  });

  // ── 8. showTenantColumn ────────────────────────────────────────────────────

  it('shows Tenant ID column header when showTenantColumn=true', () => {
    render(<AuditLogTable entries={[]} showTenantColumn={true} />);
    expect(screen.getByRole('columnheader', { name: /tenant id/i })).toBeInTheDocument();
  });

  it('renders truncated tenant ID in cell when showTenantColumn=true', () => {
    render(<AuditLogTable entries={[ENTRY_1]} showTenantColumn={true} />);
    // ENTRY_1.tenantId = 'tenant-abc-def-123' → truncated to 12 chars: 'tenant-abc-d…'
    expect(screen.getByText('tenant-abc-d…')).toBeInTheDocument();
  });

  it('does not render Tenant ID cells when showTenantColumn=false', () => {
    render(<AuditLogTable entries={[ENTRY_1]} showTenantColumn={false} />);
    expect(screen.queryByRole('columnheader', { name: /tenant id/i })).not.toBeInTheDocument();
    // The truncated tenant id must not appear as a table cell
    expect(screen.queryByText('tenant-abc-d…')).not.toBeInTheDocument();
  });

  // ── A11y: table role and scope ─────────────────────────────────────────────

  it('renders <table> with role="table"', () => {
    render(<AuditLogTable entries={[ENTRY_1]} />);
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();
  });

  it('all column headers have scope="col"', () => {
    render(<AuditLogTable entries={[ENTRY_1]} />);
    const headers = screen.getAllByRole('columnheader');
    headers.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col');
    });
  });
});
