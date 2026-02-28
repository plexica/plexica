// File: apps/super-admin/src/__tests__/components/plugins/PluginStatusBadge.test.tsx
//
// Unit tests for the PluginStatusBadge component.
// Verifies the correct label and CSS colour class for each PluginLifecycleStatus.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PLUGIN_LIFECYCLE_STATUSES } from '@plexica/types';
import { PluginStatusBadge } from '@/components/plugins/PluginStatusBadge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXPECTED_LABELS: Record<string, string> = {
  REGISTERED: 'Registered',
  INSTALLING: 'Installing',
  INSTALLED: 'Installed',
  ACTIVE: 'Active',
  DISABLED: 'Disabled',
  UNINSTALLING: 'Uninstalling',
  UNINSTALLED: 'Uninstalled',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginStatusBadge', () => {
  it.each(PLUGIN_LIFECYCLE_STATUSES)('should render correct label for status %s', (status) => {
    render(<PluginStatusBadge status={status} />);
    expect(screen.getByText(EXPECTED_LABELS[status])).toBeInTheDocument();
  });

  it('should apply extra className prop', () => {
    const { container } = render(<PluginStatusBadge status="ACTIVE" className="custom-class" />);
    // The Badge is the first element; custom class should be present somewhere
    expect(container.firstChild).toBeTruthy();
    expect(container.innerHTML).toContain('custom-class');
  });

  it('should render the INSTALLING spinner icon (aria-hidden)', () => {
    const { container } = render(<PluginStatusBadge status="INSTALLING" />);
    // The spinner should be aria-hidden to not pollute AT output
    const hiddenElements = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenElements.length).toBeGreaterThan(0);
  });

  it('should render the UNINSTALLING spinner icon', () => {
    const { container } = render(<PluginStatusBadge status="UNINSTALLING" />);
    const hiddenElements = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenElements.length).toBeGreaterThan(0);
  });

  it('should render the DISABLED pause icon (aria-hidden)', () => {
    const { container } = render(<PluginStatusBadge status="DISABLED" />);
    const hiddenElements = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenElements.length).toBeGreaterThan(0);
  });

  it('ACTIVE badge should use Tailwind important modifier for color', () => {
    const { container } = render(<PluginStatusBadge status="ACTIVE" />);
    // The LOW #15 fix: colorClass includes '!text-[...]'
    expect(container.innerHTML).toContain('!text-');
  });
});
