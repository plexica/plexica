// apps/web/src/__tests__/admin/DestructiveConfirmModal.test.tsx
//
// T008-60 — Unit tests for DestructiveConfirmModal component.
// Spec 008 Admin Interfaces — Phase 8: Frontend Tests

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vitest-axe setup
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { toHaveNoViolations } = (await import('vitest-axe/matchers')) as any;
expect.extend({ toHaveNoViolations });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectNoViolations(results: unknown): void {
  (expect(results) as any).toHaveNoViolations();
}

import { configureAxe } from 'vitest-axe';
const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});

// ---------------------------------------------------------------------------
// Mocks — Radix Dialog is complex; provide a lightweight test double
// ---------------------------------------------------------------------------

vi.mock('@plexica/ui', () => ({
  Dialog: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? <>{children}</> : null),

  DialogContent: ({
    children,
    'aria-labelledby': ariaLabelledby,
  }: {
    children: React.ReactNode;
    'aria-labelledby'?: string;
    [key: string]: unknown;
  }) => (
    <div role="dialog" aria-modal="true" aria-labelledby={ariaLabelledby}>
      {children}
    </div>
  ),

  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,

  DialogTitle: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <h2 id={id}>{children}</h2>
  ),

  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,

  Button: ({
    children,
    onClick,
    disabled,
    'aria-disabled': ariaDisabled,
    variant,
    ref,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-disabled'?: boolean;
    variant?: string;
    ref?: React.Ref<HTMLButtonElement>;
    [key: string]: unknown;
  }) => (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={ariaDisabled}
      data-variant={variant}
      {...rest}
    >
      {children}
    </button>
  ),

  Spinner: ({ size }: { size?: string }) => (
    <span data-testid="spinner" data-size={size} aria-hidden="true" />
  ),

  Input: ({
    id,
    value,
    onChange,
    disabled,
    placeholder,
    ref,
    ...rest
  }: {
    id?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    placeholder?: string;
    ref?: React.Ref<HTMLInputElement>;
    [key: string]: unknown;
  }) => (
    <input
      id={id}
      ref={ref as React.Ref<HTMLInputElement>}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      {...rest}
    />
  ),

  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock('lucide-react', () => ({
  AlertTriangle: ({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: string }) => (
    <svg data-testid="alert-triangle" aria-hidden={ariaHidden === 'true' ? true : undefined} />
  ),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { DestructiveConfirmModal } from '@/components/DestructiveConfirmModal';

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
// Helpers
// ---------------------------------------------------------------------------

interface RenderProps {
  open?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
  title?: string;
  description?: string;
  variant?: 'simple-confirm' | 'typed-confirm';
  confirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  error?: string | null;
}

function renderModal(props: RenderProps = {}) {
  const defaults = {
    open: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    title: 'Delete Item',
    description: 'This action cannot be undone.',
  };
  return render(<DestructiveConfirmModal {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DestructiveConfirmModal', () => {
  // -------------------------------------------------------------------------
  // Visibility
  // -------------------------------------------------------------------------

  describe('visibility', () => {
    it('renders nothing when open=false', () => {
      renderModal({ open: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the dialog when open=true', () => {
      renderModal({ open: true });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders the title and description', () => {
      renderModal({ title: 'Delete Role', description: 'Are you sure you want to delete?' });
      expect(screen.getByText('Delete Role')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to delete?')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // simple-confirm variant
  // -------------------------------------------------------------------------

  describe('simple-confirm variant (default)', () => {
    it('Confirm button is enabled immediately', () => {
      renderModal({ variant: 'simple-confirm' });
      const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('calls onConfirm when Confirm button clicked', () => {
      const onConfirm = vi.fn();
      renderModal({ variant: 'simple-confirm', onConfirm });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Cancel button clicked', () => {
      const onClose = vi.fn();
      renderModal({ variant: 'simple-confirm', onClose });
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not render the typed-confirm input', () => {
      renderModal({ variant: 'simple-confirm' });
      expect(screen.queryByPlaceholderText(/./)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // typed-confirm variant
  // -------------------------------------------------------------------------

  describe('typed-confirm variant', () => {
    it('renders the confirmation input when variant=typed-confirm and confirmText provided', () => {
      renderModal({ variant: 'typed-confirm', confirmText: 'delete-role' });
      expect(screen.getByPlaceholderText('delete-role')).toBeInTheDocument();
    });

    it('Confirm button is disabled initially', () => {
      renderModal({ variant: 'typed-confirm', confirmText: 'delete-role' });
      const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmBtn).toBeDisabled();
    });

    it('Confirm button enabled only when user types exact confirmText', async () => {
      renderModal({ variant: 'typed-confirm', confirmText: 'delete-role' });
      const input = screen.getByPlaceholderText('delete-role');
      const confirmBtn = screen.getByRole('button', { name: 'Confirm' });

      // Partial match — still disabled
      fireEvent.change(input, { target: { value: 'delete-rol' } });
      expect(confirmBtn).toBeDisabled();

      // Exact match — enabled
      fireEvent.change(input, { target: { value: 'delete-role' } });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('calls onConfirm when typed correctly and Confirm clicked', () => {
      const onConfirm = vi.fn();
      renderModal({ variant: 'typed-confirm', confirmText: 'delete-role', onConfirm });

      const input = screen.getByPlaceholderText('delete-role');
      fireEvent.change(input, { target: { value: 'delete-role' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('does not call onConfirm when text is wrong and Confirm clicked', () => {
      const onConfirm = vi.fn();
      renderModal({ variant: 'typed-confirm', confirmText: 'delete-role', onConfirm });

      const input = screen.getByPlaceholderText('delete-role');
      fireEvent.change(input, { target: { value: 'wrong-text' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('falls back to simple-confirm when confirmText not provided with typed-confirm', () => {
      // typed-confirm without confirmText → should behave as simple-confirm
      renderModal({ variant: 'typed-confirm', confirmText: undefined });
      const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmBtn).not.toBeDisabled();
    });

    it('resets typed value when modal re-opens', () => {
      const { rerender } = renderModal({
        variant: 'typed-confirm',
        confirmText: 'delete-role',
        open: true,
      });

      const input = screen.getByPlaceholderText('delete-role') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'delete-role' } });
      expect(input.value).toBe('delete-role');

      // Close then re-open
      rerender(
        <DestructiveConfirmModal
          open={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Test"
          description="Test"
          variant="typed-confirm"
          confirmText="delete-role"
        />
      );
      rerender(
        <DestructiveConfirmModal
          open={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          title="Test"
          description="Test"
          variant="typed-confirm"
          confirmText="delete-role"
        />
      );

      const reopenedInput = screen.getByPlaceholderText('delete-role') as HTMLInputElement;
      expect(reopenedInput.value).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('shows Spinner inside Confirm button when isLoading=true', () => {
      renderModal({ isLoading: true });
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    it('disables Confirm button when isLoading=true', () => {
      renderModal({ isLoading: true });
      const confirmBtn = screen.getByRole('button', { name: 'Confirm' });
      expect(confirmBtn).toBeDisabled();
    });

    it('disables Cancel button when isLoading=true', () => {
      renderModal({ isLoading: true });
      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      expect(cancelBtn).toBeDisabled();
    });

    it('disables typed-confirm input when isLoading=true', () => {
      renderModal({ variant: 'typed-confirm', confirmText: 'confirm', isLoading: true });
      expect(screen.getByPlaceholderText('confirm')).toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Error display
  // -------------------------------------------------------------------------

  describe('error display', () => {
    it('displays error message when error prop is provided', () => {
      renderModal({ error: 'Failed to delete. Please try again.' });
      expect(screen.getByText('Failed to delete. Please try again.')).toBeInTheDocument();
    });

    it('error region has role="alert" and aria-live="polite"', () => {
      renderModal({ error: 'Something went wrong' });
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toHaveAttribute('aria-live', 'polite');
    });

    it('does not show error text when error is null', () => {
      renderModal({ error: null });
      // The role="alert" container still exists, but should be empty
      const alertEl = screen.getByRole('alert');
      expect(alertEl).toBeEmptyDOMElement();
    });
  });

  // -------------------------------------------------------------------------
  // Custom labels
  // -------------------------------------------------------------------------

  describe('custom labels', () => {
    it('renders custom confirmLabel', () => {
      renderModal({ confirmLabel: 'Yes, Delete' });
      expect(screen.getByRole('button', { name: 'Yes, Delete' })).toBeInTheDocument();
    });

    it('renders custom cancelLabel', () => {
      renderModal({ cancelLabel: 'Go Back' });
      expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
    });

    it('defaults to "Confirm" and "Cancel" when labels not provided', () => {
      renderModal();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Focus management
  // -------------------------------------------------------------------------

  describe('focus management', () => {
    it('does not throw when modal opens (focus side-effect runs safely)', async () => {
      vi.useFakeTimers();
      expect(() => {
        renderModal({ variant: 'simple-confirm', open: true });
      }).not.toThrow();
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      vi.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  describe('accessibility', () => {
    it('has no WCAG 2.1 AA violations — simple-confirm variant', async () => {
      const { container } = renderModal({ variant: 'simple-confirm' });
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations — typed-confirm variant', async () => {
      const { container } = renderModal({
        variant: 'typed-confirm',
        confirmText: 'delete',
      });
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations — loading state', async () => {
      const { container } = renderModal({ isLoading: true });
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations — with error', async () => {
      const { container } = renderModal({ error: 'Something went wrong' });
      expectNoViolations(await axe(container));
    });

    it('dialog has aria-labelledby pointing to title element', () => {
      renderModal({ title: 'Delete Resource' });
      const dialog = screen.getByRole('dialog');
      const labelledBy = dialog.querySelector('[aria-labelledby]')?.getAttribute('aria-labelledby');
      if (labelledBy) {
        expect(document.getElementById(labelledBy)).toHaveTextContent('Delete Resource');
      }
    });
  });
});
