import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders without crashing', () => {
    render(<Skeleton data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('applies animate-pulse class by default', () => {
    render(<Skeleton data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('animate-pulse');
  });

  it('applies bg-muted class by default', () => {
    render(<Skeleton data-testid="skeleton" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('bg-muted');
  });

  it('renders line shape by default', () => {
    render(<Skeleton data-testid="skeleton" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveClass('h-4');
    expect(el).toHaveClass('rounded');
  });

  it('renders circle shape', () => {
    render(<Skeleton data-testid="skeleton" shape="circle" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('rounded-full');
  });

  it('renders rect shape', () => {
    render(<Skeleton data-testid="skeleton" shape="rect" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('rounded-md');
  });

  it('applies width as number (px)', () => {
    render(<Skeleton data-testid="skeleton" width={200} />);
    expect(screen.getByTestId('skeleton')).toHaveStyle({ width: '200px' });
  });

  it('applies width as string', () => {
    render(<Skeleton data-testid="skeleton" width="50%" />);
    expect(screen.getByTestId('skeleton')).toHaveStyle({ width: '50%' });
  });

  it('applies height as number (px)', () => {
    render(<Skeleton data-testid="skeleton" height={100} />);
    expect(screen.getByTestId('skeleton')).toHaveStyle({ height: '100px' });
  });

  it('applies height as string', () => {
    render(<Skeleton data-testid="skeleton" height="5rem" />);
    expect(screen.getByTestId('skeleton')).toHaveStyle({ height: '5rem' });
  });

  it('makes circle square when only width is given', () => {
    render(<Skeleton data-testid="skeleton" shape="circle" width={48} />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveStyle({ width: '48px', height: '48px' });
  });

  it('does not override explicit height on circle', () => {
    render(<Skeleton data-testid="skeleton" shape="circle" width={48} height={64} />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveStyle({ width: '48px', height: '64px' });
  });

  it('applies custom className', () => {
    render(<Skeleton data-testid="skeleton" className="my-custom-class" />);
    expect(screen.getByTestId('skeleton')).toHaveClass('my-custom-class');
  });

  it('merges custom style with size styles', () => {
    render(<Skeleton data-testid="skeleton" width={100} style={{ opacity: 0.5 }} />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveStyle({ width: '100px', opacity: '0.5' });
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Skeleton ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('passes through additional HTML attributes', () => {
    render(<Skeleton data-testid="skeleton" aria-label="Loading" role="status" />);
    const el = screen.getByTestId('skeleton');
    expect(el).toHaveAttribute('aria-label', 'Loading');
    expect(el).toHaveAttribute('role', 'status');
  });
});
