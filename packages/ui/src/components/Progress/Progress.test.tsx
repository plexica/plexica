import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from './Progress';

describe('Progress', () => {
  it('renders without crashing', () => {
    render(<Progress value={50} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Progress value={50} className="custom-progress" />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveClass('custom-progress');
  });

  it('forwards ref', () => {
    const ref = vi.fn();
    render(<Progress ref={ref} value={50} />);
    expect(ref).toHaveBeenCalled();
  });

  it('renders indicator with correct transform for 0%', () => {
    const { container } = render(<Progress value={0} />);
    // The indicator is the child div inside the root
    const indicator = container.querySelector('[role="progressbar"] > div');
    expect(indicator).toBeInTheDocument();
    expect(indicator!.getAttribute('style')).toContain('translateX(-100%)');
  });

  it('renders indicator with correct transform for 50%', () => {
    const { container } = render(<Progress value={50} />);
    const indicator = container.querySelector('[role="progressbar"] > div');
    expect(indicator!.getAttribute('style')).toContain('translateX(-50%)');
  });

  it('renders indicator with correct transform for 100%', () => {
    const { container } = render(<Progress value={100} />);
    const indicator = container.querySelector('[role="progressbar"] > div');
    expect(indicator!.getAttribute('style')).toContain('translateX(-0%)');
  });

  it('handles undefined value as 0', () => {
    const { container } = render(<Progress />);
    const indicator = container.querySelector('[role="progressbar"] > div');
    expect(indicator!.getAttribute('style')).toContain('translateX(-100%)');
  });

  it('applies default styling classes', () => {
    render(<Progress value={50} />);
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveClass('relative', 'h-4', 'w-full', 'overflow-hidden', 'rounded-full');
  });

  it('renders indicator element inside progressbar', () => {
    const { container } = render(<Progress value={25} />);
    const indicator = container.querySelector('[role="progressbar"] > div');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass('bg-primary');
    expect(indicator!.getAttribute('style')).toContain('translateX(-75%)');
  });
});
