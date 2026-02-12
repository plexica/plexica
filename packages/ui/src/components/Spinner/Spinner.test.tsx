import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner, PageSpinner } from './Spinner';

describe('Spinner', () => {
  it('renders without crashing', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-label="Loading"', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Spinner className="my-spinner" />);
    expect(screen.getByRole('status')).toHaveClass('my-spinner');
  });

  it('applies inline-block base class', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveClass('inline-block');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Spinner ref={ref} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });

  it('renders sm size', () => {
    render(<Spinner size="sm" />);
    const inner = screen.getByRole('status').firstElementChild;
    expect(inner).toHaveClass('h-4', 'w-4', 'border-2');
  });

  it('renders md size by default', () => {
    render(<Spinner />);
    const inner = screen.getByRole('status').firstElementChild;
    expect(inner).toHaveClass('h-8', 'w-8', 'border-2');
  });

  it('renders lg size', () => {
    render(<Spinner size="lg" />);
    const inner = screen.getByRole('status').firstElementChild;
    expect(inner).toHaveClass('h-12', 'w-12', 'border-[3px]');
  });

  it('renders the spinning element with animation class', () => {
    render(<Spinner />);
    const inner = screen.getByRole('status').firstElementChild;
    expect(inner).toHaveClass('animate-spin', 'rounded-full');
  });

  it('passes through HTML attributes', () => {
    render(<Spinner data-testid="spinner" id="main-spinner" />);
    const el = screen.getByTestId('spinner');
    expect(el).toHaveAttribute('id', 'main-spinner');
  });
});

describe('PageSpinner', () => {
  it('renders without crashing', () => {
    render(<PageSpinner data-testid="page-spinner" />);
    expect(screen.getByTestId('page-spinner')).toBeInTheDocument();
  });

  it('renders a full-screen centered container', () => {
    render(<PageSpinner data-testid="page-spinner" />);
    const container = screen.getByTestId('page-spinner');
    expect(container).toHaveClass('flex', 'h-screen', 'w-full', 'items-center', 'justify-center');
  });

  it('renders a "Loading..." text', () => {
    render(<PageSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('contains a Spinner with lg size', () => {
    render(<PageSpinner />);
    // The inner Spinner has role="status"
    const spinner = screen.getByRole('status');
    expect(spinner).toBeInTheDocument();
    const spinnerInner = spinner.firstElementChild;
    expect(spinnerInner).toHaveClass('h-12', 'w-12');
  });

  it('applies custom className', () => {
    render(<PageSpinner data-testid="page-spinner" className="extra" />);
    expect(screen.getByTestId('page-spinner')).toHaveClass('extra');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<PageSpinner ref={ref} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });
});
