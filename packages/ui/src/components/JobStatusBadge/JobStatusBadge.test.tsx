// File: packages/ui/src/components/JobStatusBadge/JobStatusBadge.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobStatusBadge, JOB_STATUS_CONFIG } from './JobStatusBadge';
import type { JobStatusValue } from './JobStatusBadge';

describe('JobStatusBadge', () => {
  it('renders without crashing', () => {
    render(<JobStatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders label for PENDING status', () => {
    render(<JobStatusBadge status="PENDING" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders label for QUEUED status', () => {
    render(<JobStatusBadge status="QUEUED" />);
    expect(screen.getByText('Queued')).toBeInTheDocument();
  });

  it('renders label for RUNNING status', () => {
    render(<JobStatusBadge status="RUNNING" />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders label for COMPLETED status', () => {
    render(<JobStatusBadge status="COMPLETED" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders label for FAILED status', () => {
    render(<JobStatusBadge status="FAILED" />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('renders label for CANCELLED status', () => {
    render(<JobStatusBadge status="CANCELLED" />);
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('renders label for SCHEDULED status', () => {
    render(<JobStatusBadge status="SCHEDULED" />);
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
  });

  it('renders a custom label when provided', () => {
    render(<JobStatusBadge status="RUNNING" label="In Flight" />);
    expect(screen.getByText('In Flight')).toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<JobStatusBadge status="COMPLETED" className="my-custom-class" />);
    // The Badge wraps with the className; find any element containing the class
    const container = document.querySelector('.my-custom-class');
    expect(container).not.toBeNull();
  });

  it('passes through additional props', () => {
    render(<JobStatusBadge status="FAILED" data-testid="job-badge" />);
    expect(screen.getByTestId('job-badge')).toBeInTheDocument();
  });

  it('renders RUNNING with an icon that has animate-spin class', () => {
    const { container } = render(<JobStatusBadge status="RUNNING" />);
    const spinningIcon = container.querySelector('.animate-spin');
    expect(spinningIcon).not.toBeNull();
  });

  it('does not render animate-spin for non-RUNNING statuses', () => {
    const { container } = render(<JobStatusBadge status="COMPLETED" />);
    const spinningIcon = container.querySelector('.animate-spin');
    expect(spinningIcon).toBeNull();
  });
});

describe('JOB_STATUS_CONFIG', () => {
  const statuses: JobStatusValue[] = [
    'PENDING',
    'QUEUED',
    'RUNNING',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'SCHEDULED',
  ];

  it('has an entry for every status', () => {
    for (const status of statuses) {
      expect(JOB_STATUS_CONFIG[status]).toBeDefined();
    }
  });

  it('each entry has a variant, label, and icon', () => {
    for (const status of statuses) {
      const cfg = JOB_STATUS_CONFIG[status];
      expect(cfg.variant).toBeTruthy();
      expect(cfg.label).toBeTruthy();
      expect(cfg.icon).toBeTruthy();
    }
  });
});
