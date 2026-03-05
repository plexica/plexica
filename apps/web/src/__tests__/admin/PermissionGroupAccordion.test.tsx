// apps/web/src/__tests__/admin/PermissionGroupAccordion.test.tsx
//
// T008-60 — Unit tests for PermissionGroupAccordion component.
// Spec 008 Admin Interfaces — Phase 8: Frontend Tests

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vitest-axe setup
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { toHaveNoViolations } = (await import('vitest-axe/matchers')) as any;
expect.extend({ toHaveNoViolations });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function expectNoViolations(results: unknown): void {
  (expect(results) as any).toHaveNoViolations();
}

import { configureAxe } from 'vitest-axe';
const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@plexica/ui', () => ({
  Checkbox: ({
    id,
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
    ...rest
  }: {
    id?: string;
    checked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    'aria-label'?: string;
    [key: string]: unknown;
  }) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...rest}
    />
  ),
  Badge: ({ children, variant }: { children: React.ReactNode; variant?: string }) => (
    <span data-testid="badge" data-variant={variant}>
      {children}
    </span>
  ),
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <svg data-testid="chevron-down" aria-hidden="true" />,
  ChevronRight: () => <svg data-testid="chevron-right" aria-hidden="true" />,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { PermissionGroupAccordion } from '@/components/PermissionGroupAccordion';
import type { PermissionGroup } from '@/api/admin';

// ---------------------------------------------------------------------------
// Silence console noise
// ---------------------------------------------------------------------------

