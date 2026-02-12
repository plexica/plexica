import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders the title and description when open', () => {
    render(
      <ConfirmDialog
        title="Confirm Action"
        description="Are you sure?"
        open={true}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('does not render content when closed', () => {
    render(
      <ConfirmDialog
        title="Confirm Action"
        description="Are you sure?"
        open={false}
        onConfirm={() => {}}
      />
    );
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(<ConfirmDialog title="Test" description="Test desc" open={true} onConfirm={() => {}} />);
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Confirm');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Cancel');
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmDialog
        title="Test"
        description="Test desc"
        confirmLabel="Delete"
        cancelLabel="Keep"
        open={true}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Delete');
    expect(screen.getByTestId('confirm-dialog-cancel')).toHaveTextContent('Keep');
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="Test" description="Test desc" open={true} onConfirm={onConfirm} />
    );
    await user.click(screen.getByTestId('confirm-dialog-confirm'));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onCancel and onOpenChange when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        title="Test"
        description="Test desc"
        open={true}
        onConfirm={() => {}}
        onCancel={onCancel}
        onOpenChange={onOpenChange}
      />
    );
    await user.click(screen.getByTestId('confirm-dialog-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables confirm button when loading is true', () => {
    render(
      <ConfirmDialog
        title="Test"
        description="Test desc"
        open={true}
        onConfirm={() => {}}
        loading={true}
      />
    );
    expect(screen.getByTestId('confirm-dialog-confirm')).toBeDisabled();
  });

  it('renders confirm button with default variant by default', () => {
    render(<ConfirmDialog title="Test" description="Test desc" open={true} onConfirm={() => {}} />);
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm');
    // default variant should NOT have destructive classes
    expect(confirmBtn).not.toHaveClass('bg-destructive');
  });

  it('renders confirm button with destructive variant', () => {
    render(
      <ConfirmDialog
        title="Test"
        description="Test desc"
        variant="destructive"
        open={true}
        onConfirm={() => {}}
      />
    );
    const confirmBtn = screen.getByTestId('confirm-dialog-confirm');
    expect(confirmBtn).toHaveClass('bg-destructive');
  });

  it('renders a trigger element when provided', () => {
    render(
      <ConfirmDialog
        title="Test"
        description="Test desc"
        onConfirm={() => {}}
        trigger={<button>Open Dialog</button>}
      />
    );
    expect(screen.getByText('Open Dialog')).toBeInTheDocument();
  });

  it('applies custom className to dialog content', () => {
    render(
      <ConfirmDialog
        title="Test"
        description="Test desc"
        open={true}
        onConfirm={() => {}}
        className="my-custom-class"
      />
    );
    // DialogContent is the parent of title/description
    const title = screen.getByText('Test');
    const content = title.closest('[class*="my-custom-class"]');
    expect(content).toBeInTheDocument();
  });
});
