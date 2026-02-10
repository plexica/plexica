import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from './Separator';

describe('Separator', () => {
  it('renders without crashing', () => {
    render(<Separator data-testid="sep" />);
    expect(screen.getByTestId('sep')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Separator data-testid="sep" className="custom-sep" />);
    expect(screen.getByTestId('sep')).toHaveClass('custom-sep');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Separator ref={ref} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it('renders horizontal by default', () => {
    render(<Separator data-testid="sep" />);
    const sep = screen.getByTestId('sep');
    expect(sep).toHaveClass('h-[1px]', 'w-full');
  });

  it('renders vertical when orientation is vertical', () => {
    render(<Separator data-testid="sep" orientation="vertical" />);
    const sep = screen.getByTestId('sep');
    expect(sep).toHaveClass('h-full', 'w-[1px]');
  });

  it('applies base bg class', () => {
    render(<Separator data-testid="sep" />);
    expect(screen.getByTestId('sep')).toHaveClass('shrink-0', 'bg-border');
  });

  it('has role="separator" when not decorative', () => {
    render(<Separator decorative={false} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('passes through HTML attributes', () => {
    render(<Separator data-testid="my-sep" id="divider" />);
    const sep = screen.getByTestId('my-sep');
    expect(sep).toHaveAttribute('id', 'divider');
  });
});
