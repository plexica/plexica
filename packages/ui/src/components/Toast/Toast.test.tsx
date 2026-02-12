import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
} from './Toast';

// Helper: Radix Toast requires Provider + Viewport to render properly
const renderToast = (
  toastProps: React.ComponentProps<typeof Toast> = {},
  children?: React.ReactNode
) => {
  return render(
    <ToastProvider>
      <Toast {...toastProps}>{children}</Toast>
      <ToastViewport />
    </ToastProvider>
  );
};

describe('Toast', () => {
  it('renders without crashing', () => {
    renderToast({}, <ToastTitle>Hello</ToastTitle>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders with title and description', () => {
    renderToast(
      {},
      <>
        <ToastTitle>Title</ToastTitle>
        <ToastDescription>Description text</ToastDescription>
      </>
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description text')).toBeInTheDocument();
  });

  it('applies default variant classes', () => {
    const { container } = renderToast({}, <ToastTitle>Default</ToastTitle>);
    const toastEl = container.querySelector('[data-state]');
    expect(toastEl).toHaveClass('bg-background', 'text-foreground');
  });

  it('applies success variant classes', () => {
    const { container } = renderToast({ variant: 'success' }, <ToastTitle>Success</ToastTitle>);
    const toastEl = container.querySelector('[data-state]');
    expect(toastEl).toHaveClass('border-green-500', 'bg-green-50', 'text-green-900');
  });

  it('applies error variant classes', () => {
    const { container } = renderToast({ variant: 'error' }, <ToastTitle>Error</ToastTitle>);
    const toastEl = container.querySelector('[data-state]');
    expect(toastEl).toHaveClass('border-red-500', 'bg-red-50', 'text-red-900');
  });

  it('applies warning variant classes', () => {
    const { container } = renderToast({ variant: 'warning' }, <ToastTitle>Warning</ToastTitle>);
    const toastEl = container.querySelector('[data-state]');
    expect(toastEl).toHaveClass('border-orange-500', 'bg-orange-50', 'text-orange-900');
  });

  it('applies info variant classes', () => {
    const { container } = renderToast({ variant: 'info' }, <ToastTitle>Info</ToastTitle>);
    const toastEl = container.querySelector('[data-state]');
    expect(toastEl).toHaveClass('border-blue-500', 'bg-blue-50', 'text-blue-900');
  });

  it('applies custom className', () => {
    const { container } = renderToast({ className: 'my-toast' }, <ToastTitle>Custom</ToastTitle>);
    const toastEl = container.querySelector('[data-state]');
    expect(toastEl).toHaveClass('my-toast');
  });

  it('renders ToastClose button', () => {
    renderToast(
      {},
      <>
        <ToastTitle>Closeable</ToastTitle>
        <ToastClose />
      </>
    );
    // ToastClose renders a button with toast-close attribute
    const closeBtn = document.querySelector('[toast-close]');
    expect(closeBtn).toBeInTheDocument();
  });

  it('renders ToastAction', () => {
    renderToast(
      {},
      <>
        <ToastTitle>With Action</ToastTitle>
        <ToastAction altText="Undo the action">Undo</ToastAction>
      </>
    );
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });
});

describe('ToastViewport', () => {
  it('renders with base classes', () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="viewport" />
      </ToastProvider>
    );
    const viewport = screen.getByTestId('viewport');
    expect(viewport).toHaveClass('fixed', 'top-0', 'right-0', 'z-[100]');
  });

  it('applies custom className', () => {
    render(
      <ToastProvider>
        <ToastViewport data-testid="viewport" className="custom-viewport" />
      </ToastProvider>
    );
    expect(screen.getByTestId('viewport')).toHaveClass('custom-viewport');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(
      <ToastProvider>
        <ToastViewport ref={ref} />
      </ToastProvider>
    );
    expect(ref).toHaveBeenCalled();
  });
});

describe('ToastTitle', () => {
  it('applies base classes', () => {
    renderToast({}, <ToastTitle data-testid="title">My Title</ToastTitle>);
    const title = screen.getByTestId('title');
    expect(title).toHaveClass('text-sm', 'font-semibold');
  });
});

describe('ToastDescription', () => {
  it('applies base classes', () => {
    renderToast(
      {},
      <>
        <ToastTitle>T</ToastTitle>
        <ToastDescription data-testid="desc">Details</ToastDescription>
      </>
    );
    const desc = screen.getByTestId('desc');
    expect(desc).toHaveClass('text-sm', 'opacity-90');
  });
});
