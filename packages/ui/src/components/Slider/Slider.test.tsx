import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from './Slider';

// Radix Slider uses ResizeObserver internally, which is not available in jsdom
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('Slider', () => {
  it('renders without crashing', () => {
    render(<Slider />);
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Slider className="custom-slider" data-testid="slider-root" />);
    expect(screen.getByTestId('slider-root')).toHaveClass('custom-slider');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Slider ref={ref} />);
    expect(ref).toHaveBeenCalled();
    expect(ref.mock.calls[0][0]).toBeInstanceOf(HTMLSpanElement);
  });

  it('applies base classes', () => {
    render(<Slider data-testid="slider-root" />);
    const el = screen.getByTestId('slider-root');
    expect(el).toHaveClass(
      'relative',
      'flex',
      'w-full',
      'touch-none',
      'select-none',
      'items-center'
    );
  });

  it('renders with a default value', () => {
    render(<Slider defaultValue={[50]} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
  });

  it('renders with min and max', () => {
    render(<Slider defaultValue={[25]} min={0} max={100} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders with step', () => {
    render(<Slider defaultValue={[10]} step={5} />);
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('passes through HTML attributes', () => {
    render(<Slider data-testid="slider-root" id="vol-slider" defaultValue={[50]} />);
    const root = screen.getByTestId('slider-root');
    expect(root).toHaveAttribute('id', 'vol-slider');
  });
});
