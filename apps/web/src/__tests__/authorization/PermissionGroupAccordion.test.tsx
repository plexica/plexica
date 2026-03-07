// apps/web/src/__tests__/authorization/PermissionGroupAccordion.test.tsx
//
// Unit tests for Spec 003 PermissionGroupAccordion component.
// Spec 003: Authorization System RBAC + ABAC

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionGroupAccordion } from '@/components/authorization/PermissionGroupAccordion';
import type { Permission } from '@/hooks/useAuthorizationApi';

const makePermission = (id: string, key: string): Permission => ({
  id,
  tenantId: 'tenant-1',
  key,
  name: `Permission ${id}`,
  pluginId: null,
  createdAt: '2025-01-01T00:00:00Z',
});

const permissions: Permission[] = [
  makePermission('p1', 'workspace:read'),
  makePermission('p2', 'workspace:write'),
  makePermission('p3', 'workspace:delete'),
];

describe('PermissionGroupAccordion', () => {
  it('should render group source label', () => {
    render(
      <PermissionGroupAccordion
        source="core"
        permissions={permissions}
        selected={[]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('core')).toBeInTheDocument();
  });

  it('should show selected/total count', () => {
    render(
      <PermissionGroupAccordion
        source="core"
        permissions={permissions}
        selected={['p1']}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('should expand panel when header button is clicked', () => {
    render(
      <PermissionGroupAccordion
        source="core"
        permissions={permissions}
        selected={[]}
        onChange={vi.fn()}
      />
    );
    const expandBtn = screen.getByRole('button', { name: /core/i });
    fireEvent.click(expandBtn);
    // After expanding, WildcardPermissionRow renders permission keys (not names)
    expect(screen.getByText('workspace:read')).toBeInTheDocument();
  });

  it('should call onChange with all ids when select-all checked (none selected)', () => {
    const onChange = vi.fn();
    render(
      <PermissionGroupAccordion
        source="core"
        permissions={permissions}
        selected={[]}
        onChange={onChange}
      />
    );
    const selectAll = screen.getByLabelText('Select all permissions in core');
    fireEvent.click(selectAll);
    const called = onChange.mock.calls[0]?.[0] as string[];
    expect(called).toContain('p1');
    expect(called).toContain('p2');
    expect(called).toContain('p3');
  });

  it('should call onChange removing all ids when select-all unchecked (all selected)', () => {
    const onChange = vi.fn();
    render(
      <PermissionGroupAccordion
        source="core"
        permissions={permissions}
        selected={['p1', 'p2', 'p3']}
        onChange={onChange}
      />
    );
    const selectAll = screen.getByLabelText('Select all permissions in core');
    fireEvent.click(selectAll);
    const called = onChange.mock.calls[0]?.[0] as string[];
    expect(called).not.toContain('p1');
    expect(called).not.toContain('p2');
  });

  it('should have role="group" and aria-label', () => {
    render(
      <PermissionGroupAccordion
        source="core"
        permissions={permissions}
        selected={[]}
        onChange={vi.fn()}
      />
    );
    const group = screen.getByRole('group', { name: 'core' });
    expect(group).toBeInTheDocument();
  });
});
