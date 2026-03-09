// File: apps/web/src/__tests__/layout-engine/LayoutAwareTable.test.tsx
//
// T014-28 — RTL tests for LayoutAwareTable component.
// Spec 014 Frontend Layout Engine — FR-026, FR-005, FR-008, NFR-008.
//
// Tests:
//   Loading — shows data-testid="layout-aware-table-skeleton"
//   Normal render — shows data-testid="layout-aware-table", hidden column filtered
//   All columns hidden — shows data-testid="layout-aware-table-empty"
//   Null layout (fail-open) — shows data-testid="layout-aware-table-fallback", all columns passed through
//   Column reordering — columns sorted by resolved layout order
//   Unknown column (no match in layout) — kept (fail-open)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ColumnDef } from '@tanstack/react-table';
import type { ResolvedLayout } from '@plexica/types';

// ---------------------------------------------------------------------------
// Hoisted mock factories
// ---------------------------------------------------------------------------

const { mockUseResolvedLayout, mockDataTable } = vi.hoisted(() => {
  const mockUseResolvedLayout = vi.fn();
  // Capture columns passed to DataTable for assertion
  const mockDataTable = vi.fn(
    ({
      columns,
      'data-testid': testId,
    }: {
      columns: ColumnDef<unknown>[];
      data: unknown[];
      'data-testid'?: string;
    }) => (
      <table data-testid={testId ?? 'data-table'}>
        <thead>
          <tr>
            {columns.map((col) => {
              const colId =
                'accessorKey' in col && typeof col.accessorKey === 'string'
                  ? col.accessorKey
                  : col.id;
              return (
                <th key={colId ?? 'unknown'} data-col-id={colId ?? 'unknown'}>
                  {colId}
                </th>
              );
            })}
          </tr>
        </thead>
      </table>
    )
  );
  return { mockUseResolvedLayout, mockDataTable };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useResolvedLayout', () => ({
  useResolvedLayout: mockUseResolvedLayout,
}));

vi.mock('@plexica/ui', () => ({
  DataTable: mockDataTable,
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
  Skeleton: ({ shape, width, height }: { shape: string; width: string; height: string }) => (
    <div data-testid="skeleton" data-shape={shape} data-width={width} data-height={height} />
  ),
}));

vi.mock('lucide-react', () => ({
  EyeOff: () => <svg data-testid="icon-eye-off" />,
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks)
// ---------------------------------------------------------------------------

import { LayoutAwareTable } from '@/components/layout-engine/LayoutAwareTable';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

type Row = { id: string; name: string; email: string; createdAt: string };

const COLUMNS: ColumnDef<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'createdAt', header: 'Created At' },
];

const DATA: Row[] = [
  { id: '1', name: 'Alice', email: 'alice@example.com', createdAt: '2026-01-01' },
];

