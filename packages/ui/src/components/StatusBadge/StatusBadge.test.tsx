import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { StatusBadge, STATUS_CONFIG, type StatusType } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders without crashing', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders the default label for each status', () => {
    const statuses: StatusType[] = [
      'active',
      'inactive',
      'suspended',
      'draft',
      'published',
      'deprecated',
      'pending',
      'archived',
    ];
    for (const status of statuses) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(STATUS_CONFIG[status].label)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders a custom label when provided', () => {
    render(<StatusBadge status="active" label="Enabled" />);
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('applies the correct badge variant for active status', () => {
    render(<StatusBadge status="active" data-testid="badge" />);
    // success variant uses bg-green-500
    expect(screen.getByTestId('badge')).toHaveClass('bg-green-500');
  });

  it('applies the correct badge variant for suspended status', () => {
    render(<StatusBadge status="suspended" data-testid="badge" />);
    // danger variant uses bg-red-500
    expect(screen.getByTestId('badge')).toHaveClass('bg-red-500');
  });

  it('applies the correct badge variant for draft status', () => {
    render(<StatusBadge status="draft" data-testid="badge" />);
    // outline variant uses border-border
    expect(screen.getByTestId('badge')).toHaveClass('border-border');
  });

  it('applies the correct badge variant for deprecated status', () => {
    render(<StatusBadge status="deprecated" data-testid="badge" />);
    // warning variant uses bg-orange-500
    expect(screen.getByTestId('badge')).toHaveClass('bg-orange-500');
  });

  it('applies custom className', () => {
    render(<StatusBadge status="active" className="my-class" data-testid="badge" />);
    expect(screen.getByTestId('badge')).toHaveClass('my-class');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLDivElement>();
    render(<StatusBadge status="active" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('passes through additional HTML attributes', () => {
    render(<StatusBadge status="active" data-testid="badge" aria-label="Status" />);
    expect(screen.getByTestId('badge')).toHaveAttribute('aria-label', 'Status');
  });
});
