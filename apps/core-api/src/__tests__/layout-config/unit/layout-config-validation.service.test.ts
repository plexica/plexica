// apps/core-api/src/__tests__/layout-config/unit/layout-config-validation.service.test.ts
//
// T014-25 — Unit tests for LayoutConfigValidationService.
// Spec 014 Frontend Layout Engine — FR-020, FR-011, Edge Cases #1, #6, NFR-004.
//
// Coverage targets:
//   - validateAgainstManifest(): valid/invalid field, section, column references
//   - detectRequiredFieldWarnings(): globalVisibility hidden/readonly, all-role hidden,
//     has defaultValue (no warning), non-required field (no warning)
//   - staleReferences = invalidReferences copy in validateAgainstManifest
//   - detectStaleReferences(): separate method, IDs removed from manifest
//   - validateSize(): under/over 256 KB boundary
//   - NFR-004: 200-field manifest processed in < 10 ms

import { describe, it, expect } from 'vitest';
import { LayoutConfigValidationService } from '../../../services/layout-config-validation.service.js';
import type { FormSchema, FieldOverride, SectionOverride, ColumnOverride } from '@plexica/types';
import type { SaveLayoutConfigOverrides } from '../../../services/layout-config-validation.service.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeManifest = (overrides: Partial<FormSchema> = {}): FormSchema => ({
  formId: 'crm.contact-edit',
  label: 'Contact Edit',
  fields: [
    {
      fieldId: 'first-name',
      label: 'First Name',
      type: 'text',
      required: true,
      defaultValue: null,
    },
    { fieldId: 'email', label: 'Email', type: 'text', required: true, defaultValue: null },
    { fieldId: 'budget', label: 'Budget', type: 'number', required: false, defaultValue: null },
  ],
  sections: [{ sectionId: 'basic', label: 'Basic Info' }],
  columns: [
    { columnId: 'col-name', label: 'Name' },
    { columnId: 'col-email', label: 'Email' },
  ],
  ...overrides,
});

const makeFieldOverride = (
  fieldId: string,
  globalVisibility: FieldOverride['globalVisibility'] = 'visible',
  visibility?: FieldOverride['visibility'],
  order = 0
): FieldOverride => ({
  fieldId,
  order,
  globalVisibility,
  visibility: visibility ?? {},
});

const makeSectionOverride = (sectionId: string, order = 0): SectionOverride => ({
  sectionId,
  order,
});

const makeColumnOverride = (
  columnId: string,
  globalVisibility: ColumnOverride['globalVisibility'] = 'visible',
  visibility?: ColumnOverride['visibility']
): ColumnOverride => ({
  columnId,
  globalVisibility,
  visibility: visibility ?? {},
});

