// apps/web/src/__tests__/authorization/ConditionBuilder.test.tsx
//
// Unit tests for ConditionBuilder component.
// Spec 003: Authorization System RBAC + ABAC — Phase 5.9

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConditionBuilder } from '@/components/authorization/ConditionBuilder';
import type { ConditionTree } from '@/hooks/useAuthorizationApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAndTree(count: number): ConditionTree {
  const children: ConditionTree[] = Array.from({ length: count }, (_, i) => ({
    attribute: `attr.${i}`,
    operator: 'eq',
    value: `val${i}`,
  }));
  return { all: children };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ConditionBuilder', () => {
  it('should render an info banner when enabled=false', () => {
    const onChange = vi.fn();
    render(<ConditionBuilder value={{ all: [] }} onChange={onChange} enabled={false} />);
    expect(screen.getByText(/Attribute-based conditions are not available/i)).toBeInTheDocument();
  });

  it('should not render the info banner when enabled=true (default)', () => {
    const onChange = vi.fn();
    render(<ConditionBuilder value={{ all: [] }} onChange={onChange} enabled={true} />);
    expect(
      screen.queryByText(/Attribute-based conditions are not available/i)
    ).not.toBeInTheDocument();
  });

  it('should render an empty AND group', () => {
    const onChange = vi.fn();
    render(<ConditionBuilder value={{ all: [] }} onChange={onChange} />);
    // ConditionGroup renders with at least the combinator toggle
    expect(screen.getByText(/AND/i)).toBeInTheDocument();
  });

  it('should render an empty OR group', () => {
    const onChange = vi.fn();
    render(<ConditionBuilder value={{ any: [] }} onChange={onChange} />);
    expect(screen.getByText(/OR/i)).toBeInTheDocument();
  });

  it('should render leaf conditions inside the group', () => {
    const tree: ConditionTree = {
      all: [{ attribute: 'user.role', operator: 'eq', value: 'admin' }],
    };
    const onChange = vi.fn();
    render(<ConditionBuilder value={tree} onChange={onChange} />);
    expect(screen.getByDisplayValue('user.role')).toBeInTheDocument();
  });

  it('should show max-conditions warning when 20 conditions are present', () => {
    const tree = makeAndTree(20);
    const onChange = vi.fn();
    render(<ConditionBuilder value={tree} onChange={onChange} />);
    expect(screen.getByText(/Maximum of 20 conditions reached/i)).toBeInTheDocument();
  });

  it('should NOT show max-conditions warning for fewer than 20 conditions', () => {
    const tree = makeAndTree(5);
    const onChange = vi.fn();
    render(<ConditionBuilder value={tree} onChange={onChange} />);
    expect(screen.queryByText(/Maximum of 20 conditions reached/i)).not.toBeInTheDocument();
  });

  it('should render a NOT group when value has `not` key', () => {
    const tree: ConditionTree = {
      not: { attribute: 'user.active', operator: 'eq', value: false },
    };
    const onChange = vi.fn();
    render(<ConditionBuilder value={tree} onChange={onChange} />);
    // NotGroup renders a "NOT" Badge (there may be multiple "NOT" text nodes, use getAllByText)
    const notElements = screen.getAllByText(/^NOT$/i);
    expect(notElements.length).toBeGreaterThan(0);
  });

  it('should pass disabled prop down to leaf rows', () => {
    const tree: ConditionTree = {
      all: [{ attribute: 'user.role', operator: 'eq', value: 'admin' }],
    };
    const onChange = vi.fn();
    render(<ConditionBuilder value={tree} onChange={onChange} disabled={true} />);
    // All inputs should be disabled
    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });

  it('should call onChange when combinator is toggled', async () => {
    const user = userEvent.setup();
    const tree: ConditionTree = { all: [] };
    const onChange = vi.fn();
    render(<ConditionBuilder value={tree} onChange={onChange} />);

    // ConditionGroup renders both AND and OR buttons; click the OR button (aria-label="OR combinator")
    const orButton = screen.getByRole('button', { name: /OR combinator/i });
    await user.click(orButton);
    expect(onChange).toHaveBeenCalledWith({ any: [] });
  });

  it('should call onChange when a condition is removed', async () => {
    const user = userEvent.setup();
    const tree: ConditionTree = {
      all: [{ attribute: 'user.role', operator: 'eq', value: 'admin' }],
    };
    const onChange = vi.fn();
    render(<ConditionBuilder value={tree} onChange={onChange} />);

    // ConditionRow renders a remove button
    const removeButton = screen.getByRole('button', { name: /remove condition/i });
    await user.click(removeButton);
    expect(onChange).toHaveBeenCalled();
  });
});
