// apps/web/src/components/workspace/WorkspaceSettingsForm.tsx
//
// T8.1 / T4 frontend: Typed settings form for workspace configuration.
// Per design-spec.md §3.3 — settings card with 4 fields:
//   defaultTeamRole, allowCrossWorkspaceSharing, maxMembers, isDiscoverable.
// Connects to PATCH /api/v1/workspaces/:id/settings (T4 API).
// Constitution Art. 5.3 — Zod client-side validation.
// Constitution Art. 1.3 — WCAG 2.1 AA (role="switch", aria-checked).

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { Button, Input, Label, Spinner } from '@plexica/ui';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@plexica/ui';
import { AlertCircle, Circle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Zod schema — Appendix D spec.md lines 2912–2957 (4 fields only)
// ---------------------------------------------------------------------------

export const WorkspaceSettingsSchema = z.object({
  defaultTeamRole: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
  allowCrossWorkspaceSharing: z.boolean().default(false),
  maxMembers: z.number().int().min(0).max(10000).default(0),
  isDiscoverable: z.boolean().default(true),
});

export type WorkspaceSettings = z.infer<typeof WorkspaceSettingsSchema>;

interface WorkspaceSettingsFormProps {
  workspaceId: string;
  /** Initial values loaded from the workspace */
  initialSettings: WorkspaceSettings;
  /** Whether the current user is an ADMIN of this workspace */
  isAdmin: boolean;
  onSaved?: (settings: WorkspaceSettings) => void;
}

// ---------------------------------------------------------------------------
// Toggle component with role="switch" and aria-checked (always string)
// ---------------------------------------------------------------------------

interface ToggleFieldProps {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleField({ id, label, hint, checked, disabled, onChange }: ToggleFieldProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <Label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked ? 'true' : 'false'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent',
          'transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2',
          'focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-input',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow ring-0',
            'transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspaceSettingsForm
// ---------------------------------------------------------------------------

export function WorkspaceSettingsForm({
  workspaceId,
  initialSettings,
  isAdmin,
  onSaved,
}: WorkspaceSettingsFormProps) {
  const [settings, setSettings] = useState<WorkspaceSettings>(initialSettings);
  const [saved, setSaved] = useState<WorkspaceSettings>(initialSettings);
  const [maxMembersInput, setMaxMembersInput] = useState(String(initialSettings.maxMembers));
  const [maxMembersError, setMaxMembersError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Field-by-field dirty check (not JSON.stringify) to avoid false positives
  const hasChanges =
    settings.defaultTeamRole !== saved.defaultTeamRole ||
    settings.allowCrossWorkspaceSharing !== saved.allowCrossWorkspaceSharing ||
    settings.maxMembers !== saved.maxMembers ||
    settings.isDiscoverable !== saved.isDiscoverable;

  const hasValidationErrors = maxMembersError !== null;
  const readonly = !isAdmin;

  // Sync if parent provides new initialSettings — use stable primitives as deps
  useEffect(() => {
    setSettings(initialSettings);
    setSaved(initialSettings);
    setMaxMembersInput(String(initialSettings.maxMembers));
  }, [
    initialSettings.defaultTeamRole,
    initialSettings.allowCrossWorkspaceSharing,
    initialSettings.maxMembers,
    initialSettings.isDiscoverable,
  ]);

  // Validate on blur with Zod; update settings state only on valid input
  function handleMaxMembersChange(raw: string) {
    setMaxMembersInput(raw);
    const result = WorkspaceSettingsSchema.shape.maxMembers.safeParse(
      raw === '' ? NaN : parseInt(raw, 10)
    );
    if (!result.success) {
      setMaxMembersError(result.error.issues[0]?.message ?? 'Invalid value');
      return;
    }
    setMaxMembersError(null);
    setSettings((prev) => ({ ...prev, maxMembers: result.data }));
  }

  function handleDiscard() {
    setSettings(saved);
    setMaxMembersInput(String(saved.maxMembers));
    setMaxMembersError(null);
    setErrorMessage(null);
    setSuccessMessage(null);
  }

  async function handleSave() {
    if (!isAdmin || hasValidationErrors || !hasChanges) return;
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiClient.patchWorkspaceSettings(workspaceId, settings);
      setSaved(settings);
      setSuccessMessage('Workspace settings saved');
      onSaved?.(settings);
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
      setErrorMessage(apiErr?.response?.data?.error?.message ?? 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Workspace Settings</h3>

      {/* Default Team Member Role */}
      <div className="py-3 border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Label htmlFor="defaultTeamRole" className="text-sm font-medium text-foreground">
              Default Team Member Role
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Role assigned to new team members
            </p>
          </div>
          {readonly ? (
            <span className="text-sm text-foreground font-medium">{settings.defaultTeamRole}</span>
          ) : (
            <Select
              value={settings.defaultTeamRole}
              onValueChange={(v) =>
                setSettings((prev) => ({
                  ...prev,
                  defaultTeamRole: v as 'ADMIN' | 'MEMBER',
                }))
              }
              disabled={isSaving}
            >
              <SelectTrigger id="defaultTeamRole" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">ADMIN</SelectItem>
                <SelectItem value="MEMBER">MEMBER</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Allow Cross-Workspace Sharing toggle */}
      <ToggleField
        id="allowCrossWorkspaceSharing"
        label="Allow Cross-Workspace Sharing"
        hint="Allows other workspace admins to share plugins with this workspace"
        checked={settings.allowCrossWorkspaceSharing}
        disabled={readonly || isSaving}
        onChange={(v) => setSettings((prev) => ({ ...prev, allowCrossWorkspaceSharing: v }))}
      />

      {/* Maximum Members */}
      <div className="py-3 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <Label htmlFor="maxMembers" className="text-sm font-medium text-foreground">
              Maximum Members
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Maximum workspace members (0 = unlimited)
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Input
              id="maxMembers"
              type="number"
              min={0}
              max={10000}
              value={maxMembersInput}
              onChange={(e) => setMaxMembersInput(e.target.value)}
              onBlur={(e) => handleMaxMembersChange(e.target.value)}
              disabled={readonly || isSaving}
              className={['w-24 text-right', maxMembersError ? 'border-destructive' : ''].join(' ')}
              aria-describedby={maxMembersError ? 'maxMembers-error' : undefined}
              aria-label="Maximum Members"
            />
            {maxMembersError && (
              <p
                id="maxMembers-error"
                role="alert"
                className="flex items-center gap-1 text-xs text-destructive"
              >
                <AlertCircle className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                {maxMembersError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Workspace Discoverable toggle */}
      <ToggleField
        id="isDiscoverable"
        label="Workspace Discoverable"
        hint="Make workspace visible in tenant directory"
        checked={settings.isDiscoverable}
        disabled={readonly || isSaving}
        onChange={(v) => setSettings((prev) => ({ ...prev, isDiscoverable: v }))}
      />

      {/* Unsaved changes indicator */}
      {hasChanges && !isSaving && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600">
          <Circle className="h-2 w-2 fill-amber-600" aria-hidden="true" />
          You have unsaved changes
        </p>
      )}

      {/* Success / error feedback */}
      {successMessage && (
        <p role="status" aria-live="polite" className="text-xs text-emerald-600">
          {successMessage}
        </p>
      )}
      {errorMessage && (
        <p
          role="alert"
          aria-live="polite"
          className="text-xs text-destructive flex items-center gap-1"
        >
          <AlertCircle className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          {errorMessage}
        </p>
      )}

      {/* Action buttons — ADMIN only */}
      {!readonly && (
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || hasValidationErrors || isSaving}
            aria-disabled={!hasChanges || hasValidationErrors || isSaving}
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" aria-hidden="true" />
                Saving...
              </span>
            ) : (
              'Save Settings'
            )}
          </Button>
          <Button variant="outline" onClick={handleDiscard} disabled={!hasChanges || isSaving}>
            Discard
          </Button>
        </div>
      )}
    </div>
  );
}
