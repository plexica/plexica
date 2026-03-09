// File: apps/web/src/components/layout-engine/LayoutAwareForm.tsx
//
// T014-15 — Form wrapper component applying layout engine transformations.
// Spec 014 Frontend Layout Engine — FR-025, FR-007, FR-008, FR-010, NFR-008, NFR-010.
//
// This component:
//   1. Fetches the resolved layout via `useResolvedLayout` hook
//   2. Reorders fields per configured order
//   3. Removes hidden fields from the DOM entirely
//   4. Applies read-only treatment (disabled + visual cue + tooltip) to readonly fields
//   5. Auto-injects default values for hidden required fields into form state (FR-010)
//   6. Shows skeleton during loading
//   7. Shows empty state when all fields are hidden for the user's role (Edge Case #3)
//   8. Falls back to manifest defaults on error (fail-open, NFR-008)
//
// Supports two usage patterns:
//   a) Render prop — `children` is a function receiving `ResolvedLayout | null`
//   b) Element children — receives a standard `React.ReactNode`
//
// For render prop usage the consumer controls field rendering; the component
// provides the resolved layout data.  For element children, the component
// wraps all child elements and applies layout transformations.
//
// NOTE: The component does NOT know about specific form library APIs (react-hook-form,
// formik, etc.). Auto-injection of default values (FR-010) is done via a
// data attribute pattern: hidden fields receive a `data-layout-default-value`
// attribute that the form layer can read during submission preparation.
// Plugin forms using LayoutAwareForm SHOULD read these values during onSubmit.

import React, { useId } from 'react';
import { EyeOff } from 'lucide-react';
import { Skeleton } from '@plexica/ui';
import { EmptyState } from '@plexica/ui';
import { useResolvedLayout } from '@/hooks/useResolvedLayout';
import type { ResolvedLayout, ResolvedField } from '@plexica/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Render-prop signature — receives the resolved layout (null = manifest defaults).
 */
export type LayoutAwareFormRenderProp = (resolvedLayout: ResolvedLayout | null) => React.ReactNode;

