import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Alert, AlertTitle, AlertDescription } from './Alert';

describe('Alert', () => {
  it('renders without crashing', () => {
    render(<Alert>Alert content</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Alert>Something happened</Alert>);
    expect(screen.getByText('Something happened')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Alert className="custom-alert">Content</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('custom-alert');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Alert ref={ref}>Content</Alert>);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLDivElement);
  });

  it('renders default variant with Info icon', () => {
    render(<Alert>Default alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-background');
    // Default variant renders an svg icon (Info)
    const svg = alert.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders info variant', () => {
    render(<Alert variant="info">Info alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-blue-50');
  });

  it('renders success variant', () => {
    render(<Alert variant="success">Success alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-green-50');
  });

  it('renders warning variant', () => {
    render(<Alert variant="warning">Warning alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-yellow-50');
  });

  it('renders destructive variant', () => {
    render(<Alert variant="destructive">Error alert</Alert>);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('bg-red-50');
  });

  it('renders an icon for each variant', () => {
    const { rerender } = render(<Alert variant="info">Info</Alert>);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();

    rerender(<Alert variant="success">Success</Alert>);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();

    rerender(<Alert variant="warning">Warning</Alert>);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();

    rerender(<Alert variant="destructive">Error</Alert>);
    expect(screen.getByRole('alert').querySelector('svg')).toBeInTheDocument();
  });
});

describe('AlertTitle', () => {
  it('renders as an h5 element', () => {
    render(<AlertTitle>Title text</AlertTitle>);
    const title = screen.getByText('Title text');
    expect(title.tagName).toBe('H5');
  });

  it('applies custom className', () => {
    render(<AlertTitle className="custom-title">Title</AlertTitle>);
    expect(screen.getByText('Title')).toHaveClass('custom-title');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<AlertTitle ref={ref}>Title</AlertTitle>);
    expect(ref).toHaveBeenCalled();
  });
});

describe('AlertDescription', () => {
  it('renders as a div element', () => {
    render(<AlertDescription>Description text</AlertDescription>);
    const desc = screen.getByText('Description text');
    expect(desc.tagName).toBe('DIV');
  });

  it('applies custom className', () => {
    render(<AlertDescription className="custom-desc">Desc</AlertDescription>);
    expect(screen.getByText('Desc')).toHaveClass('custom-desc');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<AlertDescription ref={ref}>Desc</AlertDescription>);
    expect(ref).toHaveBeenCalled();
  });
});
