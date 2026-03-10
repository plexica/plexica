// File: apps/web/src/components/layout-engine/LayoutConfigPanel.tsx
//
// T014-18 — Orchestrator component for the layout config admin panel.
// Spec 014 Frontend Layout Engine — FR-012, FR-014, FR-015, FR-023.
//
// Responsibilities:
//   1. Fetch the list of configurable forms (GET /layout-configs/forms)
//   2. Let the admin select a form from the list
//   3. Load the current saved config for the selected form
//   4. Render FieldConfigTable, ColumnConfigTable, SectionOrderList tabs
//   5. Render RolePreviewPanel (live preview as overrides change)
//   6. Save / Revert / Discard actions
//   7. Intercept REQUIRED_FIELD_NO_DEFAULT 400 and show RequiredFieldWarningDialog
//   8. Surface audit-trail metadata (last saved by / at)
//
// Scoping:
//   - scope="tenant"   → uses getLayoutConfig / saveLayoutConfig
//   - scope="workspace" → uses getWorkspaceLayoutConfig / saveWorkspaceLayoutConfig
//
// Fail-open: loading errors are displayed non-blocking; config operations
// catch and toast errors without crashing the panel.
//
// Constitution compliance:
//   - Art. 5.3: No raw SQL here (API layer validates)
//   - Art. 6.2: Error responses parsed for structured `error.code`
//   - Art. 1.3: WCAG 2.1 AA — all interactive elements labelled, live regions used

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Puzzle, EyeOff } from 'lucide-react';
import {
  Button,
  Dialog,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Skeleton,
  EmptyState,
} from '@plexica/ui';
import { toast } from '@/components/ToastProvider';
import {
  getLayoutConfigForms,
  getLayoutConfig,
  saveLayoutConfig,
  revertLayoutConfig,
  deleteLayoutConfig,
  getWorkspaceLayoutConfig,
  saveWorkspaceLayoutConfig,
  revertWorkspaceLayoutConfig,
  deleteWorkspaceLayoutConfig,
} from '@/api/layout-config.js';
import type { RequiredFieldWarning } from '@/api/layout-config.js';
import type {
  ConfigurableFormSummary,
  LayoutConfig,
  SaveLayoutConfigInput,
  FieldOverride,
  SectionOverride,
  ColumnOverride,
  RoleKey,
  FieldVisibility,
  ColumnVisibility,
} from '@plexica/types';
import { LAYOUT_ROLE_KEYS } from '@plexica/types';
import { FieldConfigTable } from './FieldConfigTable.js';
import { ColumnConfigTable } from './ColumnConfigTable.js';
import { SectionOrderList } from './SectionOrderList.js';
import { RolePreviewPanel } from './RolePreviewPanel.js';
import { RequiredFieldWarningDialog } from './RequiredFieldWarningDialog.js';
import type { RequiredFieldWarningItem } from './RequiredFieldWarningDialog.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Discriminated union: `scopeId` is required for workspace scope and
 * must not be provided for tenant scope (M-005 fix).
 */
export type LayoutConfigPanelProps =
  | {
      /** Tenant-scope layout config (default). No `scopeId` required. */
      scope: 'tenant';
      scopeId?: never;
    }
  | {
      /** Workspace-scope layout config. `scopeId` (workspace UUID) is required. */
      scope: 'workspace';
      scopeId: string;
    };

// ---------------------------------------------------------------------------
// Helpers: API dispatch
// ---------------------------------------------------------------------------

async function fetchConfig(
  scope: 'tenant' | 'workspace',
  formId: string,
  scopeId?: string
): Promise<LayoutConfig | null> {
  if (scope === 'workspace' && scopeId) {
    return getWorkspaceLayoutConfig(scopeId, formId);
  }
  return getLayoutConfig(formId);
}

async function persistConfig(
  scope: 'tenant' | 'workspace',
  formId: string,
  input: SaveLayoutConfigInput,
  etag?: string,
  scopeId?: string
): Promise<LayoutConfig> {
  if (scope === 'workspace' && scopeId) {
    return saveWorkspaceLayoutConfig(scopeId, formId, input, etag);
  }
  return saveLayoutConfig(formId, input, etag);
}