export interface LayoutAwareFormProps {
  /**
   * The form identifier matching the plugin manifest `formId`.
   * Used to fetch the resolved layout from the backend.
   */
  formId: string;
  /**
   * Optional workspace UUID for workspace-scope resolution.
   * When omitted, tenant-scope config is used.
   */
  workspaceId?: string;
  /**
   * Form content — either:
   *   - A render prop: `(layout) => ReactNode` — receives resolved layout
   *   - Standard ReactNode — layout transformations applied to children
   *
   * When using the render prop pattern, the consumer is responsible for
   * ordering and filtering fields using the provided layout.
   */
  children: React.ReactNode | LayoutAwareFormRenderProp;
  /**
   * Optional custom loading fallback (defaults to skeleton form).
   */
  fallback?: React.ReactNode;
  /**
   * Optional additional CSS class for the wrapper element.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if `children` is a render prop (function).
 */
function isRenderProp(
  children: React.ReactNode | LayoutAwareFormRenderProp
): children is LayoutAwareFormRenderProp {
  return typeof children === 'function';
}

/**
 * Returns true if ALL resolved fields are hidden.
 */
function allFieldsHidden(fields: ResolvedField[]): boolean {
  return fields.length > 0 && fields.every((f) => f.visibility === 'hidden');
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function FormSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading form"
      className={`space-y-4 ${className}`}
      data-testid="layout-aware-form-skeleton"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton shape="line" width="30%" height="16px" />
          <Skeleton shape="rect" width="100%" height="40px" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state (all fields hidden)
// ---------------------------------------------------------------------------

function AllFieldsHiddenEmptyState() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="No fields are visible for your role"
      data-testid="layout-aware-form-empty"
    >
      <EmptyState
        icon={<EyeOff size={48} aria-hidden="true" className="text-muted-foreground" />}
        title="No Fields Visible"
        description="No fields are visible for your role. Contact your administrator if you need access to this form."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only field wrapper
// ---------------------------------------------------------------------------

interface ReadonlyFieldWrapperProps {
  fieldId: string;
  label: string;
  children: React.ReactNode;
}

/**
 * Wraps a field in a disabled overlay for read-only enforcement.
 * The visual treatment communicates read-only state to the user.
 */
function ReadonlyFieldWrapper({ fieldId, children }: ReadonlyFieldWrapperProps) {
  return (
    <div
      data-field-id={fieldId}
      data-field-readonly="true"
      className="relative"
      title="This field is read-only for your role"
    >
      {/* Transparent overlay captures pointer events preventing interaction */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 cursor-not-allowed rounded"
        style={{ pointerEvents: 'all' }}
      />
      <div className="pointer-events-none select-none opacity-60">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hidden field default-value injector
// ---------------------------------------------------------------------------

/**
 * Renders a hidden `<input>` element that injects the default value for a
 * required hidden field into the form's native data. Plugin forms using
 * `LayoutAwareForm` should read `data-layout-default-value` attributes during
 * form submission to ensure required fields get their defaults.
 */
interface HiddenFieldInjectorProps {
  fieldId: string;
  defaultValue: unknown;
}

function HiddenFieldInjector({ fieldId, defaultValue }: HiddenFieldInjectorProps) {
  const stringValue =
    defaultValue == null
      ? ''
      : typeof defaultValue === 'object'
        ? JSON.stringify(defaultValue)
        : String(defaultValue);

  return (
    <input
      type="hidden"
      name={fieldId}
      value={stringValue}
      data-layout-default-value="true"
      data-field-id={fieldId}
      aria-hidden="true"
      readOnly
    />
  );
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

interface SectionWrapperProps {
  sectionId: string;
  label?: string;
  children: React.ReactNode;
}

function SectionWrapper({ sectionId, label, children }: SectionWrapperProps) {
  const headingId = useId();
  return (
    <fieldset
      data-section-id={sectionId}
      aria-labelledby={label ? headingId : undefined}
      className="mb-6 border-0 p-0"
    >
      {label && (
        <legend id={headingId} className="mb-3 text-sm font-semibold text-foreground">
          {label}
        </legend>
      )}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Main component — render-prop path
// ---------------------------------------------------------------------------

/**
 * When using the render prop pattern, LayoutAwareForm simply fetches the
 * resolved layout and passes it to the children function. The consumer
 * handles field rendering directly.
 */
function LayoutAwareFormRenderPropMode({
  formId,
  workspaceId,
  children,
  fallback,
  className = '',
}: LayoutAwareFormProps & { children: LayoutAwareFormRenderProp }) {
  const { data: resolvedLayout, isLoading } = useResolvedLayout({ formId, workspaceId });

  if (isLoading) {
    return <>{fallback ?? <FormSkeleton className={className} />}</>;
  }

  if (resolvedLayout && allFieldsHidden(resolvedLayout.fields)) {
    return <AllFieldsHiddenEmptyState />;
  }

  return <>{children(resolvedLayout)}</>;
}

// ---------------------------------------------------------------------------
// Main component — element children path
// ---------------------------------------------------------------------------

/**
 * When using element children, LayoutAwareForm applies layout transformations
 * to child elements by matching `data-field-id` attributes.
 *
 * Children elements are expected to have `data-field-id` attribute set to the
 * field's `fieldId` value. Unknown children (no data-field-id) are rendered
 * in their original position.
 *
 * Example:
 * ```tsx
 * <LayoutAwareForm formId="crm-contact-form">
 *   <FormField data-field-id="first-name" label="First Name">...</FormField>
 *   <FormField data-field-id="email" label="Email">...</FormField>
 * </LayoutAwareForm>
 * ```
 */
function LayoutAwareFormElementChildrenMode({
  formId,
  workspaceId,
  children,
  fallback,
  className = '',
}: LayoutAwareFormProps & { children: React.ReactNode }) {
  const { data: resolvedLayout, isLoading } = useResolvedLayout({ formId, workspaceId });

  if (isLoading) {
    return <>{fallback ?? <FormSkeleton className={className} />}</>;
  }

  if (!resolvedLayout) {
    // Fail-open: no resolved layout → render children as-is (manifest defaults)
    return (
      <div aria-busy="false" className={className} data-testid="layout-aware-form-fallback">
        {children}
      </div>
    );
  }

  if (allFieldsHidden(resolvedLayout.fields)) {
    return <AllFieldsHiddenEmptyState />;
  }

  // Build a map from fieldId to resolved field for O(1) lookup
  const fieldMap = new Map<string, ResolvedField>(resolvedLayout.fields.map((f) => [f.fieldId, f]));

  // Build a map from fieldId to React child element, and a map from fieldId to sectionId
  // (read from the original child's data-section-id prop before cloning — M-003 fix).
  const childMap = new Map<string, React.ReactElement>();
  const childSectionMap = new Map<string, string>(); // fieldId → sectionId
  const nonFieldChildren: React.ReactNode[] = [];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const fieldId = (child.props as Record<string, unknown>)['data-field-id'];
      if (typeof fieldId === 'string' && fieldId) {
        childMap.set(fieldId, child);
        // Capture data-section-id from the original child (before cloning loses it)
        const sectionId = (child.props as Record<string, unknown>)['data-section-id'];
        if (typeof sectionId === 'string' && sectionId) {
          childSectionMap.set(fieldId, sectionId);
        }
        return;
      }
    }
    nonFieldChildren.push(child);
  });

  // Sort fields by configured order
  const sortedFields = [...resolvedLayout.fields].sort((a, b) => a.order - b.order);

  // Sort sections by configured order
  const sortedSections = [...resolvedLayout.sections].sort((a, b) => a.order - b.order);

  // Build section → field mapping.
  // Note: sections come from the manifest; we rely on children having
  // data-section-id if they are section-grouped. For simplicity here,
  // we render fields in order without section grouping when section info
  // is not present on children elements.
  const useSections = sortedSections.length > 0;

  // renderedFieldsBySection tracks fieldId → rendered node for section grouping.
  // We use a Map keyed by fieldId so we can look up the section via childSectionMap.
  const renderedFieldMap = new Map<string, React.ReactNode>();
  const renderedFieldOrder: string[] = []; // preserve render order for flat mode
  const hiddenDefaultInjectors: React.ReactNode[] = [];

  for (const field of sortedFields) {
    const resolvedField = fieldMap.get(field.fieldId);
    if (!resolvedField) continue;

    if (resolvedField.visibility === 'hidden') {
      // Hidden field: inject default value if present (FR-010)
      if (
        resolvedField.required &&
        resolvedField.defaultValue !== undefined &&
        resolvedField.defaultValue !== null
      ) {
        hiddenDefaultInjectors.push(
          <HiddenFieldInjector
            key={`hidden-${field.fieldId}`}
            fieldId={field.fieldId}
            defaultValue={resolvedField.defaultValue}
          />
        );
      }
      continue; // Remove from DOM
    }

    const child = childMap.get(field.fieldId);
    if (!child) continue; // Field in layout config but no matching child — skip

    let rendered: React.ReactNode;
    if (resolvedField.visibility === 'readonly') {
      rendered = (
        <ReadonlyFieldWrapper
          key={field.fieldId}
          fieldId={field.fieldId}
          label={((child.props as Record<string, unknown>)['label'] as string) ?? field.fieldId}
        >
          {child}
        </ReadonlyFieldWrapper>
      );
    } else {
      rendered = React.cloneElement(child, { key: field.fieldId });
    }

    renderedFieldMap.set(field.fieldId, rendered);
    renderedFieldOrder.push(field.fieldId);
  }

  // Any children not matched by layout config are rendered after laid-out fields
  const unmappedChildren = nonFieldChildren;

  return (
    <div aria-busy="false" className={`${className} space-y-4`} data-testid="layout-aware-form">
      {/* Hidden default-value injectors */}
      {hiddenDefaultInjectors}

      {useSections
        ? // Group fields by their original data-section-id (read before cloning — M-003 fix).
          // Fields without a matching section fall through to an unsectioned fallback.
          sortedSections.map((section) => {
            const sectionFields = renderedFieldOrder
              .filter((fid) => childSectionMap.get(fid) === section.sectionId)
              .map((fid) => renderedFieldMap.get(fid));
            if (sectionFields.length === 0) return null;
            return (
              // TD-029: pass sectionId as label so the fieldset gets an accessible
              // aria-labelledby. A human-readable section label requires adding
              // `label` to ResolvedSection (deferred to a future spec).
              <SectionWrapper
                key={section.sectionId}
                sectionId={section.sectionId}
                label={section.sectionId}
              >
                {sectionFields}
              </SectionWrapper>
            );
          })
        : // No section grouping: render fields in order
          renderedFieldOrder.map((fid) => renderedFieldMap.get(fid))}

      {/* Non-field children (e.g. submit button) */}
      {unmappedChildren}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

/**
 * Wrapper component that applies layout engine transformations to a form.
 *
 * Usage with render prop (recommended for plugin forms):
 * ```tsx
 * <LayoutAwareForm formId="crm-contact-form" workspaceId={workspaceId}>
 *   {(layout) => (
 *     <>
 *       {layout?.fields
 *         .filter((f) => f.visibility !== 'hidden')
 *         .sort((a, b) => a.order - b.order)
 *         .map((f) => <MyFormField key={f.fieldId} fieldId={f.fieldId} readonly={f.readonly} />)}
 *     </>
 *   )}
 * </LayoutAwareForm>
 * ```
 *
 * Usage with element children (for simple forms):
 * ```tsx
 * <LayoutAwareForm formId="crm-contact-form">
 *   <FormField data-field-id="first-name" label="First Name" />
 *   <FormField data-field-id="email" label="Email" />
 *   <Button type="submit">Save</Button>
 * </LayoutAwareForm>
 * ```
 */
export function LayoutAwareForm(props: LayoutAwareFormProps) {
  if (isRenderProp(props.children)) {
    return <LayoutAwareFormRenderPropMode {...props} children={props.children} />;
  }
  return <LayoutAwareFormElementChildrenMode {...props} children={props.children} />;
}
