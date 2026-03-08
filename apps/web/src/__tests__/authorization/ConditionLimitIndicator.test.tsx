// apps/web/src/__tests__/authorization/ConditionLimitIndicator.test.tsx
//
// Unit tests for ConditionLimitIndicator component.
// Spec 003: Authorization System RBAC + ABAC

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConditionLimitIndicator } from '@/components/authorization/ConditionLimitIndicator';

describe('ConditionLimitIndicator', () => {
  it('should render condition count', () => {
    render(<ConditionLimitIndicator conditionCount={5} depth={2} />);
    expect(screen.getByText(/5 \/ 20/)).toBeInTheDocument();
  });

  it('should render depth', () => {
    render(<ConditionLimitIndicator conditionCount={5} depth={2} />);
    expect(screen.getByText(/Depth: 2 \/ 5/)).toBeInTheDocument();
  });

  it('should show normal (non-red) styling when under limits', () => {
    const { container } = render(<ConditionLimitIndicator conditionCount={5} depth={2} />);
    // When under limits, should not have text-destructive
    expect(container.textContent).toContain('5 / 20');
  });

  it('should show red styling when condition count reaches limit (20)', () => {
    render(<ConditionLimitIndicator conditionCount={20} depth={2} />);
    const countEl = screen.getByText(/20 \/ 20/);
    expect(countEl).toHaveClass('text-destructive');
  });

  it('should show red styling when depth reaches limit (5)', () => {
    render(<ConditionLimitIndicator conditionCount={3} depth={5} />);
    const depthEl = screen.getByText(/Depth: 5 \/ 5/);
    expect(depthEl).toHaveClass('text-destructive');
  });
});
