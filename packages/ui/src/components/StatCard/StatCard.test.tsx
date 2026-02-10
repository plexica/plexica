import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders without crashing', () => {
    render(<StatCard label="Users" value="100" />);
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('renders a numeric value', () => {
    render(<StatCard label="Count" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the label as muted text', () => {
    render(<StatCard label="Total" value="5" />);
    const label = screen.getByText('Total');
    expect(label).toHaveClass('text-muted-foreground');
  });

  it('renders the value as bold text', () => {
    render(<StatCard label="Total" value="5" />);
    const value = screen.getByText('5');
    expect(value).toHaveClass('font-bold');
  });

  it('renders positive trend with up icon', () => {
    render(<StatCard label="Revenue" value="$100" trend={12.5} />);
    const trendEl = screen.getByTestId('stat-card-trend');
    expect(trendEl).toHaveClass('text-green-600');
    expect(trendEl).toHaveTextContent('+12.5%');
  });

  it('renders negative trend with down icon', () => {
    render(<StatCard label="Churn" value="2%" trend={-3.2} />);
    const trendEl = screen.getByTestId('stat-card-trend');
    expect(trendEl).toHaveClass('text-red-600');
    expect(trendEl).toHaveTextContent('-3.2%');
  });

  it('renders zero trend as positive', () => {
    render(<StatCard label="Uptime" value="100%" trend={0} />);
    const trendEl = screen.getByTestId('stat-card-trend');
    expect(trendEl).toHaveClass('text-green-600');
    expect(trendEl).toHaveTextContent('+0%');
  });

  it('does not render trend when not provided', () => {
    render(<StatCard label="Users" value="100" />);
    expect(screen.queryByTestId('stat-card-trend')).not.toBeInTheDocument();
  });

  it('renders an icon when provided', () => {
    render(<StatCard label="Users" value="100" icon={<span data-testid="custom-icon">IC</span>} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.getByTestId('stat-card-icon')).toBeInTheDocument();
  });

  it('does not render icon container when no icon provided', () => {
    render(<StatCard label="Users" value="100" />);
    expect(screen.queryByTestId('stat-card-icon')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<StatCard label="Users" value="100" className="my-class" data-testid="card" />);
    expect(screen.getByTestId('card')).toHaveClass('my-class');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<StatCard label="Users" value="100" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('passes through additional HTML attributes', () => {
    render(<StatCard label="Users" value="100" data-testid="card" aria-label="Metrics" />);
    expect(screen.getByTestId('card')).toHaveAttribute('aria-label', 'Metrics');
  });
});
