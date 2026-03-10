// File: apps/web/src/__tests__/layout-engine/VisibilityToggle.test.tsx
//
// T014-28 — Unit tests for the VisibilityToggle component.
// Spec 014 Frontend Layout Engine — FR-003, FR-005, NFR-010.
//
// Tests:
//   Field mode (3-state): visible → readonly → hidden → visible (cycling)
//   Column mode (2-state): visible → hidden → visible (cycling)
//   ARIA labels (design spec §§201-238)
//   Disabled prop prevents cycling
//   Touch target min 44×44px (Constitution Art. 1.3, NFR-010)

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mock lucide-react icons to prevent jsdom SVG rendering issues
// ---------------------------------------------------------------------------

vi.mock('lucide-react', () => ({
  Eye: ({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean }) => (
    <span data-testid="icon-eye" aria-hidden={ariaHidden} />
  ),
  EyeOff: ({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean }) => (
    <span data-testid="icon-eye-off" aria-hidden={ariaHidden} />
  ),
  Lock: ({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean }) => (
    <span data-testid="icon-lock" aria-hidden={ariaHidden} />
  ),
}));

// ---------------------------------------------------------------------------
// Mock @plexica/types — only needs the visibility type shapes (already imported
// by the component; tsconfig path alias resolves it)
// ---------------------------------------------------------------------------

import { VisibilityToggle } from '@/components/layout-engine/VisibilityToggle';
import type {
  FieldVisibilityToggleProps,
  ColumnVisibilityToggleProps,
} from '@/components/layout-engine/VisibilityToggle';

// ---------------------------------------------------------------------------
// Field mode — 3-state cycling
// ---------------------------------------------------------------------------

describe('VisibilityToggle — field mode', () => {
  function renderFieldToggle(overrides: Partial<FieldVisibilityToggleProps> = {}) {
    const onChange = vi.fn();
    const props: FieldVisibilityToggleProps = {
      mode: 'field',
      value: 'visible',
      onChange,
      fieldLabel: 'Budget',
      roleLabel: 'ADMIN',
      ...overrides,
    };
    render(<VisibilityToggle {...props} />);
    return { onChange };
  }

  it('renders a button element', () => {
    renderFieldToggle();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has correct ARIA label for visible state (stateLabel = "editable")', () => {
    renderFieldToggle({ value: 'visible' });
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Set Budget visibility for ADMIN to read-only. Currently editable'
    );
  });

  it('has correct ARIA label for readonly state (stateLabel = "read-only")', () => {
    renderFieldToggle({ value: 'readonly' });
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Set Budget visibility for ADMIN to hidden. Currently read-only'
    );
  });

  it('has correct ARIA label for hidden state (stateLabel = "hidden")', () => {
    renderFieldToggle({ value: 'hidden' });
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Set Budget visibility for ADMIN to editable. Currently hidden'
    );
  });

  it('cycles visible → readonly on click', () => {
    const { onChange } = renderFieldToggle({ value: 'visible' });
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('readonly');
  });

  it('cycles readonly → hidden on click', () => {
    const { onChange } = renderFieldToggle({ value: 'readonly' });
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('hidden');
  });

  it('cycles hidden → visible on click', () => {
    const { onChange } = renderFieldToggle({ value: 'hidden' });
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('visible');
  });

  it('shows Eye icon for visible state', () => {
    renderFieldToggle({ value: 'visible' });
    expect(screen.getByTestId('icon-eye')).toBeInTheDocument();
  });

  it('shows Lock icon for readonly state', () => {
    renderFieldToggle({ value: 'readonly' });
    expect(screen.getByTestId('icon-lock')).toBeInTheDocument();
  });

  it('shows EyeOff icon for hidden state', () => {
    renderFieldToggle({ value: 'hidden' });
    expect(screen.getByTestId('icon-eye-off')).toBeInTheDocument();
  });

  it('includes fieldLabel and roleLabel from props in ARIA label', () => {
    renderFieldToggle({ fieldLabel: 'Invoice Amount', roleLabel: 'MEMBER', value: 'visible' });
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Set Invoice Amount visibility for MEMBER to read-only. Currently editable'
    );
  });
});

// ---------------------------------------------------------------------------
// Field mode — disabled
// ---------------------------------------------------------------------------

describe('VisibilityToggle — field mode disabled', () => {
  it('renders button with disabled attribute when disabled=true', () => {
    render(
      <VisibilityToggle
        mode="field"
        value="visible"
        onChange={vi.fn()}
        fieldLabel="Budget"
        roleLabel="ADMIN"
        disabled
      />
    );
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does NOT call onChange when button is clicked while disabled', () => {
    const onChange = vi.fn();
    render(
      <VisibilityToggle
        mode="field"
        value="visible"
        onChange={onChange}
        fieldLabel="Budget"
        roleLabel="ADMIN"
        disabled
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Column mode — 2-state cycling
// ---------------------------------------------------------------------------

describe('VisibilityToggle — column mode', () => {
  function renderColumnToggle(overrides: Partial<ColumnVisibilityToggleProps> = {}) {
    const onChange = vi.fn();
    const props: ColumnVisibilityToggleProps = {
      mode: 'column',
      value: 'visible',
      onChange,
      columnLabel: 'Created At',
      roleLabel: 'MEMBER',
      ...overrides,
    };
    render(<VisibilityToggle {...props} />);
    return { onChange };
  }

  it('renders a button element', () => {
    renderColumnToggle();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has correct ARIA label for visible state (stateLabel = "visible")', () => {
    renderColumnToggle({ value: 'visible' });
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Set Created At visibility for MEMBER to hidden. Currently visible'
    );
  });

  it('has correct ARIA label for hidden state (stateLabel = "hidden")', () => {
    renderColumnToggle({ value: 'hidden' });
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Set Created At visibility for MEMBER to visible. Currently hidden'
    );
  });

  it('cycles visible → hidden on click', () => {
    const { onChange } = renderColumnToggle({ value: 'visible' });
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('hidden');
  });

  it('cycles hidden → visible on click', () => {
    const { onChange } = renderColumnToggle({ value: 'hidden' });
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith('visible');
  });

  it('shows Eye icon for visible state', () => {
    renderColumnToggle({ value: 'visible' });
    expect(screen.getByTestId('icon-eye')).toBeInTheDocument();
  });

  it('shows EyeOff icon for hidden state', () => {
    renderColumnToggle({ value: 'hidden' });
    expect(screen.getByTestId('icon-eye-off')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Column mode — disabled
// ---------------------------------------------------------------------------

describe('VisibilityToggle — column mode disabled', () => {
  it('does NOT call onChange when clicked while disabled', () => {
    const onChange = vi.fn();
    render(
      <VisibilityToggle
        mode="column"
        value="visible"
        onChange={onChange}
        columnLabel="Created At"
        roleLabel="MEMBER"
        disabled
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Touch target size (NFR-010, Constitution Art. 1.3)
// ---------------------------------------------------------------------------

describe('VisibilityToggle — touch target size', () => {
  it('button has min-h and min-w classes for 44×44px touch target', () => {
    render(
      <VisibilityToggle
        mode="field"
        value="visible"
        onChange={vi.fn()}
        fieldLabel="Budget"
        roleLabel="ADMIN"
      />
    );
    const button = screen.getByRole('button');
    // The component applies min-h-[44px] min-w-[44px] classes
    expect(button.className).toContain('min-h-[44px]');
    expect(button.className).toContain('min-w-[44px]');
  });
});