async function doRevert(
  scope: 'tenant' | 'workspace',
  formId: string,
  scopeId?: string
): Promise<LayoutConfig> {
  if (scope === 'workspace' && scopeId) {
    return revertWorkspaceLayoutConfig(scopeId, formId);
  }
  return revertLayoutConfig(formId);
}

async function doDelete(
  scope: 'tenant' | 'workspace',
  formId: string,
  scopeId?: string
): Promise<void> {
  if (scope === 'workspace' && scopeId) {
    return deleteWorkspaceLayoutConfig(scopeId, formId);
  }
  return deleteLayoutConfig(formId);
}

// ---------------------------------------------------------------------------
// Helpers: draft state builders from LayoutConfig
// ---------------------------------------------------------------------------

function configToFieldOverrides(config: LayoutConfig | null): FieldOverride[] {
  return config?.fields ?? [];
}

function configToSectionOverrides(config: LayoutConfig | null): SectionOverride[] {
  return config?.sections ?? [];
}

function configToColumnOverrides(config: LayoutConfig | null): ColumnOverride[] {
  return config?.columns ?? [];
}

// ---------------------------------------------------------------------------
// Helpers: order manipulation
// ---------------------------------------------------------------------------

function moveItem<T>(
  items: T[],
  getId: (item: T) => string,
  getOrder: (item: T) => number,
  setOrder: (item: T, order: number) => T,
  id: string,
  direction: 'up' | 'down'
): T[] {
  const sorted = [...items].sort((a, b) => getOrder(a) - getOrder(b));
  const idx = sorted.findIndex((item) => getId(item) === id);
  if (idx === -1) return items;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return items;

  const newItems = [...sorted];
  const aOrder = getOrder(newItems[idx]);
  const bOrder = getOrder(newItems[swapIdx]);
  newItems[idx] = setOrder(newItems[idx], bOrder);
  newItems[swapIdx] = setOrder(newItems[swapIdx], aOrder);
  return newItems;
}

// ---------------------------------------------------------------------------
// Helpers: parse API error shape (Constitution Art. 6.2)
// ---------------------------------------------------------------------------

function parseApiError(err: unknown): { code?: string; message?: string } {
  const e = err as {
    response?: { data?: { error?: { code?: string; message?: string } } };
    message?: string;
  };
  return e?.response?.data?.error ?? { message: e?.message ?? 'Unknown error' };
}

// ---------------------------------------------------------------------------
// LayoutConfigPanel
// ---------------------------------------------------------------------------

/**
 * Admin orchestrator panel for configuring layout overrides on plugin forms.
 *
 * @example
 * ```tsx
 * // Tenant-scope (settings page)
 * <LayoutConfigPanel scope="tenant" />
 *
 * // Workspace-scope (workspace admin panel)
 * <LayoutConfigPanel scope="workspace" scopeId={workspace.id} />
 * ```
 */