function makeLayout(overrides: Partial<ResolvedLayout> = {}): ResolvedLayout {
  return {
    formId: 'contacts-table',
    fields: [],
    columns: [
      { columnId: 'name', visibility: 'visible' },
      { columnId: 'email', visibility: 'visible' },
      { columnId: 'createdAt', visibility: 'visible' },
    ],
    sections: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('LayoutAwareTable — loading state', () => {
  beforeEach(() => {
    mockUseResolvedLayout.mockReturnValue({ data: null, isLoading: true, isError: false });
    mockDataTable.mockClear();
  });

  it('shows skeleton when isLoading=true', () => {
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    expect(screen.getByTestId('layout-aware-table-skeleton')).toBeInTheDocument();
  });

  it('does not render data table while loading', () => {
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    expect(screen.queryByTestId('layout-aware-table')).not.toBeInTheDocument();
    expect(mockDataTable).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Normal render
// ---------------------------------------------------------------------------

describe('LayoutAwareTable — normal render', () => {
  beforeEach(() => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout(),
      isLoading: false,
      isError: false,
    });
    mockDataTable.mockClear();
  });

  it('renders data-testid="layout-aware-table"', () => {
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    expect(screen.getByTestId('layout-aware-table')).toBeInTheDocument();
  });

  it('passes all visible columns to DataTable', () => {
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    expect(mockDataTable).toHaveBeenCalledOnce();
    const passedColumns = mockDataTable.mock.calls[0]![0].columns as ColumnDef<Row>[];
    expect(passedColumns).toHaveLength(3);
  });

  it('filters out hidden columns before passing to DataTable', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        columns: [
          { columnId: 'name', visibility: 'visible' },
          { columnId: 'email', visibility: 'hidden' },
          { columnId: 'createdAt', visibility: 'visible' },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    const passedColumns = mockDataTable.mock.calls[0]![0].columns as ColumnDef<Row>[];
    const columnIds = passedColumns.map(
      (c) => ('accessorKey' in c ? c.accessorKey : c.id) as string
    );
    expect(columnIds).not.toContain('email');
    expect(columnIds).toContain('name');
    expect(columnIds).toContain('createdAt');
  });
});

// ---------------------------------------------------------------------------
// All columns hidden
// ---------------------------------------------------------------------------

describe('LayoutAwareTable — all columns hidden', () => {
  it('shows data-testid="layout-aware-table-empty" when all columns are hidden', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        columns: [
          { columnId: 'name', visibility: 'hidden' },
          { columnId: 'email', visibility: 'hidden' },
          { columnId: 'createdAt', visibility: 'hidden' },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    expect(screen.getByTestId('layout-aware-table-empty')).toBeInTheDocument();
  });

  it('shows "No Columns Visible" message in empty state', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        columns: [{ columnId: 'name', visibility: 'hidden' }],
      }),
      isLoading: false,
      isError: false,
    });
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    expect(screen.getByText('No Columns Visible')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Null layout — fail-open (NFR-008)
// ---------------------------------------------------------------------------

describe('LayoutAwareTable — null layout (fail-open)', () => {
  beforeEach(() => {
    mockUseResolvedLayout.mockReturnValue({ data: null, isLoading: false, isError: false });
    mockDataTable.mockClear();
  });

  it('shows data-testid="layout-aware-table-fallback" when layout is null', () => {
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    expect(screen.getByTestId('layout-aware-table-fallback')).toBeInTheDocument();
  });

  it('passes all original columns to DataTable when layout is null (fail-open)', () => {
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    const passedColumns = mockDataTable.mock.calls[0]![0].columns as ColumnDef<Row>[];
    expect(passedColumns).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Column reordering
// ---------------------------------------------------------------------------

describe('LayoutAwareTable — column reordering', () => {
  beforeEach(() => {
    mockDataTable.mockClear();
  });

  it('reorders columns according to resolved layout order', () => {
    // Resolved order: createdAt(0), name(1), email(2) — reversed from original
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        columns: [
          { columnId: 'createdAt', visibility: 'visible' },
          { columnId: 'name', visibility: 'visible' },
          { columnId: 'email', visibility: 'visible' },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    const passedColumns = mockDataTable.mock.calls[0]![0].columns as ColumnDef<Row>[];
    const columnIds = passedColumns.map(
      (c) => ('accessorKey' in c ? c.accessorKey : c.id) as string
    );
    expect(columnIds[0]).toBe('createdAt');
    expect(columnIds[1]).toBe('name');
    expect(columnIds[2]).toBe('email');
  });
});

// ---------------------------------------------------------------------------
// Unknown column (not in layout config) — fail-open
// ---------------------------------------------------------------------------

describe('LayoutAwareTable — unknown column (fail-open)', () => {
  beforeEach(() => {
    mockDataTable.mockClear();
  });

  it('keeps columns not present in layout config (fail-open for new manifest fields)', () => {
    // Layout only knows about 'name' and 'email', not 'createdAt'
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        columns: [
          { columnId: 'name', visibility: 'visible' },
          { columnId: 'email', visibility: 'visible' },
          // 'createdAt' not in layout config
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(<LayoutAwareTable formId="contacts-table" columns={COLUMNS} data={DATA} />);
    const passedColumns = mockDataTable.mock.calls[0]![0].columns as ColumnDef<Row>[];
    const columnIds = passedColumns.map(
      (c) => ('accessorKey' in c ? c.accessorKey : c.id) as string
    );
    // createdAt should still be present even though it's not in the layout config
    expect(columnIds).toContain('createdAt');
  });

  it('keeps columns without accessorKey or id (fail-open)', () => {
    const columnsWithUnknown: ColumnDef<Row>[] = [
      { accessorKey: 'name', header: 'Name' },
      // Column with neither accessorKey nor id
      { header: 'Actions' } as ColumnDef<Row>,
    ];
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        columns: [{ columnId: 'name', visibility: 'visible' }],
      }),
      isLoading: false,
      isError: false,
    });
    render(<LayoutAwareTable formId="contacts-table" columns={columnsWithUnknown} data={DATA} />);
    const passedColumns = mockDataTable.mock.calls[0]![0].columns as ColumnDef<Row>[];
    // Both columns kept (one visible, one with no id — fail-open)
    expect(passedColumns).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// aria-label passthrough
// ---------------------------------------------------------------------------

describe('LayoutAwareTable — aria-label', () => {
  it('applies aria-label to wrapper div', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout(),
      isLoading: false,
      isError: false,
    });
    render(
      <LayoutAwareTable
        formId="contacts-table"
        columns={COLUMNS}
        data={DATA}
        aria-label="Contacts list"
      />
    );
    const wrapper = screen.getByTestId('layout-aware-table');
    expect(wrapper).toHaveAttribute('aria-label', 'Contacts list');
  });
});