const originalError = console.error;
const originalWarn = console.warn;
beforeAll(() => {
  console.error = vi.fn();
  console.warn = vi.fn();
});
afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGroup(source: string, permCount = 3): PermissionGroup {
  return {
    source,
    displayName: `${source} Permissions`,
    permissions: Array.from({ length: permCount }, (_, i) => ({
      id: `${source}-perm-${i}`,
      name: `${source}:action-${i}`,
      resource: source,
      action: `action-${i}`,
      description: `Description for action-${i}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PermissionGroupAccordion', () => {
  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  describe('empty state', () => {
    it('renders "No permissions available." when groups is empty', () => {
      render(<PermissionGroupAccordion groups={[]} selected={new Set()} onChange={vi.fn()} />);
      expect(screen.getByText('No permissions available.')).toBeInTheDocument();
    });

    it('does not render accordion list when groups is empty', () => {
      render(<PermissionGroupAccordion groups={[]} selected={new Set()} onChange={vi.fn()} />);
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Group render
  // -------------------------------------------------------------------------

  describe('group rendering', () => {
    it('renders a list with aria-label "Permission groups" when groups exist', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);
      expect(screen.getByRole('list', { name: 'Permission groups' })).toBeInTheDocument();
    });

    it('renders each group header with displayName', () => {
      const groups = [makeGroup('users'), makeGroup('plugins')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);
      expect(screen.getByText('users Permissions')).toBeInTheDocument();
      expect(screen.getByText('plugins Permissions')).toBeInTheDocument();
    });

    it('renders badge with "0 / N" count when nothing selected', () => {
      const groups = [makeGroup('users', 3)];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);
      expect(screen.getByTestId('badge')).toHaveTextContent('0 / 3');
    });

    it('renders badge showing selected count', () => {
      const groups = [makeGroup('users', 3)];
      const selected = new Set(['users-perm-0', 'users-perm-1']);
      render(<PermissionGroupAccordion groups={groups} selected={selected} onChange={vi.fn()} />);
      expect(screen.getByTestId('badge')).toHaveTextContent('2 / 3');
    });
  });

  // -------------------------------------------------------------------------
  // Accordion expand / collapse
  // -------------------------------------------------------------------------

  describe('expand/collapse', () => {
    it('does not show permission list when collapsed (default)', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);
      // Permission items hidden by default
      expect(screen.queryByText('users:action-0')).not.toBeInTheDocument();
    });

    it('shows permission list after clicking group header', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      const header = screen.getByRole('button', { name: /users permissions/i });
      fireEvent.click(header);

      expect(screen.getByText('users:action-0')).toBeInTheDocument();
      expect(screen.getByText('users:action-1')).toBeInTheDocument();
    });

    it('hides permission list after clicking header twice (toggle)', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      const header = screen.getByRole('button', { name: /users permissions/i });
      fireEvent.click(header);
      expect(screen.getByText('users:action-0')).toBeInTheDocument();

      fireEvent.click(header);
      expect(screen.queryByText('users:action-0')).not.toBeInTheDocument();
    });

    it('sets aria-expanded=true on open header', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      const header = screen.getByRole('button', { name: /users permissions/i });
      expect(header).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('opens/closes via Enter key', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      const header = screen.getByRole('button', { name: /users permissions/i });
      fireEvent.keyDown(header, { key: 'Enter' });
      expect(screen.getByText('users:action-0')).toBeInTheDocument();

      fireEvent.keyDown(header, { key: 'Enter' });
      expect(screen.queryByText('users:action-0')).not.toBeInTheDocument();
    });

    it('opens/closes via Space key', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      const header = screen.getByRole('button', { name: /users permissions/i });
      fireEvent.keyDown(header, { key: ' ' });
      expect(screen.getByText('users:action-0')).toBeInTheDocument();
    });

    it('shows chevron-down when open, chevron-right when closed', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      expect(screen.getByTestId('chevron-right')).toBeInTheDocument();
      expect(screen.queryByTestId('chevron-down')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));

      expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
      expect(screen.queryByTestId('chevron-right')).not.toBeInTheDocument();
    });

    it('panel region has aria-labelledby pointing at header id', () => {
      const groups = [makeGroup('users')];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));

      const region = screen.getByRole('region');
      const headerId = region.getAttribute('aria-labelledby');
      expect(headerId).toBeTruthy();
      expect(document.getElementById(headerId!)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Select all / deselect all
  // -------------------------------------------------------------------------

  describe('select-all toggle', () => {
    it('calls onChange with all group permissions added when select-all is checked', () => {
      const groups = [makeGroup('users', 3)];
      const onChange = vi.fn();
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={onChange} />);

      const selectAllCheckbox = screen.getByRole('checkbox', {
        name: /select all permissions in users permissions/i,
      });
      fireEvent.click(selectAllCheckbox);

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedSet: Set<string> = onChange.mock.calls[0][0];
      expect(updatedSet.has('users-perm-0')).toBe(true);
      expect(updatedSet.has('users-perm-1')).toBe(true);
      expect(updatedSet.has('users-perm-2')).toBe(true);
    });

    it('calls onChange with all group permissions removed when select-all unchecked (all selected)', () => {
      const groups = [makeGroup('users', 2)];
      const selected = new Set(['users-perm-0', 'users-perm-1']);
      const onChange = vi.fn();
      render(<PermissionGroupAccordion groups={groups} selected={selected} onChange={onChange} />);

      const selectAllCheckbox = screen.getByRole('checkbox', {
        name: /select all permissions in users permissions/i,
      });
      fireEvent.click(selectAllCheckbox);

      const updatedSet: Set<string> = onChange.mock.calls[0][0];
      expect(updatedSet.has('users-perm-0')).toBe(false);
      expect(updatedSet.has('users-perm-1')).toBe(false);
    });

    it('adds remaining when select-all clicked in partial (indeterminate) state', () => {
      const groups = [makeGroup('users', 3)];
      const selected = new Set(['users-perm-0']); // partial
      const onChange = vi.fn();
      render(<PermissionGroupAccordion groups={groups} selected={selected} onChange={onChange} />);

      const selectAllCheckbox = screen.getByRole('checkbox', {
        name: /select all permissions in users permissions/i,
      });
      fireEvent.click(selectAllCheckbox);

      const updatedSet: Set<string> = onChange.mock.calls[0][0];
      // All 3 should now be selected
      expect(updatedSet.has('users-perm-0')).toBe(true);
      expect(updatedSet.has('users-perm-1')).toBe(true);
      expect(updatedSet.has('users-perm-2')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Individual permission toggle
  // -------------------------------------------------------------------------

  describe('individual permission toggle', () => {
    it('calls onChange with permission added when unchecked permission checked', () => {
      const groups = [makeGroup('users', 2)];
      const onChange = vi.fn();
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={onChange} />);

      // Expand to show permissions
      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));

      // There are multiple checkboxes — select-all + one per permission
      const allCheckboxes = screen.getAllByRole('checkbox');
      // First checkbox is select-all, rest are permissions
      fireEvent.click(allCheckboxes[1]); // users-perm-0

      const updatedSet: Set<string> = onChange.mock.calls[0][0];
      expect(updatedSet.has('users-perm-0')).toBe(true);
    });

    it('calls onChange with permission removed when checked permission clicked', () => {
      const groups = [makeGroup('users', 2)];
      const selected = new Set(['users-perm-0', 'users-perm-1']);
      const onChange = vi.fn();
      render(<PermissionGroupAccordion groups={groups} selected={selected} onChange={onChange} />);

      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));

      const allCheckboxes = screen.getAllByRole('checkbox');
      fireEvent.click(allCheckboxes[1]); // users-perm-0

      const updatedSet: Set<string> = onChange.mock.calls[0][0];
      expect(updatedSet.has('users-perm-0')).toBe(false);
      expect(updatedSet.has('users-perm-1')).toBe(true); // unchanged
    });

    it('shows permission description when available', () => {
      const groups = [makeGroup('users', 1)];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));

      expect(screen.getByText('Description for action-0')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Disabled state
  // -------------------------------------------------------------------------

  describe('disabled state', () => {
    it('disables all checkboxes when disabled=true', () => {
      const groups = [makeGroup('users', 2)];
      render(
        <PermissionGroupAccordion
          groups={groups}
          selected={new Set()}
          onChange={vi.fn()}
          disabled={true}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((cb) => {
        expect(cb).toBeDisabled();
      });
    });

    it('select-all checkbox is enabled when disabled=false', () => {
      const groups = [makeGroup('users', 1)];
      render(
        <PermissionGroupAccordion
          groups={groups}
          selected={new Set()}
          onChange={vi.fn()}
          disabled={false}
        />
      );

      const selectAll = screen.getByRole('checkbox', {
        name: /select all permissions in users permissions/i,
      });
      expect(selectAll).not.toBeDisabled();
    });
  });

  // -------------------------------------------------------------------------
  // Multiple groups independence
  // -------------------------------------------------------------------------

  describe('multiple groups', () => {
    it('renders multiple groups independently (each starts collapsed)', () => {
      const groups = [makeGroup('users', 2), makeGroup('plugins', 2)];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      expect(screen.getByText('users Permissions')).toBeInTheDocument();
      expect(screen.getByText('plugins Permissions')).toBeInTheDocument();
      // No permissions visible yet
      expect(screen.queryByText('users:action-0')).not.toBeInTheDocument();
      expect(screen.queryByText('plugins:action-0')).not.toBeInTheDocument();
    });

    it('opening one group does not open the other', () => {
      const groups = [makeGroup('users', 2), makeGroup('plugins', 2)];
      render(<PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));

      expect(screen.getByText('users:action-0')).toBeInTheDocument();
      expect(screen.queryByText('plugins:action-0')).not.toBeInTheDocument();
    });

    it('onChange preserves permissions from other groups', () => {
      const groups = [makeGroup('users', 2), makeGroup('plugins', 2)];
      const selected = new Set(['plugins-perm-0']); // plugins already selected
      const onChange = vi.fn();

      render(<PermissionGroupAccordion groups={groups} selected={selected} onChange={onChange} />);

      // Select all users permissions
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: /select all permissions in users permissions/i,
        })
      );

      const updatedSet: Set<string> = onChange.mock.calls[0][0];
      // users perms added
      expect(updatedSet.has('users-perm-0')).toBe(true);
      expect(updatedSet.has('users-perm-1')).toBe(true);
      // plugins perm preserved
      expect(updatedSet.has('plugins-perm-0')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  describe('accessibility', () => {
    it('has no WCAG 2.1 AA violations in empty state', async () => {
      const { container } = render(
        <PermissionGroupAccordion groups={[]} selected={new Set()} onChange={vi.fn()} />
      );
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations with groups collapsed', async () => {
      const groups = [makeGroup('users', 3), makeGroup('plugins', 2)];
      const { container } = render(
        <PermissionGroupAccordion groups={groups} selected={new Set()} onChange={vi.fn()} />
      );
      expectNoViolations(await axe(container));
    });

    it('has no WCAG 2.1 AA violations with group expanded', async () => {
      const groups = [makeGroup('users', 3)];
      const { container } = render(
        <PermissionGroupAccordion
          groups={groups}
          selected={new Set(['users-perm-0'])}
          onChange={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /users permissions/i }));
      expectNoViolations(await axe(container));
    });
  });
});
