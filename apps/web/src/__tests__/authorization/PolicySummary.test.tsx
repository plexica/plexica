// apps/web/src/__tests__/authorization/PolicySummary.test.tsx
//
// Unit tests for PolicySummary component.
// Spec 003: Authorization System RBAC + ABAC

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PolicySummary } from '@/components/authorization/PolicySummary';
import type { ConditionTree } from '@/hooks/useAuthorizationApi';

describe('PolicySummary', () => {
  it('should render empty tree as "(empty)"', () => {
    const tree: ConditionTree = { all: [] };
    render(<PolicySummary conditions={tree} />);
    expect(screen.getByText('(empty)')).toBeInTheDocument();
  });

  it('should render a single leaf condition', () => {
    const tree: ConditionTree = { attribute: 'user.role', operator: 'eq', value: 'admin' };
    render(<PolicySummary conditions={tree} />);
    // The component renders string values with quotes: user.role eq "admin"
    expect(screen.getByText(/user\.role eq/)).toBeInTheDocument();
  });

  it('should render AND group with "and" connector', () => {
    const tree: ConditionTree = {
      all: [
        { attribute: 'user.role', operator: 'eq', value: 'admin' },
        { attribute: 'resource.type', operator: 'eq', value: 'doc' },
      ],
    };
    render(<PolicySummary conditions={tree} />);
    const text = screen.getByRole('paragraph').textContent ?? '';
    expect(text).toContain('and');
  });

  it('should render OR group with "or" connector', () => {
    const tree: ConditionTree = {
      any: [
        { attribute: 'user.role', operator: 'eq', value: 'admin' },
        { attribute: 'user.role', operator: 'eq', value: 'editor' },
      ],
    };
    render(<PolicySummary conditions={tree} />);
    const text = screen.getByRole('paragraph').textContent ?? '';
    expect(text).toContain('or');
  });

  it('should render NOT group with "not" prefix', () => {
    const tree: ConditionTree = {
      not: { attribute: 'user.active', operator: 'eq', value: false },
    };
    render(<PolicySummary conditions={tree} />);
    const text = screen.getByRole('paragraph').textContent ?? '';
    expect(text).toContain('not');
  });

  it('should handle an any group with a single empty tree gracefully', () => {
    const tree: ConditionTree = { any: [] };
    render(<PolicySummary conditions={tree} />);
    // Empty OR groups also render as "(empty)"
    expect(screen.getByText('(empty)')).toBeInTheDocument();
  });
});
