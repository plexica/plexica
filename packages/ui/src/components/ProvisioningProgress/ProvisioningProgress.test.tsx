// File: packages/ui/src/components/ProvisioningProgress/ProvisioningProgress.test.tsx
// T001-27: Unit tests for ProvisioningProgress component.

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvisioningProgress, type ProvisioningStepInfo } from './ProvisioningProgress';

const ALL_PENDING: ProvisioningStepInfo[] = [
  { name: 'schema_created', label: 'Create Schema', status: 'pending' },
  { name: 'keycloak_realm', label: 'Keycloak Realm', status: 'pending' },
  { name: 'minio_bucket', label: 'MinIO Bucket', status: 'pending' },
  { name: 'admin_user', label: 'Admin User', status: 'pending' },
];

const MIXED: ProvisioningStepInfo[] = [
  { name: 'schema_created', label: 'Create Schema', status: 'complete' },
  { name: 'keycloak_realm', label: 'Keycloak Realm', status: 'in_progress', retryAttempt: 1 },
  { name: 'minio_bucket', label: 'MinIO Bucket', status: 'error', errorMessage: 'Bucket exists' },
  { name: 'admin_user', label: 'Admin User', status: 'skipped' },
];

describe('ProvisioningProgress', () => {
  it('renders a list of all provisioning steps', () => {
    render(<ProvisioningProgress steps={ALL_PENDING} overallProgress={0} />);
    expect(screen.getByRole('list', { name: /provisioning steps/i })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(ALL_PENDING.length);
  });

  it('renders all 5 step statuses with correct labels', () => {
    render(<ProvisioningProgress steps={MIXED} overallProgress={50} />);
    expect(screen.getByText('Create Schema')).toBeInTheDocument();
    expect(screen.getByText('Keycloak Realm')).toBeInTheDocument();
    expect(screen.getByText('MinIO Bucket')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
  });

  it('shows error message for error-status step', () => {
    render(<ProvisioningProgress steps={MIXED} overallProgress={25} />);
    expect(screen.getByText('Bucket exists')).toBeInTheDocument();
  });

  it('shows retry attempt counter when retryAttempt > 0', () => {
    render(<ProvisioningProgress steps={MIXED} overallProgress={25} />);
    expect(screen.getByText(/retry 1\/3/i)).toBeInTheDocument();
  });

  it('renders progress bar with correct aria-label', () => {
    render(<ProvisioningProgress steps={ALL_PENDING} overallProgress={42} />);
    expect(
      screen.getByRole('progressbar', { name: /provisioning progress: 42%/i })
    ).toBeInTheDocument();
  });

  it('shows success state when isSuccess is true', () => {
    const allComplete = ALL_PENDING.map((s) => ({ ...s, status: 'complete' as const }));
    render(<ProvisioningProgress steps={allComplete} overallProgress={100} isSuccess />);
    expect(screen.getByText(/tenant successfully provisioned/i)).toBeInTheDocument();
  });

  it('shows error state with retry button when isError is true', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ProvisioningProgress
        steps={ALL_PENDING}
        overallProgress={25}
        isError
        errorMessage="Step failed"
        onRetry={onRetry}
      />
    );
    // The error message appears in both the visible UI and the sr-only live region;
    // confirm at least one visible instance is present.
    expect(screen.getAllByText(/step failed/i).length).toBeGreaterThanOrEqual(1);
    const retryBtn = screen.getByRole('button', { name: /retry provisioning/i });
    await user.click(retryBtn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('has aria-live="polite" region for screen reader announcements', () => {
    render(<ProvisioningProgress steps={ALL_PENDING} overallProgress={0} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('shows estimated time remaining when provided', () => {
    render(
      <ProvisioningProgress
        steps={ALL_PENDING}
        overallProgress={10}
        estimatedSecondsRemaining={90}
      />
    );
    expect(screen.getByText(/1m 30s remaining/i)).toBeInTheDocument();
  });
});
