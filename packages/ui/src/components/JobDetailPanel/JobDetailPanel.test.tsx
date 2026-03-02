// File: packages/ui/src/components/JobDetailPanel/JobDetailPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JobDetailPanel } from './JobDetailPanel';
import type { JobDetails } from './JobDetailPanel';

const makeJob = (overrides: Partial<JobDetails> = {}): JobDetails => ({
  id: 'job-abc123def456',
  name: 'send-welcome-email',
  status: 'COMPLETED',
  retries: 0,
  maxRetries: 3,
  createdAt: '2025-06-15T10:00:00Z',
  ...overrides,
});

describe('JobDetailPanel', () => {
  it('renders the job name in the header', () => {
    render(<JobDetailPanel job={makeJob()} />);
    expect(screen.getByText('send-welcome-email')).toBeInTheDocument();
  });

  it('renders the short job ID in the header', () => {
    render(<JobDetailPanel job={makeJob({ id: 'job-abc123def456' })} />);
    // Shows first 8 chars: "job-abc1"
    expect(screen.getByText('#job-abc1')).toBeInTheDocument();
  });

  it('renders a JobStatusBadge with the correct status', () => {
    render(<JobDetailPanel job={makeJob({ status: 'FAILED' })} />);
    // JobStatusBadge renders "Failed" text
    // The first occurrence is in the header button
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
  });

  it('is collapsed by default (detail region not shown)', () => {
    render(<JobDetailPanel job={makeJob()} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('expands to show details when the header is clicked', () => {
    render(<JobDetailPanel job={makeJob()} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('shows all detail rows when expanded', () => {
    render(<JobDetailPanel job={makeJob({ cronExpression: '*/5 * * * *' })} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Job ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Cron')).toBeInTheDocument();
    expect(screen.getByText('Retries')).toBeInTheDocument();
  });

  it('collapses again when header is clicked a second time', () => {
    render(<JobDetailPanel job={makeJob()} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByRole('region')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('shows "Retry Now" button for FAILED jobs when onRetry is provided', () => {
    render(<JobDetailPanel job={makeJob({ status: 'FAILED' })} onRetry={vi.fn()} />);
    // The header button is the only button in the collapsed state — click it to expand
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: /retry now/i })).toBeInTheDocument();
  });

  it('calls onRetry with the job when "Retry Now" is clicked', () => {
    const onRetry = vi.fn();
    const job = makeJob({ status: 'FAILED' });
    render(<JobDetailPanel job={job} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button')); // expand
    fireEvent.click(screen.getByRole('button', { name: /retry now/i }));
    expect(onRetry).toHaveBeenCalledWith(job);
  });

  it('shows "Disable Schedule" button for SCHEDULED jobs when onDisableSchedule is provided', () => {
    render(<JobDetailPanel job={makeJob({ status: 'SCHEDULED' })} onDisableSchedule={vi.fn()} />);
    fireEvent.click(screen.getByRole('button')); // expand
    expect(screen.getByRole('button', { name: /disable schedule/i })).toBeInTheDocument();
  });

  it('calls onDisableSchedule with the job when "Disable Schedule" is clicked', () => {
    const onDisableSchedule = vi.fn();
    const job = makeJob({ status: 'SCHEDULED' });
    render(<JobDetailPanel job={job} onDisableSchedule={onDisableSchedule} />);
    fireEvent.click(screen.getByRole('button')); // expand
    fireEvent.click(screen.getByRole('button', { name: /disable schedule/i }));
    expect(onDisableSchedule).toHaveBeenCalledWith(job);
  });

  it('does not show "Retry Now" for COMPLETED jobs', () => {
    render(<JobDetailPanel job={makeJob({ status: 'COMPLETED' })} onRetry={vi.fn()} />);
    fireEvent.click(screen.getByRole('button')); // expand
    expect(screen.queryByRole('button', { name: /retry now/i })).not.toBeInTheDocument();
  });

  it('shows error message in the detail view when job has error', () => {
    render(<JobDetailPanel job={makeJob({ status: 'FAILED', error: 'Timeout reached' })} />);
    fireEvent.click(screen.getByRole('button')); // expand
    expect(screen.getByText('Timeout reached')).toBeInTheDocument();
  });

  it('shows payload JSON when job has payload', () => {
    const payload = { userId: '123', type: 'welcome' };
    render(<JobDetailPanel job={makeJob({ payload })} />);
    fireEvent.click(screen.getByRole('button')); // expand
    expect(screen.getByText(/"userId"/)).toBeInTheDocument();
  });

  it('supports controlled expanded state', () => {
    const onExpandedChange = vi.fn();
    const { rerender } = render(
      <JobDetailPanel job={makeJob()} expanded={false} onExpandedChange={onExpandedChange} />
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    rerender(
      <JobDetailPanel job={makeJob()} expanded={true} onExpandedChange={onExpandedChange} />
    );
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('calls onExpandedChange when header is clicked in controlled mode', () => {
    const onExpandedChange = vi.fn();
    render(<JobDetailPanel job={makeJob()} expanded={false} onExpandedChange={onExpandedChange} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it('applies custom className to root element', () => {
    const { container } = render(<JobDetailPanel job={makeJob()} className="custom-panel" />);
    expect(container.firstElementChild).toHaveClass('custom-panel');
  });
});
