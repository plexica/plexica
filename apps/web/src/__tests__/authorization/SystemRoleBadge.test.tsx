// apps/web/src/__tests__/authorization/SystemRoleBadge.test.tsx
//
// Unit tests for SystemRoleBadge component.
// Spec 003: Authorization System RBAC + ABAC

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SystemRoleBadge } from '@/components/authorization/SystemRoleBadge';

describe('SystemRoleBadge', () => {
  it('should render "System" text', () => {
    render(<SystemRoleBadge />);
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('should render a lock icon with aria-hidden', () => {
    const { container } = render(<SystemRoleBadge />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('should be accessible — no role attribute required (decorative badge)', () => {
    render(<SystemRoleBadge />);
    // The badge is purely informational; its text is enough for screen readers
    const text = screen.getByText('System');
    expect(text).toBeInTheDocument();
  });
});
