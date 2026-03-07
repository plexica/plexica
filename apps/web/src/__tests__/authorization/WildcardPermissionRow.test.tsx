// apps/web/src/__tests__/authorization/WildcardPermissionRow.test.tsx
//
// Unit tests for WildcardPermissionRow component.
// Spec 003: Authorization System RBAC + ABAC

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WildcardPermissionRow } from '@/components/authorization/WildcardPermissionRow';
import type { Permission } from '@/hooks/useAuthorizationApi';

const mockPermission: Permission = {
  id: 'perm-1',
  tenantId: 'tenant-1',
  key: 'workspace:read',
  name: 'Read Workspace',
  description: 'View workspace contents',
  pluginId: null,
  createdAt: '2025-01-01T00:00:00Z',
};

const wildcardPermission: Permission = {
  ...mockPermission,
  id: 'perm-2',
  key: 'workspace:*',
  name: 'All Workspace Actions',
};

describe('WildcardPermissionRow', () => {
  it('should render the permission key (component shows key, not name)', () => {
    render(
      <WildcardPermissionRow permission={mockPermission} selected={false} onToggle={vi.fn()} />
    );
    // The component renders permission.key in a <code> element, not permission.name
    expect(screen.getByText('workspace:read')).toBeInTheDocument();
  });

  it('should render description when provided', () => {
    render(
      <WildcardPermissionRow permission={mockPermission} selected={false} onToggle={vi.fn()} />
    );
    expect(screen.getByText('View workspace contents')).toBeInTheDocument();
  });

  it('should show wildcard indicator for :* keys', () => {
    render(
      <WildcardPermissionRow permission={wildcardPermission} selected={false} onToggle={vi.fn()} />
    );
    // Component renders "(wildcard)" with parentheses
    expect(screen.getByText('(wildcard)')).toBeInTheDocument();
  });

  it('should call onToggle when checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(
      <WildcardPermissionRow permission={mockPermission} selected={false} onToggle={onToggle} />
    );
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('should render checkbox as checked when selected=true', () => {
    render(
      <WildcardPermissionRow permission={mockPermission} selected={true} onToggle={vi.fn()} />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('should disable checkbox when disabled=true', () => {
    render(
      <WildcardPermissionRow
        permission={mockPermission}
        selected={false}
        onToggle={vi.fn()}
        disabled={true}
      />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeDisabled();
  });
});
