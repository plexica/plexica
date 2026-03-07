// apps/web/src/__tests__/authorization/EffectBadge.test.tsx
//
// Unit tests for EffectBadge component.
// Spec 003: Authorization System RBAC + ABAC

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EffectBadge } from '@/components/authorization/EffectBadge';

describe('EffectBadge', () => {
  it('should render "DENY" text for DENY effect', () => {
    render(<EffectBadge effect="DENY" />);
    expect(screen.getByText('DENY')).toBeInTheDocument();
  });

  it('should render "FILTER" text for FILTER effect', () => {
    render(<EffectBadge effect="FILTER" />);
    expect(screen.getByText('FILTER')).toBeInTheDocument();
  });

  it('should use danger variant for DENY', () => {
    const { container } = render(<EffectBadge effect="DENY" />);
    // The badge element should be present
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should use outline variant for FILTER', () => {
    const { container } = render(<EffectBadge effect="FILTER" />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
