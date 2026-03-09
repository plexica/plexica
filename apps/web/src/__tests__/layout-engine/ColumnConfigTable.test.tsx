// File: apps/web/src/__tests__/layout-engine/ColumnConfigTable.test.tsx
//
// T014-28 — Unit tests for ColumnConfigTable component.
// Spec 014 Frontend Layout Engine — FR-005, FR-012, NFR-010.
//
// Tests:
//   Renders data-testid="column-config-table"
//   Renders a row for each column
//   Renders role column headers
//   Shows column labels
//   VisibilityToggle rendered per role per column
//   Global select rendered per column
//   All controls disabled when disabled=true
//   onVisibilityChange called via toggle
//   onGlobalChange called via global select

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@plexica/ui', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    'aria-label': ariaLabel,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    disabled?: boolean;
    'aria-label'?: string;
    children: React.ReactNode;
  }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </select>
  ),
}));

vi.mock('@/components/layout-engine/VisibilityToggle', () => ({
  VisibilityToggle: ({
    mode,
    value,
    onChange,
    columnLabel,
    roleLabel,
    disabled,
  }: {
    mode: string;
    value: string;
    onChange: (v: string) => void;
    columnLabel?: string;
    roleLabel: string;
    disabled?: boolean;
  }) => (
    <button
      data-testid={`col-toggle-${columnLabel}-${roleLabel}`}
      onClick={() => onChange(value === 'visible' ? 'hidden' : 'visible')}
      disabled={disabled}
      aria-label={`Toggle ${columnLabel} for ${roleLabel}`}
    >
      {value}
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { ColumnConfigTable } from '@/components/layout-engine/ColumnConfigTable';
import type { ManifestColumn, ColumnOverride } from '@plexica/types';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const COLUMNS: ManifestColumn[] = [
  { columnId: 'created-at', label: 'Created At', order: 0 },
  { columnId: 'updated-at', label: 'Updated At', order: 1 },
];

const OVERRIDES: ColumnOverride[] = [
  { columnId: 'created-at', globalVisibility: 'visible', visibility: {} },
  { columnId: 'updated-at', globalVisibility: 'hidden', visibility: {} },
];

const ROLES = ['TENANT_ADMIN', 'MEMBER'] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ColumnConfigTable — rendering', () => {
  it('renders data-testid="column-config-table"', () => {
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('column-config-table')).toBeInTheDocument();
  });

  it('renders a row for each column', () => {
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('column-row-created-at')).toBeInTheDocument();
    expect(screen.getByTestId('column-row-updated-at')).toBeInTheDocument();
  });

  it('renders role column headers', () => {
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={vi.fn()}
      />
    );
    expect(screen.getByRole('columnheader', { name: 'TENANT_ADMIN' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'MEMBER' })).toBeInTheDocument();
  });

  it('shows column labels', () => {
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={vi.fn()}
      />
    );
    expect(screen.getByText('Created At')).toBeInTheDocument();
    expect(screen.getByText('Updated At')).toBeInTheDocument();
  });

  it('renders VisibilityToggle for each role×column combination', () => {
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('col-toggle-Created At-TENANT_ADMIN')).toBeInTheDocument();
    expect(screen.getByTestId('col-toggle-Created At-MEMBER')).toBeInTheDocument();
    expect(screen.getByTestId('col-toggle-Updated At-TENANT_ADMIN')).toBeInTheDocument();
    expect(screen.getByTestId('col-toggle-Updated At-MEMBER')).toBeInTheDocument();
  });
});

describe('ColumnConfigTable — interactions', () => {
  it('calls onVisibilityChange when toggle is clicked', () => {
    const onVisibilityChange = vi.fn();
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={onVisibilityChange}
        onGlobalChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('col-toggle-Created At-MEMBER'));
    expect(onVisibilityChange).toHaveBeenCalledWith('created-at', 'MEMBER', expect.any(String));
  });

  it('calls onGlobalChange when global select changes', () => {
    const onGlobalChange = vi.fn();
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={onGlobalChange}
      />
    );
    const selects = screen.getAllByRole('combobox');
    // First select corresponds to 'created-at' global visibility
    fireEvent.change(selects[0], { target: { value: 'hidden' } });
    expect(onGlobalChange).toHaveBeenCalledWith('created-at', 'hidden');
  });
});

describe('ColumnConfigTable — disabled prop', () => {
  it('disables all toggles when disabled=true', () => {
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={vi.fn()}
        disabled={true}
      />
    );
    const toggles = screen.getAllByRole('button');
    toggles.forEach((btn) => expect(btn).toBeDisabled());
  });

  it('disables global selects when disabled=true', () => {
    render(
      <ColumnConfigTable
        columns={COLUMNS}
        overrides={OVERRIDES}
        roles={[...ROLES]}
        onVisibilityChange={vi.fn()}
        onGlobalChange={vi.fn()}
        disabled={true}
      />
    );
    const selects = screen.getAllByRole('combobox');
    selects.forEach((s) => expect(s).toBeDisabled());
  });
});