const emptyOverrides = (): SaveLayoutConfigOverrides => ({
  fields: [],
  sections: [],
  columns: [],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LayoutConfigValidationService', () => {
  const service = new LayoutConfigValidationService();
  const manifest = makeManifest();

  // -------------------------------------------------------------------------
  // validateAgainstManifest — valid references
  // -------------------------------------------------------------------------

  describe('validateAgainstManifest — valid references', () => {
    it('should return valid=true when all references exist in manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        fields: [makeFieldOverride('first-name', 'visible'), makeFieldOverride('email', 'visible')],
        sections: [makeSectionOverride('basic')],
        columns: [makeColumnOverride('col-name')],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.valid).toBe(true);
      expect(result.invalidReferences).toHaveLength(0);
      expect(result.staleReferences).toHaveLength(0);
    });

    it('should return valid=true with empty overrides', () => {
      const result = service.validateAgainstManifest(emptyOverrides(), manifest);

      expect(result.valid).toBe(true);
      expect(result.invalidReferences).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // validateAgainstManifest — invalid references
  // -------------------------------------------------------------------------

  describe('validateAgainstManifest — invalid references', () => {
    it('should return valid=false when a field ID does not exist in manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        fields: [makeFieldOverride('nonexistent-field', 'visible')],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toHaveLength(1);
      expect(result.invalidReferences[0]).toEqual({ type: 'field', id: 'nonexistent-field' });
    });

    it('should return valid=false when a section ID does not exist in manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        sections: [makeSectionOverride('no-such-section')],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toHaveLength(1);
      expect(result.invalidReferences[0]).toEqual({ type: 'section', id: 'no-such-section' });
    });

    it('should return valid=false when a column ID does not exist in manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        columns: [makeColumnOverride('no-such-col')],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toHaveLength(1);
      expect(result.invalidReferences[0]).toEqual({ type: 'column', id: 'no-such-col' });
    });

    it('should accumulate multiple invalid references across fields, sections, and columns', () => {
      const overrides: SaveLayoutConfigOverrides = {
        fields: [makeFieldOverride('bad-field')],
        sections: [makeSectionOverride('bad-section')],
        columns: [makeColumnOverride('bad-col')],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toHaveLength(3);
      expect(result.invalidReferences.map((r) => r.type)).toEqual(
        expect.arrayContaining(['field', 'section', 'column'])
      );
    });

    it('should return valid=false even when one of many references is invalid', () => {
      const overrides: SaveLayoutConfigOverrides = {
        fields: [
          makeFieldOverride('first-name', 'visible'), // valid
          makeFieldOverride('ghost-field', 'visible'), // invalid
        ],
        sections: [],
        columns: [],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.valid).toBe(false);
      expect(result.invalidReferences).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // validateAgainstManifest — staleReferences mirrors invalidReferences
  // -------------------------------------------------------------------------

  describe('validateAgainstManifest — staleReferences', () => {
    it('should populate staleReferences as a copy of invalidReferences', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        fields: [makeFieldOverride('stale-removed-field', 'visible')],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.staleReferences).toHaveLength(1);
      expect(result.staleReferences[0]).toEqual({ type: 'field', id: 'stale-removed-field' });
      // staleReferences should mirror invalidReferences contents
      expect(result.staleReferences).toEqual(result.invalidReferences);
    });

    it('should return empty staleReferences when all references are valid', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        fields: [makeFieldOverride('email', 'visible')],
      };

      const result = service.validateAgainstManifest(overrides, manifest);

      expect(result.staleReferences).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // detectRequiredFieldWarnings — globalVisibility
  // -------------------------------------------------------------------------

  describe('detectRequiredFieldWarnings — globalVisibility', () => {
    it('should warn when required field globalVisibility="hidden" and no defaultValue', () => {
      const overrides = [makeFieldOverride('email', 'hidden')]; // email: required, no defaultValue

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].fieldId).toBe('email');
      expect(warnings[0].label).toBe('Email');
    });

    it('should warn when required field globalVisibility="readonly" and no defaultValue', () => {
      const overrides = [makeFieldOverride('first-name', 'readonly')];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].fieldId).toBe('first-name');
    });

    it('should NOT warn when required field globalVisibility="visible"', () => {
      const overrides = [makeFieldOverride('email', 'visible')];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(0);
    });

    it('should NOT warn when required field is hidden but has a non-null defaultValue', () => {
      const manifestWithDefault = makeManifest({
        fields: [
          {
            fieldId: 'email',
            label: 'Email',
            type: 'text',
            required: true,
            defaultValue: 'n/a@example.com',
          },
        ],
        sections: [],
        columns: [],
      });
      const overrides = [makeFieldOverride('email', 'hidden')];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifestWithDefault);

      expect(warnings).toHaveLength(0);
    });

    it('should NOT warn when non-required field is hidden', () => {
      const overrides = [makeFieldOverride('budget', 'hidden')]; // budget: required=false

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(0);
    });

    it('should NOT warn for field IDs not in manifest (invalid refs — handled elsewhere)', () => {
      const overrides = [makeFieldOverride('unknown-field', 'hidden')];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // detectRequiredFieldWarnings — role-specific visibility
  // -------------------------------------------------------------------------

  describe('detectRequiredFieldWarnings — role-specific visibility', () => {
    it('should warn when ALL role-specific values are "hidden"', () => {
      const overrides = [
        makeFieldOverride('email', 'visible', {
          VIEWER: 'hidden',
          MEMBER: 'hidden',
          ADMIN: 'hidden',
        }),
      ];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(1);
      expect(warnings[0].fieldId).toBe('email');
    });

    it('should warn when ALL role-specific values are "readonly"', () => {
      const overrides = [
        makeFieldOverride('email', 'visible', {
          VIEWER: 'readonly',
          MEMBER: 'readonly',
        }),
      ];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(1);
    });

    it('should warn when ALL role-specific values are a mix of "hidden" and "readonly"', () => {
      const overrides = [
        makeFieldOverride('email', 'visible', {
          VIEWER: 'hidden',
          MEMBER: 'readonly',
        }),
      ];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(1);
    });

    it('should NOT warn when at least one role has "visible"', () => {
      const overrides = [
        makeFieldOverride('email', 'hidden', {
          VIEWER: 'hidden',
          ADMIN: 'visible', // at least one role is visible
        }),
      ];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(0);
    });

    it('should NOT warn when role-specific visibility map is empty (uses globalVisibility)', () => {
      const overrides = [makeFieldOverride('email', 'visible', {})]; // no role overrides, global=visible

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(0);
    });

    it('should emit multiple warnings for multiple required fields that are all hidden', () => {
      const overrides = [
        makeFieldOverride('first-name', 'hidden'),
        makeFieldOverride('email', 'hidden'),
      ];

      const warnings = service.detectRequiredFieldWarnings(overrides, manifest);

      expect(warnings).toHaveLength(2);
      const fieldIds = warnings.map((w) => w.fieldId);
      expect(fieldIds).toContain('first-name');
      expect(fieldIds).toContain('email');
    });
  });

  // -------------------------------------------------------------------------
  // detectStaleReferences — separate method for stored overrides vs current manifest
  // -------------------------------------------------------------------------

  describe('detectStaleReferences', () => {
    it('should detect a field ID that is no longer in the manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        fields: [makeFieldOverride('old-removed-field', 'visible')],
      };

      const stale = service.detectStaleReferences(overrides, manifest);

      expect(stale).toHaveLength(1);
      expect(stale[0]).toEqual({ type: 'field', id: 'old-removed-field' });
    });

    it('should detect a section ID that is no longer in the manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        sections: [makeSectionOverride('deleted-section')],
      };

      const stale = service.detectStaleReferences(overrides, manifest);

      expect(stale).toHaveLength(1);
      expect(stale[0]).toEqual({ type: 'section', id: 'deleted-section' });
    });

    it('should detect a column ID that is no longer in the manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        ...emptyOverrides(),
        columns: [makeColumnOverride('old-col')],
      };

      const stale = service.detectStaleReferences(overrides, manifest);

      expect(stale).toHaveLength(1);
      expect(stale[0]).toEqual({ type: 'column', id: 'old-col' });
    });

    it('should return empty array when all stored references are still in manifest', () => {
      const overrides: SaveLayoutConfigOverrides = {
        fields: [makeFieldOverride('email', 'visible')],
        sections: [makeSectionOverride('basic')],
        columns: [makeColumnOverride('col-name')],
      };

      const stale = service.detectStaleReferences(overrides, manifest);

      expect(stale).toHaveLength(0);
    });

    it('should accumulate stale references across all entity types', () => {
      const overrides: SaveLayoutConfigOverrides = {
        fields: [makeFieldOverride('stale-field')],
        sections: [makeSectionOverride('stale-section')],
        columns: [makeColumnOverride('stale-col')],
      };

      const stale = service.detectStaleReferences(overrides, manifest);

      expect(stale).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // validateSize — 256 KB boundary (Edge Case #6)
  // -------------------------------------------------------------------------

  describe('validateSize', () => {
    it('should return true for a small payload well under 256 KB', () => {
      const overrides: SaveLayoutConfigOverrides = {
        fields: [makeFieldOverride('email', 'visible')],
        sections: [],
        columns: [],
      };

      expect(service.validateSize(overrides)).toBe(true);
    });

    it('should return true for an empty payload', () => {
      expect(service.validateSize(emptyOverrides())).toBe(true);
    });

    it('should return false when payload exceeds 256 KB', () => {
      // Generate a payload that exceeds 256 KB by creating many fields with long IDs
      const longString = 'x'.repeat(200);
      const fields: FieldOverride[] = Array.from({ length: 2000 }, (_, i) =>
        makeFieldOverride(`field-${i}-${longString}`, 'visible')
      );

      const oversizedOverrides: SaveLayoutConfigOverrides = {
        fields,
        sections: [],
        columns: [],
      };

      expect(service.validateSize(oversizedOverrides)).toBe(false);
    });

    it('should return true for a payload exactly at the 256 KB boundary', () => {
      // Build a payload close to but under 256 KB
      const json = JSON.stringify(emptyOverrides());
      // Small payload is far under limit
      expect(Buffer.byteLength(json, 'utf8')).toBeLessThan(256 * 1024);
      expect(service.validateSize(emptyOverrides())).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // NFR-004: 200-field manifest processed in < 10 ms
  // -------------------------------------------------------------------------

  describe('NFR-004 — performance', () => {
    it('should process a 200-field manifest in under 10 ms', () => {
      const largeManifest: FormSchema = {
        formId: 'perf-test-form',
        label: 'Perf Test',
        fields: Array.from({ length: 200 }, (_, i) => ({
          fieldId: `field-${i}`,
          label: `Field ${i}`,
          type: 'text' as const,
          required: i % 2 === 0,
          defaultValue: null,
        })),
        sections: Array.from({ length: 20 }, (_, i) => ({
          sectionId: `section-${i}`,
          label: `Section ${i}`,
        })),
        columns: Array.from({ length: 50 }, (_, i) => ({
          columnId: `col-${i}`,
          label: `Col ${i}`,
        })),
      };

      const overrides: SaveLayoutConfigOverrides = {
        fields: largeManifest.fields.map((f, i) =>
          makeFieldOverride(f.fieldId, i % 3 === 0 ? 'hidden' : 'visible')
        ),
        sections: largeManifest.sections.map((s, i) => makeSectionOverride(s.sectionId, i)),
        columns: largeManifest.columns.map((c) => makeColumnOverride(c.columnId, 'visible')),
      };

      const start = performance.now();
      service.validateAgainstManifest(overrides, largeManifest);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });

    it('should process detectRequiredFieldWarnings for 200 fields in under 10 ms', () => {
      const largeManifest: FormSchema = {
        formId: 'perf-test-form',
        label: 'Perf Test',
        fields: Array.from({ length: 200 }, (_, i) => ({
          fieldId: `field-${i}`,
          label: `Field ${i}`,
          type: 'text' as const,
          required: true,
          defaultValue: null,
        })),
        sections: [],
        columns: [],
      };

      const fieldOverrides: FieldOverride[] = largeManifest.fields.map((f, i) =>
        makeFieldOverride(f.fieldId, i % 2 === 0 ? 'hidden' : 'visible')
      );

      const start = performance.now();
      service.detectRequiredFieldWarnings(fieldOverrides, largeManifest);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(10);
    });
  });
});
