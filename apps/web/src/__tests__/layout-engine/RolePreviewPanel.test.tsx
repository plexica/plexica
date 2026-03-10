// File: apps/web/src/__tests__/layout-engine/RolePreviewPanel.test.tsx
//
// T014-28 — Unit tests for RolePreviewPanel component.
// Spec 014 Frontend Layout Engine — FR-014, NFR-010.
//
// Tests:
//   Shows prompt when role=null
//   Shows the role badge when role is set
//   Renders visible fields
//   Omits hidden fields from the preview card
//   Shows read-only annotation for readonly fields
//   Shows hidden fields annotation in footer
//   Shows "All fields are hidden" message when every field is hidden
//   Groups fields under section headings when sections present
//   aria-live="polite" on container
//   Renders data-testid="role-preview-panel-empty" when role=null

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Component under test (pure component — no hooks or external imports to mock)
// ---------------------------------------------------------------------------

import { RolePreviewPanel } from '@/components/layout-engine/RolePreviewPanel';
import type {
  ManifestField,
  ManifestSection,
  FieldOverride,
  SectionOverride,
} from '@plexica/types';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeField(
  fieldId: string,
  label: string,
  order: number,
  required = false,
  sectionId = ''
): ManifestField {
  return { fieldId, label, order, required, type: 'text', sectionId, defaultValue: null };
}

function makeOverride(
  fieldId: string,
  visibility: 'visible' | 'readonly' | 'hidden'
): FieldOverride {
  return {
    fieldId,
    order: 0,
    globalVisibility: visibility,
    visibility: { TENANT_ADMIN: visibility },
  };
}

const FIELDS: ManifestField[] = [
  makeField('name', 'Name', 0),
  makeField('email', 'Email', 1),
  makeField('budget', 'Budget', 2),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RolePreviewPanel — no role selected', () => {
  it('shows prompt panel with data-testid="role-preview-panel-empty" when role=null', () => {
    render(
      <RolePreviewPanel
        role={null}
        fields={FIELDS}
        overrides={[]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByTestId('role-preview-panel-empty')).toBeInTheDocument();
  });

  it('shows "Select a role to preview the form." prompt text', () => {
    render(
      <RolePreviewPanel
        role={null}
        fields={FIELDS}
        overrides={[]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByText('Select a role to preview the form.')).toBeInTheDocument();
  });
});

describe('RolePreviewPanel — with role', () => {
  it('renders data-testid="role-preview-panel" when role is set', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={FIELDS}
        overrides={[]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByTestId('role-preview-panel')).toBeInTheDocument();
  });

  it('shows the role badge', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={FIELDS}
        overrides={[]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByText('TENANT_ADMIN')).toBeInTheDocument();
  });

  it('has aria-live="polite" on the container', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={FIELDS}
        overrides={[]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    const panel = screen.getByTestId('role-preview-panel');
    expect(panel).toHaveAttribute('aria-live', 'polite');
  });
});

describe('RolePreviewPanel — field visibility', () => {
  it('renders visible fields in preview', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={FIELDS}
        overrides={[makeOverride('name', 'visible'), makeOverride('email', 'visible')]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
  });

  it('omits hidden fields from the preview card', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={FIELDS}
        overrides={[
          makeOverride('name', 'visible'),
          makeOverride('email', 'hidden'),
          makeOverride('budget', 'visible'),
        ]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    // Email should not appear as a preview input (hidden fields are only shown
    // in the footer annotation, not as form controls).
    // Use queryByRole('textbox') to target only actual inputs, not the footer
    // annotation <p> element which also carries aria-label="Email: hidden for …".
    expect(screen.queryByRole('textbox', { name: /^Email/ })).not.toBeInTheDocument();
  });

  it('shows readonly annotation for readonly fields', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={FIELDS}
        overrides={[makeOverride('budget', 'readonly')]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByText('(read-only)')).toBeInTheDocument();
  });

  it('shows hidden fields in the footer annotation', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={FIELDS}
        overrides={[
          makeOverride('name', 'visible'),
          makeOverride('email', 'hidden'),
          makeOverride('budget', 'visible'),
        ]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByText(/Email: hidden for TENANT_ADMIN/)).toBeInTheDocument();
  });

  it('shows "All fields are hidden" when every field is hidden', () => {
    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={[makeField('name', 'Name', 0)]}
        overrides={[makeOverride('name', 'hidden')]}
        sections={[]}
        sectionOverrides={[]}
      />
    );
    expect(screen.getByText(/All fields are hidden for the TENANT_ADMIN role/)).toBeInTheDocument();
  });
});

describe('RolePreviewPanel — section grouping', () => {
  it('shows section headings when sections are present', () => {
    const sections: ManifestSection[] = [{ sectionId: 'details', label: 'Details', order: 0 }];
    const fieldsWithSection = [makeField('name', 'Name', 0, false, 'details')];
    const sectionOverrides: SectionOverride[] = [];

    render(
      <RolePreviewPanel
        role="TENANT_ADMIN"
        fields={fieldsWithSection}
        overrides={[makeOverride('name', 'visible')]}
        sections={sections}
        sectionOverrides={sectionOverrides}
      />
    );
    expect(screen.getByText('Details')).toBeInTheDocument();
  });
});
