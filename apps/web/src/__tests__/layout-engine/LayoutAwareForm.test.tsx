// File: apps/web/src/__tests__/layout-engine/LayoutAwareForm.test.tsx
//
// T014-28 — RTL tests for LayoutAwareForm component.
// Spec 014 Frontend Layout Engine — FR-025, FR-007, FR-008, FR-010, NFR-008.
//
// Tests:
//   Loading — shows skeleton (data-testid="layout-aware-form-skeleton")
//   Normal render — shows data-testid="layout-aware-form", hides hidden fields
//   All fields hidden — shows data-testid="layout-aware-form-empty"
//   Null layout (fail-open) — shows data-testid="layout-aware-form-fallback", renders children as-is
//   Readonly field — wraps in data-field-readonly="true" div
//   Hidden field with required+defaultValue — renders hidden input with data-layout-default-value
//   Render prop mode — children function called with resolved layout
//   Render prop with all fields hidden — shows empty state

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResolvedLayout } from '@plexica/types';

// ---------------------------------------------------------------------------
// Hoisted mock factories (must be before vi.mock calls)
// ---------------------------------------------------------------------------

const { mockUseResolvedLayout } = vi.hoisted(() => {
  const mockUseResolvedLayout = vi.fn();
  return { mockUseResolvedLayout };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useResolvedLayout', () => ({
  useResolvedLayout: mockUseResolvedLayout,
}));

