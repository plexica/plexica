// File: apps/web/src/__tests__/layout-engine/RequiredFieldWarningDialog.test.tsx
//
// T014-28 — Unit tests for RequiredFieldWarningDialog component.
// Spec 014 Frontend Layout Engine — FR-011, US-007.
//
// Tests:
//   Dialog renders when open=true
//   Dialog is not in DOM when open=false
//   Fields list is rendered with label and role text
//   Cancel button calls onCancel
//   Proceed button calls onProceed
//   Proceed button shows spinner and is disabled when saving=true
//   Cancel button is disabled when saving=true
//   Dialog has correct ARIA attributes

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock @plexica/ui — Dialog renders children when open, nothing when closed.
// Provides role="dialog" and aria-modal="true" on the root element, mirroring
// the real @plexica/ui Dialog's ARIA semantics so tests can assert on them.
// NOTE: The root div intentionally does NOT forward click events to onOpenChange
// because the Cancel/Proceed buttons inside the dialog would bubble their clicks
// up to the root, causing onCancel to be invoked twice (once from the button's
// own onClick and once from onOpenChange). Real Dialog implementations use
// a backdrop overlay for this, not the content container.
vi.mock('@plexica/ui', () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="dialog-root" role="dialog" aria-modal="true">
        {children}
      </div>
    );
  },
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
    ref: _ref,
    variant: _variant,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    ref?: React.Ref<HTMLButtonElement>;
    variant?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  AlertTriangle: () => <svg data-testid="icon-alert-triangle" />,
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { RequiredFieldWarningDialog } from '@/components/layout-engine/RequiredFieldWarningDialog';
import type { RequiredFieldWarningItem } from '@/components/layout-engine/RequiredFieldWarningDialog';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const FIELDS: RequiredFieldWarningItem[] = [
  { fieldId: 'email', label: 'Email', role: 'VIEWER' },
  { fieldId: 'name', label: 'Name', role: 'MEMBER' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequiredFieldWarningDialog — visibility', () => {
  it('renders dialog content when open=true', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
      />
    );
    expect(screen.getByTestId('required-field-warning-dialog')).toBeInTheDocument();
  });

  it('does not render dialog content when open=false', () => {
    render(
      <RequiredFieldWarningDialog
        open={false}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
      />
    );
    expect(screen.queryByTestId('required-field-warning-dialog')).not.toBeInTheDocument();
  });
});

describe('RequiredFieldWarningDialog — content', () => {
  it('shows the dialog title "Required Field Warning"', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
      />
    );
    expect(screen.getByText('Required Field Warning')).toBeInTheDocument();
  });

  it('renders each field label in the list', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
      />
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders "hidden for <role>" annotation for each field', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
      />
    );
    expect(screen.getByText('(hidden for VIEWER)')).toBeInTheDocument();
    expect(screen.getByText('(hidden for MEMBER)')).toBeInTheDocument();
  });

  it('has the warning icon', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
      />
    );
    expect(screen.getByTestId('icon-alert-triangle')).toBeInTheDocument();
  });

  it('has ARIA role="dialog" and aria-modal="true"', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
      />
    );
    // role="dialog" and aria-modal come from the outer Dialog wrapper (not the inner content div).
    // The inner div carries aria-labelledby for the title association.
    const dialogRoot = screen.getByRole('dialog');
    expect(dialogRoot).toHaveAttribute('aria-modal', 'true');
    const content = screen.getByTestId('required-field-warning-dialog');
    expect(content).toHaveAttribute('aria-labelledby', 'required-field-warning-title');
  });
});

describe('RequiredFieldWarningDialog — actions', () => {
  it('calls onCancel when Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={onCancel}
        onProceed={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel and keep fields visible/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onProceed when "Proceed Anyway" button is clicked', () => {
    const onProceed = vi.fn();
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={onProceed}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /proceed with hiding required fields/i }));
    expect(onProceed).toHaveBeenCalledOnce();
  });
});

describe('RequiredFieldWarningDialog — saving state', () => {
  it('shows "Saving…" text and disables Proceed button when saving=true', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
        saving={true}
      />
    );
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /proceed with hiding required fields/i })
    ).toBeDisabled();
  });

  it('disables Cancel button when saving=true', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
        saving={true}
      />
    );
    expect(screen.getByRole('button', { name: /cancel and keep fields visible/i })).toBeDisabled();
  });

  it('shows "Proceed Anyway" text (not spinner) when saving=false', () => {
    render(
      <RequiredFieldWarningDialog
        open={true}
        fields={FIELDS}
        onCancel={vi.fn()}
        onProceed={vi.fn()}
        saving={false}
      />
    );
    expect(screen.getByText('Proceed Anyway')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /proceed with hiding required fields/i })
    ).not.toBeDisabled();
  });
});