export function LayoutConfigPanel({ scope, scopeId }: LayoutConfigPanelProps) {
  // ── React Query client for cache invalidation after save (TD-036) ───────────
  const queryClient = useQueryClient();

  // ── Data loading state ────────────────────────────────────────────────────
  const [forms, setForms] = useState<ConfigurableFormSummary[]>([]);
  const [formsLoading, setFormsLoading] = useState(true);
  const [formsError, setFormsError] = useState<string | null>(null);

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [savedConfig, setSavedConfig] = useState<LayoutConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // ── Draft/editing state ───────────────────────────────────────────────────
  const [draftFields, setDraftFields] = useState<FieldOverride[]>([]);
  const [draftSections, setDraftSections] = useState<SectionOverride[]>([]);
  const [draftColumns, setDraftColumns] = useState<ColumnOverride[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // ── Save state ────────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  // ── Warning dialog state ──────────────────────────────────────────────────
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [, setPendingSaveInput] = useState<SaveLayoutConfigInput | null>(null);
  const [warningFields, setWarningFields] = useState<RequiredFieldWarningItem[]>([]);

  // ── Confirm-reset dialog state (M07: replaces window.confirm for Reset) ───
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  // ── Confirm-switch dialog state (M07: replaces window.confirm for form switch) ─
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);
  const [pendingSwitchFormId, setPendingSwitchFormId] = useState<string | null>(null);

  // ── Preview state ─────────────────────────────────────────────────────────
  const [previewRole, setPreviewRole] = useState<RoleKey | null>(null);

  // ── Derived: selected form schema ─────────────────────────────────────────
  const selectedForm = useMemo(
    () => forms.find((f) => f.formId === selectedFormId) ?? null,
    [forms, selectedFormId]
  );

  // ── Forms load: track whether auto-select has already fired (TD-026) ────────
  const autoSelectedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Load forms list
  // ---------------------------------------------------------------------------

  const loadForms = useCallback(async () => {
    setFormsLoading(true);
    setFormsError(null);
    try {
      const result = await getLayoutConfigForms();
      setForms(result);
      // Auto-select the first form only once — guard via ref so loadForms
      // has no dependency on selectedFormId (fixes TD-026 stale closure).
      if (result.length > 0 && !autoSelectedRef.current) {
        autoSelectedRef.current = true;
        setSelectedFormId(result[0].formId);
      }
    } catch (err) {
      const { message } = parseApiError(err);
      setFormsError(message ?? 'Failed to load configurable forms.');
    } finally {
      setFormsLoading(false);
    }
  }, []); // no deps — safe because auto-select guard uses a ref

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  // ---------------------------------------------------------------------------
  // Load config when form selection changes
  // ---------------------------------------------------------------------------

  const loadConfig = useCallback(
    async (formId: string) => {
      setConfigLoading(true);
      try {
        const config = await fetchConfig(scope, formId, scopeId);
        setSavedConfig(config);
        // Reset draft to saved state
        setDraftFields(configToFieldOverrides(config));
        setDraftSections(configToSectionOverrides(config));
        setDraftColumns(configToColumnOverrides(config));
        setIsDirty(false);
      } catch (err) {
        const { message } = parseApiError(err);
        toast.error(message ?? 'Failed to load layout config.');
        setSavedConfig(null);
        setDraftFields([]);
        setDraftSections([]);
        setDraftColumns([]);
      } finally {
        setConfigLoading(false);
      }
    },
    [scope, scopeId]
  );

  useEffect(() => {
    if (selectedFormId) {
      void loadConfig(selectedFormId);
    }
  }, [selectedFormId, loadConfig]);

  // ---------------------------------------------------------------------------
  // Draft mutation handlers
  // ---------------------------------------------------------------------------

  const markDirty = () => setIsDirty(true);

  const handleFieldOrderChange = useCallback((fieldId: string, direction: 'up' | 'down') => {
    setDraftFields((prev) =>
      moveItem(
        prev,
        (o) => o.fieldId,
        (o) => o.order,
        (o, order) => ({ ...o, order }),
        fieldId,
        direction
      )
    );
    markDirty();
  }, []);

  const handleFieldVisibilityChange = useCallback(
    (fieldId: string, role: RoleKey, next: FieldVisibility) => {
      setDraftFields((prev) =>
        prev.map((o) =>
          o.fieldId === fieldId ? { ...o, visibility: { ...o.visibility, [role]: next } } : o
        )
      );
      markDirty();
    },
    []
  );

  const handleFieldGlobalChange = useCallback(
    (fieldId: string, globalVisibility: FieldVisibility) => {
      setDraftFields((prev) =>
        prev.map((o) => (o.fieldId === fieldId ? { ...o, globalVisibility } : o))
      );
      markDirty();
    },
    []
  );

  const handleSectionOrderChange = useCallback((sectionId: string, direction: 'up' | 'down') => {
    setDraftSections((prev) =>
      moveItem(
        prev,
        (o) => o.sectionId,
        (o) => o.order,
        (o, order) => ({ ...o, order }),
        sectionId,
        direction
      )
    );
    markDirty();
  }, []);

  const handleColumnVisibilityChange = useCallback(
    (columnId: string, role: RoleKey, next: ColumnVisibility) => {
      setDraftColumns((prev) =>
        prev.map((o) =>
          o.columnId === columnId ? { ...o, visibility: { ...o.visibility, [role]: next } } : o
        )
      );
      markDirty();
    },
    []
  );

  const handleColumnGlobalChange = useCallback(
    (columnId: string, globalVisibility: ColumnVisibility) => {
      setDraftColumns((prev) =>
        prev.map((o) => (o.columnId === columnId ? { ...o, globalVisibility } : o))
      );
      markDirty();
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(
    async (acknowledgeWarnings = false) => {
      if (!selectedFormId) return;
      // TD-027: buildSaveInput inlined into handleSave as a proper useCallback
      // so all deps are declared correctly without eslint suppressors.
      const input: SaveLayoutConfigInput = {
        fields: draftFields,
        sections: draftSections,
        columns: draftColumns,
        ...(acknowledgeWarnings ? { acknowledgeWarnings: true } : {}),
      };
      const etag = savedConfig?.updatedAt
        ? new Date(savedConfig.updatedAt).toISOString()
        : undefined;

      setIsSaving(true);
      try {
        const updated = await persistConfig(scope, selectedFormId, input, etag, scopeId);
        setSavedConfig(updated);
        setDraftFields(configToFieldOverrides(updated));
        setDraftSections(configToSectionOverrides(updated));
        setDraftColumns(configToColumnOverrides(updated));
        setIsDirty(false);
        setWarningDialogOpen(false);
        setPendingSaveInput(null);
        // TD-036: invalidate the resolved-layout React Query cache so any
        // RolePreviewPanel instances on other pages see fresh data immediately.
        void queryClient.invalidateQueries({
          queryKey: ['layout-engine', 'resolved', selectedFormId],
        });
        toast.success('Layout configuration saved.');
      } catch (err) {
        const { code, message } = parseApiError(err);
        if (code === 'REQUIRED_FIELD_NO_DEFAULT') {
          // Extract warning details from structured error response
          const apiErr = err as {
            response?: { data?: { error?: { details?: { fields?: RequiredFieldWarning[] } } } };
          };
          const rawFields = apiErr?.response?.data?.error?.details?.fields ?? [];
          const warningItems: RequiredFieldWarningItem[] = rawFields.map((f) => {
            // TD-039: compute which roles actually have this field hidden in draftFields,
            // rather than showing the generic "affected roles" string.
            const override = draftFields.find((d) => d.fieldId === f.fieldId);
            let affectedRoles: string;
            if (override) {
              const hidden = LAYOUT_ROLE_KEYS.filter((role) => {
                const roleVis = override.visibility?.[role] ?? override.globalVisibility;
                return roleVis === 'hidden';
              });
              affectedRoles = hidden.length > 0 ? hidden.join(', ') : 'all roles';
            } else {
              affectedRoles = 'all roles';
            }
            return {
              fieldId: f.fieldId,
              label: f.label,
              role: affectedRoles,
            };
          });
          setWarningFields(warningItems);
          setPendingSaveInput(input);
          setWarningDialogOpen(true);
        } else {
          toast.error(message ?? 'Failed to save layout configuration.');
        }
      } finally {
        setIsSaving(false);
      }
    },
    [
      selectedFormId,
      savedConfig,
      scope,
      scopeId,
      draftFields,
      draftSections,
      draftColumns,
      queryClient,
    ]
  );

  const handleWarningProceed = useCallback(async () => {
    await handleSave(true);
  }, [handleSave]);

  const handleWarningCancel = useCallback(() => {
    setWarningDialogOpen(false);
    setPendingSaveInput(null);
    setWarningFields([]);
  }, []);

  // ---------------------------------------------------------------------------
  // Revert (single-step undo)
  // ---------------------------------------------------------------------------

  const handleRevert = useCallback(async () => {
    if (!selectedFormId) return;
    setIsSaving(true);
    try {
      const reverted = await doRevert(scope, selectedFormId, scopeId);
      setSavedConfig(reverted);
      setDraftFields(configToFieldOverrides(reverted));
      setDraftSections(configToSectionOverrides(reverted));
      setDraftColumns(configToColumnOverrides(reverted));
      setIsDirty(false);
      toast.success('Layout configuration reverted to previous version.');
    } catch (err) {
      const { message } = parseApiError(err);
      toast.error(message ?? 'Failed to revert layout configuration.');
    } finally {
      setIsSaving(false);
    }
  }, [selectedFormId, scope, scopeId]);

  // ---------------------------------------------------------------------------
  // Reset to manifest defaults (soft-delete saved config)
  // ---------------------------------------------------------------------------

  const handleResetToDefaults = useCallback(async () => {
    if (!selectedFormId) return;
    // M07: Open confirm dialog instead of window.confirm (WCAG violation)
    setConfirmResetOpen(true);
  }, [selectedFormId]);

  const handleConfirmReset = useCallback(async () => {
    if (!selectedFormId) return;
    setConfirmResetOpen(false);
    setIsSaving(true);
    try {
      await doDelete(scope, selectedFormId, scopeId);
      setSavedConfig(null);
      setDraftFields([]);
      setDraftSections([]);
      setDraftColumns([]);
      setIsDirty(false);
      toast.success('Layout configuration reset to plugin defaults.');
    } catch (err) {
      const { message } = parseApiError(err);
      toast.error(message ?? 'Failed to reset layout configuration.');
    } finally {
      setIsSaving(false);
    }
  }, [selectedFormId, scope, scopeId]);

  // ---------------------------------------------------------------------------
  // Discard unsaved changes
  // ---------------------------------------------------------------------------

  const handleDiscard = useCallback(() => {
    if (!isDirty) return;
    setDraftFields(configToFieldOverrides(savedConfig));
    setDraftSections(configToSectionOverrides(savedConfig));
    setDraftColumns(configToColumnOverrides(savedConfig));
    setIsDirty(false);
    toast.success('Unsaved changes discarded.');
  }, [isDirty, savedConfig]);

  // ---------------------------------------------------------------------------
  // Derived manifest data (hoisted above early returns to comply with
  // Rules of Hooks — useMemo must not be called conditionally).
  // ---------------------------------------------------------------------------

  // Build minimal ManifestField[] for FieldConfigTable from draft overrides
  // (we have fieldId/order in overrides; label/required come from the form schema
  // which is now included in ConfigurableFormSummary.schema — M09 fix)
  const manifestFields = useMemo(() => {
    // Use the full schema included in the summary (M09: schema is now always
    // populated by listConfigurableForms). Fall back to building stub entries
    // from overrides so the table always renders even if schema is absent.
    const schemaFields = selectedForm?.schema?.fields ?? [];

    if (schemaFields.length > 0) {
      return schemaFields.map((f) => ({
        fieldId: f.fieldId,
        label: f.label,
        required: f.required ?? false,
        order: f.order ?? 0,
        type: f.type ?? 'text',
        sectionId: f.sectionId ?? '',
        defaultValue: f.defaultValue ?? null,
      }));
    }
    // Stub from overrides (label = fieldId when no schema available)
    return draftFields.map((o) => ({
      fieldId: o.fieldId,
      label: o.fieldId,
      required: false,
      order: o.order,
      type: 'text',
      sectionId: '',
      defaultValue: null,
    }));
  }, [selectedForm, draftFields]);

  const manifestSections = useMemo(() => {
    const schemaSections =
      (
        selectedForm as
          | (ConfigurableFormSummary & {
              schema?: { sections?: Array<{ sectionId: string; label: string; order?: number }> };
            })
          | null
      )?.schema?.sections ?? [];
    if (schemaSections.length > 0) {
      return schemaSections.map((s) => ({
        sectionId: s.sectionId,
        label: s.label,
        order: s.order ?? 0,
      }));
    }
    return draftSections.map((o) => ({
      sectionId: o.sectionId,
      label: o.sectionId,
      order: o.order,
    }));
  }, [selectedForm, draftSections]);

  const manifestColumns = useMemo(() => {
    const schemaColumns =
      (
        selectedForm as
          | (ConfigurableFormSummary & {
              schema?: { columns?: Array<{ columnId: string; label: string; order?: number }> };
            })
          | null
      )?.schema?.columns ?? [];
    if (schemaColumns.length > 0) {
      return schemaColumns.map((c) => ({
        columnId: c.columnId,
        label: c.label,
        order: c.order ?? 0,
      }));
    }
    return draftColumns.map((o) => ({
      columnId: o.columnId,
      label: o.columnId,
      order: 0,
    }));
  }, [selectedForm, draftColumns]);

  // M08: Use LAYOUT_ROLE_KEYS from @plexica/types instead of a local duplicate array

  // ---------------------------------------------------------------------------
  // Loading / error states (after all hooks — Rules of Hooks compliant)
  // ---------------------------------------------------------------------------

  if (formsLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading configurable forms">
        <Skeleton shape="line" className="h-8 w-48" />
        <Skeleton shape="rect" className="h-48 w-full" />
      </div>
    );
  }

  if (formsError) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
        {formsError}
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <EmptyState
        icon={<Puzzle size={40} aria-hidden="true" />}
        title="No configurable forms"
        description="Install plugins that declare form schemas to configure their layout here."
        data-testid="layout-config-empty-forms"
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render: form selected
  // ---------------------------------------------------------------------------

  const hasColumns = draftColumns.length > 0;
  const hasSections = draftSections.length > 0;

  return (
    <div className="space-y-6" data-testid="layout-config-panel">
      {/* Form selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <label
          htmlFor="layout-config-form-select"
          className="text-sm font-medium text-foreground flex-shrink-0"
        >
          Configurable Form
        </label>
        <select
          id="layout-config-form-select"
          value={selectedFormId ?? ''}
          onChange={(e) => {
            if (isDirty) {
              // M07: Open confirm dialog instead of window.confirm (WCAG violation)
              setPendingSwitchFormId(e.target.value);
              setConfirmSwitchOpen(true);
              return;
            }
            setSelectedFormId(e.target.value);
          }}
          className="px-3 py-2 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Select a configurable form"
          disabled={isSaving}
        >
          {forms.map((f) => (
            <option key={f.formId} value={f.formId}>
              {f.label} ({f.pluginName})
            </option>
          ))}
        </select>

        {/* Last saved metadata */}
        {savedConfig && (
          <p className="text-xs text-muted-foreground ml-auto" aria-live="polite">
            {/* TD-028: show full updatedBy value on hover; truncate for display */}
            Last saved by{' '}
            <span title={savedConfig.updatedBy} className="font-medium">
              {savedConfig.updatedBy}
            </span>{' '}
            &middot; {new Date(savedConfig.updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      {/* Config loading indicator */}
      {configLoading && (
        <div className="space-y-2" aria-busy="true">
          <Skeleton shape="line" className="h-6 w-full" />
          <Skeleton shape="rect" className="h-40 w-full" />
        </div>
      )}

      {/* Empty state: no configurable form selected */}
      {!configLoading && !selectedFormId && (
        <EmptyState
          icon={<EyeOff size={32} aria-hidden="true" />}
          title="Select a form to configure"
          description="Choose a form above to view and edit its layout configuration."
        />
      )}

      {/* Main editing area */}
      {!configLoading && selectedFormId && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: config tabs */}
          <div className="xl:col-span-2 space-y-4">
            <Tabs defaultValue="fields">
              <TabsList>
                <TabsTrigger value="fields">
                  Fields{' '}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({manifestFields.length})
                  </span>
                </TabsTrigger>
                {hasSections && <TabsTrigger value="sections">Sections</TabsTrigger>}
                {hasColumns && <TabsTrigger value="columns">Columns</TabsTrigger>}
              </TabsList>

              <TabsContent value="fields" className="mt-4">
                {manifestFields.length === 0 ? (
                  <EmptyState
                    icon={<EyeOff size={28} aria-hidden="true" />}
                    title="No fields"
                    description="This form has no configurable fields."
                  />
                ) : (
                  <FieldConfigTable
                    fields={manifestFields}
                    overrides={draftFields}
                    roles={[...LAYOUT_ROLE_KEYS]}
                    onOrderChange={handleFieldOrderChange}
                    onVisibilityChange={handleFieldVisibilityChange}
                    onGlobalChange={handleFieldGlobalChange}
                    disabled={isSaving}
                  />
                )}
              </TabsContent>

              {hasSections && (
                <TabsContent value="sections" className="mt-4">
                  <SectionOrderList
                    sections={manifestSections}
                    overrides={draftSections}
                    onOrderChange={handleSectionOrderChange}
                    disabled={isSaving}
                  />
                </TabsContent>
              )}

              {hasColumns && (
                <TabsContent value="columns" className="mt-4">
                  <ColumnConfigTable
                    columns={manifestColumns}
                    overrides={draftColumns}
                    roles={[...LAYOUT_ROLE_KEYS]}
                    onVisibilityChange={handleColumnVisibilityChange}
                    onGlobalChange={handleColumnGlobalChange}
                    disabled={isSaving}
                  />
                </TabsContent>
              )}
            </Tabs>

            {/* Action bar */}
            <div
              className="flex flex-wrap items-center gap-2 pt-2 border-t border-border"
              aria-label="Layout config actions"
            >
              <Button
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving}
                aria-label="Save layout configuration changes"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </Button>

              {isDirty && (
                <Button
                  variant="outline"
                  onClick={handleDiscard}
                  disabled={isSaving}
                  aria-label="Discard unsaved changes"
                >
                  Discard
                </Button>
              )}

              {savedConfig?.previousVersion && (
                <Button
                  variant="secondary"
                  onClick={() => void handleRevert()}
                  disabled={isSaving || isDirty}
                  aria-label="Revert to previous saved version"
                >
                  Revert
                </Button>
              )}

              {savedConfig && (
                <Button
                  variant="destructive"
                  onClick={() => void handleResetToDefaults()}
                  disabled={isSaving}
                  className="ml-auto"
                  aria-label="Reset layout to plugin manifest defaults"
                >
                  Reset to defaults
                </Button>
              )}
            </div>

            {/* Dirty indicator */}
            {isDirty && (
              <p className="text-xs text-yellow-600" aria-live="polite" role="status">
                You have unsaved changes.
              </p>
            )}
          </div>

          {/* Right: role preview panel */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="preview-role-select"
                className="text-sm font-medium text-foreground flex-shrink-0"
              >
                Preview as role
              </label>
              <select
                id="preview-role-select"
                value={previewRole ?? ''}
                onChange={(e) =>
                  setPreviewRole(e.target.value ? (e.target.value as RoleKey) : null)
                }
                className="px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                aria-label="Select a role to preview the form as"
              >
                <option value="">— select role —</option>
                {LAYOUT_ROLE_KEYS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <RolePreviewPanel
              role={previewRole}
              fields={manifestFields}
              overrides={draftFields}
              sections={manifestSections}
              sectionOverrides={draftSections}
            />
          </div>
        </div>
      )}

      {/* Required field warning dialog */}
      <RequiredFieldWarningDialog
        open={warningDialogOpen}
        fields={warningFields}
        onCancel={handleWarningCancel}
        onProceed={() => void handleWarningProceed()}
        saving={isSaving}
      />

      {/* M07: Confirm reset dialog (replaces window.confirm) */}
      <Dialog
        open={confirmResetOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirmResetOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-reset-title"
          data-testid="confirm-reset-dialog"
          className="flex flex-col gap-4 max-w-sm w-full"
        >
          <h2 id="confirm-reset-title" className="text-base font-semibold text-foreground">
            Reset to defaults?
          </h2>
          <p className="text-sm text-foreground">
            Reset this form to plugin manifest defaults? This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={() => setConfirmResetOpen(false)}
              aria-label="Cancel reset"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmReset()}
              disabled={isSaving}
              aria-label="Confirm reset to manifest defaults"
            >
              Reset
            </Button>
          </div>
        </div>
      </Dialog>

      {/* M07: Confirm switch dialog (replaces window.confirm) */}
      <Dialog
        open={confirmSwitchOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setConfirmSwitchOpen(false);
            setPendingSwitchFormId(null);
          }
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-switch-title"
          data-testid="confirm-switch-dialog"
          className="flex flex-col gap-4 max-w-sm w-full"
        >
          <h2 id="confirm-switch-title" className="text-base font-semibold text-foreground">
            Discard unsaved changes?
          </h2>
          <p className="text-sm text-foreground">
            You have unsaved changes. Discard and switch form?
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmSwitchOpen(false);
                setPendingSwitchFormId(null);
              }}
              aria-label="Cancel form switch"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmSwitchOpen(false);
                if (pendingSwitchFormId) setSelectedFormId(pendingSwitchFormId);
                setPendingSwitchFormId(null);
              }}
              aria-label="Discard changes and switch form"
            >
              Discard &amp; Switch
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