// Mock @plexica/ui components to simple divs for testability
vi.mock('@plexica/ui', () => ({
  Skeleton: ({ shape, width, height }: { shape: string; width: string; height: string }) => (
    <div data-testid="skeleton" data-shape={shape} data-width={width} data-height={height} />
  ),
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  EyeOff: () => <svg data-testid="icon-eye-off" />,
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks are registered)
// ---------------------------------------------------------------------------

import { LayoutAwareForm } from '@/components/layout-engine/LayoutAwareForm';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeLayout(overrides: Partial<ResolvedLayout> = {}): ResolvedLayout {
  return {
    formId: 'test-form',
    source: 'tenant',
    fields: [
      {
        fieldId: 'first-name',
        visibility: 'visible',
        readonly: false,
        order: 0,
        required: false,
        defaultValue: null,
      },
      {
        fieldId: 'email',
        visibility: 'visible',
        readonly: false,
        order: 1,
        required: true,
        defaultValue: null,
      },
    ],
    columns: [],
    sections: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('LayoutAwareForm — loading state', () => {
  beforeEach(() => {
    mockUseResolvedLayout.mockReturnValue({ data: null, isLoading: true, isError: false });
  });

  it('shows skeleton when isLoading=true', () => {
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
      </LayoutAwareForm>
    );
    expect(screen.getByTestId('layout-aware-form-skeleton')).toBeInTheDocument();
  });

  it('does not show form content while loading', () => {
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
      </LayoutAwareForm>
    );
    expect(screen.queryByTestId('layout-aware-form')).not.toBeInTheDocument();
  });

  it('shows custom fallback instead of skeleton when fallback prop provided', () => {
    render(
      <LayoutAwareForm formId="test-form" fallback={<div data-testid="custom-fallback" />}>
        <div data-field-id="first-name">First Name</div>
      </LayoutAwareForm>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('layout-aware-form-skeleton')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Normal render (element children mode)
// ---------------------------------------------------------------------------

describe('LayoutAwareForm — normal render with element children', () => {
  beforeEach(() => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout(),
      isLoading: false,
      isError: false,
    });
  });

  it('renders data-testid="layout-aware-form" when layout resolves', () => {
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
        <div data-field-id="email">Email</div>
      </LayoutAwareForm>
    );
    expect(screen.getByTestId('layout-aware-form')).toBeInTheDocument();
  });

  it('renders visible fields in the DOM', () => {
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
        <div data-field-id="email">Email</div>
      </LayoutAwareForm>
    );
    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('removes hidden fields from the DOM', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        fields: [
          {
            fieldId: 'first-name',
            visibility: 'visible',
            readonly: false,
            order: 0,
            required: false,
            defaultValue: null,
          },
          {
            fieldId: 'secret',
            visibility: 'hidden',
            readonly: false,
            order: 1,
            required: false,
            defaultValue: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
        <div data-field-id="secret">Secret Field</div>
      </LayoutAwareForm>
    );
    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.queryByText('Secret Field')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// All fields hidden
// ---------------------------------------------------------------------------

describe('LayoutAwareForm — all fields hidden', () => {
  it('shows empty state when all fields are hidden', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        fields: [
          {
            fieldId: 'first-name',
            visibility: 'hidden',
            readonly: false,
            order: 0,
            required: false,
            defaultValue: null,
          },
          {
            fieldId: 'email',
            visibility: 'hidden',
            readonly: false,
            order: 1,
            required: false,
            defaultValue: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
        <div data-field-id="email">Email</div>
      </LayoutAwareForm>
    );
    expect(screen.getByTestId('layout-aware-form-empty')).toBeInTheDocument();
  });

  it('shows "No Fields Visible" message in empty state', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        fields: [
          {
            fieldId: 'first-name',
            visibility: 'hidden',
            readonly: false,
            order: 0,
            required: false,
            defaultValue: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
      </LayoutAwareForm>
    );
    expect(screen.getByText('No Fields Visible')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Null layout — fail-open (NFR-008)
// ---------------------------------------------------------------------------

describe('LayoutAwareForm — null layout (fail-open)', () => {
  beforeEach(() => {
    mockUseResolvedLayout.mockReturnValue({ data: null, isLoading: false, isError: false });
  });

  it('shows data-testid="layout-aware-form-fallback" when layout is null', () => {
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
      </LayoutAwareForm>
    );
    expect(screen.getByTestId('layout-aware-form-fallback')).toBeInTheDocument();
  });

  it('renders children as-is when layout is null (fail-open)', () => {
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="first-name">First Name</div>
        <div data-field-id="email">Email</div>
      </LayoutAwareForm>
    );
    expect(screen.getByText('First Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Readonly field
// ---------------------------------------------------------------------------

describe('LayoutAwareForm — readonly field', () => {
  it('wraps readonly field in a div with data-field-readonly="true"', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        fields: [
          {
            fieldId: 'budget',
            visibility: 'readonly',
            readonly: true,
            order: 0,
            required: false,
            defaultValue: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="budget">Budget</div>
      </LayoutAwareForm>
    );
    const readonlyWrapper = document.querySelector('[data-field-readonly="true"]');
    expect(readonlyWrapper).toBeInTheDocument();
    expect(readonlyWrapper).toHaveAttribute('data-field-id', 'budget');
  });
});

// ---------------------------------------------------------------------------
// Hidden field with required + defaultValue — FR-010
// ---------------------------------------------------------------------------

describe('LayoutAwareForm — hidden field default value injection (FR-010)', () => {
  it('injects hidden input with data-layout-default-value for required hidden fields', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        fields: [
          {
            fieldId: 'tenant-id',
            visibility: 'hidden',
            readonly: false,
            order: 0,
            required: true,
            defaultValue: 'acme-corp',
          },
          {
            fieldId: 'first-name',
            visibility: 'visible',
            readonly: false,
            order: 1,
            required: false,
            defaultValue: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="tenant-id">Tenant ID</div>
        <div data-field-id="first-name">First Name</div>
      </LayoutAwareForm>
    );
    const hiddenInput = document.querySelector(
      'input[type="hidden"][data-layout-default-value="true"]'
    ) as HTMLInputElement | null;
    expect(hiddenInput).toBeInTheDocument();
    expect(hiddenInput?.name).toBe('tenant-id');
    expect(hiddenInput?.value).toBe('acme-corp');
  });

  it('does NOT inject hidden input for required hidden field without defaultValue', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        fields: [
          {
            fieldId: 'tenant-id',
            visibility: 'hidden',
            readonly: false,
            order: 0,
            required: true,
            defaultValue: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });
    render(
      <LayoutAwareForm formId="test-form">
        <div data-field-id="tenant-id">Tenant ID</div>
      </LayoutAwareForm>
    );
    const hiddenInput = document.querySelector(
      'input[type="hidden"][data-layout-default-value="true"]'
    );
    expect(hiddenInput).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Render prop mode
// ---------------------------------------------------------------------------

describe('LayoutAwareForm — render prop mode', () => {
  it('calls children function with resolved layout', () => {
    const layout = makeLayout();
    mockUseResolvedLayout.mockReturnValue({ data: layout, isLoading: false, isError: false });

    const renderProp = vi.fn(() => <div data-testid="render-prop-output">Content</div>);

    render(<LayoutAwareForm formId="test-form">{renderProp}</LayoutAwareForm>);

    expect(renderProp).toHaveBeenCalledWith(layout);
    expect(screen.getByTestId('render-prop-output')).toBeInTheDocument();
  });

  it('calls children function with null when layout is null (fail-open)', () => {
    mockUseResolvedLayout.mockReturnValue({ data: null, isLoading: false, isError: false });

    const renderProp = vi.fn((layout: ResolvedLayout | null) => (
      <div data-testid="render-prop-output">{layout === null ? 'null-layout' : 'has-layout'}</div>
    ));

    render(<LayoutAwareForm formId="test-form">{renderProp}</LayoutAwareForm>);

    expect(renderProp).toHaveBeenCalledWith(null);
    expect(screen.getByText('null-layout')).toBeInTheDocument();
  });

  it('shows skeleton in render prop mode while loading', () => {
    mockUseResolvedLayout.mockReturnValue({ data: null, isLoading: true, isError: false });

    render(
      <LayoutAwareForm formId="test-form">
        {(layout) => <div>{layout ? 'loaded' : 'no layout'}</div>}
      </LayoutAwareForm>
    );

    expect(screen.getByTestId('layout-aware-form-skeleton')).toBeInTheDocument();
  });

  it('shows empty state in render prop mode when all fields hidden', () => {
    mockUseResolvedLayout.mockReturnValue({
      data: makeLayout({
        fields: [
          {
            fieldId: 'first-name',
            visibility: 'hidden',
            readonly: false,
            order: 0,
            required: false,
            defaultValue: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
    });

    render(
      <LayoutAwareForm formId="test-form">
        {(layout) => <div>{layout ? 'has-layout' : 'no-layout'}</div>}
      </LayoutAwareForm>
    );

    expect(screen.getByTestId('layout-aware-form-empty')).toBeInTheDocument();
  });
});
