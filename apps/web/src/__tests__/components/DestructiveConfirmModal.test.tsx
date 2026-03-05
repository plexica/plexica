// apps/web/src/__tests__/components/DestructiveConfirmModal.test.tsx
//
// T008-58: Unit tests for DestructiveConfirmModal component.
//
// Covers:
//  1. renders with title and description
//  2. simple-confirm: Confirm button enabled immediately
//  3. simple-confirm: calls onConfirm when Confirm clicked
//  4. typed-confirm: Confirm button disabled until correct text typed
//  5. typed-confirm: Confirm button enabled after correct text typed
//  6. typed-confirm: Confirm button disabled again after wrong text
//  7. calls onClose when Cancel clicked
//  8. shows error message when error prop provided
//  9. both buttons disabled when isLoading=true

import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';

// ---------------------------------------------------------------------------
// Mock @radix-ui/react-dialog so it renders its children synchronously
// in jsdom without portal/animation issues.
// ---------------------------------------------------------------------------

vi.mock('@radix-ui/react-dialog', async () => {
  const actual =
    await vi.importActual<typeof import('@radix-ui/react-dialog')>('@radix-ui/react-dialog');
  return {
    ...actual,
    // Override Portal to render inline (no document.body portal)
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ---------------------------------------------------------------------------
// Default props factory
// ---------------------------------------------------------------------------

function defaultProps(overrides?: Partial<React.ComponentProps<typeof DestructiveConfirmModal>>) {
  return {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Delete Workspace',
    description: 'This action cannot be undone.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: find Confirm button by label (default "Confirm")
// ---------------------------------------------------------------------------

function getConfirmButton(label = 'Confirm') {
  return screen.getByRole('button', { name: new RegExp(label, 'i') });
}

function getCancelButton(label = 'Cancel') {
  return screen.getByRole('button', { name: new RegExp(label, 'i') });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DestructiveConfirmModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Renders title and description ────────────────────────────────────────

  it('renders title and description', () => {
    render(<DestructiveConfirmModal {...defaultProps()} />);
    expect(screen.getByText('Delete Workspace')).toBeInTheDocument();
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
  });

  it('renders with custom confirmLabel and cancelLabel', () => {
    render(
      <DestructiveConfirmModal
        {...defaultProps({ confirmLabel: 'Destroy', cancelLabel: 'Abort' })}
      />
    );
    expect(screen.getByRole('button', { name: /destroy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abort/i })).toBeInTheDocument();
  });

  // ── 2. simple-confirm: Confirm enabled immediately ──────────────────────────

  it('simple-confirm: Confirm button is enabled immediately', () => {
    render(<DestructiveConfirmModal {...defaultProps({ variant: 'simple-confirm' })} />);
    const confirmBtn = getConfirmButton();
    expect(confirmBtn).not.toBeDisabled();
    expect(confirmBtn).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('simple-confirm: no text input field is shown', () => {
    render(<DestructiveConfirmModal {...defaultProps({ variant: 'simple-confirm' })} />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // ── 3. simple-confirm: calls onConfirm when clicked ────────────────────────

  it('simple-confirm: calls onConfirm when Confirm button clicked', () => {
    const onConfirm = vi.fn();
    render(<DestructiveConfirmModal {...defaultProps({ variant: 'simple-confirm', onConfirm })} />);
    fireEvent.click(getConfirmButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // ── 4. typed-confirm: disabled until correct text typed ────────────────────

  it('typed-confirm: Confirm button is disabled initially', () => {
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'DELETE',
        })}
      />
    );
    const confirmBtn = getConfirmButton();
    expect(confirmBtn).toBeDisabled();
  });

  it('typed-confirm: shows the input field', () => {
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'DELETE',
        })}
      />
    );
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('typed-confirm: shows the required text in a label', () => {
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'DELETE',
        })}
      />
    );
    // The label contains the confirmText in a <code> element
    expect(screen.getByText('DELETE')).toBeInTheDocument();
  });

  // ── 5. typed-confirm: enabled after correct text ───────────────────────────

  it('typed-confirm: Confirm button enabled after typing the correct text', async () => {
    const user = userEvent.setup();
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'DELETE',
        })}
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'DELETE');

    const confirmBtn = getConfirmButton();
    expect(confirmBtn).not.toBeDisabled();
  });

  it('typed-confirm: calls onConfirm after typing correct text and clicking', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'DELETE',
          onConfirm,
        })}
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'DELETE');
    fireEvent.click(getConfirmButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  // ── 6. typed-confirm: disabled again after wrong text ─────────────────────

  it('typed-confirm: Confirm disabled after typing wrong text', async () => {
    const user = userEvent.setup();
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'DELETE',
        })}
      />
    );

    const input = screen.getByRole('textbox');
    // Type correct text first
    await user.type(input, 'DELETE');
    expect(getConfirmButton()).not.toBeDisabled();

    // Clear and type wrong text
    await user.clear(input);
    await user.type(input, 'delete'); // case-sensitive mismatch
    expect(getConfirmButton()).toBeDisabled();
  });

  it('typed-confirm: confirmation is case-sensitive', async () => {
    const user = userEvent.setup();
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'MAINTENANCE',
        })}
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'maintenance');
    expect(getConfirmButton()).toBeDisabled();

    await user.clear(input);
    await user.type(input, 'MAINTENANCE');
    expect(getConfirmButton()).not.toBeDisabled();
  });

  // ── 7. calls onClose when Cancel clicked ──────────────────────────────────

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<DestructiveConfirmModal {...defaultProps({ onClose })} />);
    fireEvent.click(getCancelButton());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── 8. shows error message ────────────────────────────────────────────────

  it('shows error message when error prop is provided', () => {
    render(
      <DestructiveConfirmModal
        {...defaultProps({ error: 'Something went wrong. Please try again.' })}
      />
    );
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('does not show error region text when error is null', () => {
    render(<DestructiveConfirmModal {...defaultProps({ error: null })} />);
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('error region has aria-live="polite"', () => {
    render(<DestructiveConfirmModal {...defaultProps()} />);
    const liveRegion = document.getElementById('dcm-error');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  // ── 9. isLoading disables both buttons ────────────────────────────────────

  it('disables both buttons when isLoading=true', () => {
    render(<DestructiveConfirmModal {...defaultProps({ isLoading: true })} />);
    expect(getConfirmButton()).toBeDisabled();
    expect(getCancelButton()).toBeDisabled();
  });

  it('shows spinner inside Confirm button when isLoading=true', () => {
    render(<DestructiveConfirmModal {...defaultProps({ isLoading: true })} />);
    // The Spinner component renders with role="status" but is aria-hidden="true"
    // on the inner wrapper when embedded in a button. Query via attribute.
    const spinner = document.querySelector('[role="status"][aria-label="Loading"]');
    expect(spinner).toBeInTheDocument();
  });

  it('typed-confirm: input disabled when isLoading=true', () => {
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: 'DELETE',
          isLoading: true,
        })}
      />
    );
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  // ── Falls back to simple-confirm when confirmText missing ─────────────────

  it('falls back to simple-confirm when typed-confirm has no confirmText', () => {
    render(
      <DestructiveConfirmModal
        {...defaultProps({
          variant: 'typed-confirm',
          confirmText: undefined,
        })}
      />
    );
    // No text input should appear (fell back to simple)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // Confirm should be enabled
    expect(getConfirmButton()).not.toBeDisabled();
  });

  // ── Not rendered when closed ───────────────────────────────────────────────

  it('renders nothing when open=false', () => {
    const { container } = render(<DestructiveConfirmModal {...defaultProps({ open: false })} />);
    // Radix Dialog does not render children when closed
    expect(container.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });
});
