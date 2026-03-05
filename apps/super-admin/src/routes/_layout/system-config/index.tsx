// File: apps/super-admin/src/routes/_layout/system-config/index.tsx
//
// T008-48 — Super Admin System Config screen.
//
// Renders all system configuration entries grouped by category.
// Each entry renders an appropriate control based on its value type:
//   boolean → Switch with role="switch" and aria-checked
//   number  → Input[type=number]
//   string  → Input[type=text]
//
// Features:
//  - Grouped by `category` using <fieldset>/<legend>
//  - Dirty state tracking — Save button only enabled when changes exist
//  - Save persists mutations per changed key via useSystemConfig hook
//  - `maintenance_mode` key triggers a confirmation dialog (type "MAINTENANCE")
//  - Description hint text shown below each control
//  - Loading skeletons
//  - Error banner with retry

import { useState, useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle, RefreshCw, Save } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Skeleton,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@plexica/ui';
import { toast } from 'sonner';
import { useSystemConfig } from '@/hooks/useSystemConfig';
import type { SystemConfigEntry } from '@/api/admin';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/_layout/system-config/' as never)({
  component: SystemConfigPage,
});

// ---------------------------------------------------------------------------
// Maintenance Mode Confirmation Dialog
// ---------------------------------------------------------------------------
interface MaintenanceDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
}

function MaintenanceDialog({ open, onCancel, onConfirm, isConfirming }: MaintenanceDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const isValid = confirmText === 'MAINTENANCE';

  const handleClose = () => {
    setConfirmText('');
    onCancel();
  };

  const handleConfirm = () => {
    if (!isValid) return;
    setConfirmText('');
    onConfirm();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable Maintenance Mode</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Enabling maintenance mode will make the platform inaccessible to all regular users. This
            action should only be performed during planned downtime.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="maintenance-confirm">
              Type <span className="font-mono font-semibold text-foreground">MAINTENANCE</span> to
              confirm
            </Label>
            <Input
              id="maintenance-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="MAINTENANCE"
              aria-describedby="maintenance-confirm-hint"
            />
            <p id="maintenance-confirm-hint" className="text-xs text-muted-foreground">
              This action will take effect immediately.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            disabled={!isValid || isConfirming}
          >
            {isConfirming ? 'Enabling…' : 'Enable Maintenance Mode'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function ConfigSkeleton() {
  return (
    <div className="space-y-6">
      {[3, 2, 4].map((count, groupIdx) => (
        <Card key={groupIdx}>
          <CardContent className="pt-4">
            <fieldset>
              <Skeleton width={120} height={16} shape="line" className="mb-4" />
              <div className="space-y-4">
                {Array.from({ length: count }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton width={160} height={14} shape="line" />
                    <Skeleton width="100%" height={36} shape="rect" />
                    <Skeleton width="70%" height={12} shape="line" />
                  </div>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config control — renders the appropriate input for a value type
// ---------------------------------------------------------------------------
interface ConfigControlProps {
  entry: SystemConfigEntry;
  localValue: unknown;
  onChange: (key: string, value: unknown) => void;
}

function ConfigControl({ entry, localValue, onChange }: ConfigControlProps) {
  const { key, description } = entry;
  const inputId = `config-${key}`;
  const hintId = description ? `config-${key}-hint` : undefined;

  // Determine display type from the server value (not local, to avoid flicker)
  const isBoolean = typeof entry.value === 'boolean';
  const isNumber = typeof entry.value === 'number';

  if (isBoolean) {
    const checked = Boolean(localValue);
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={inputId}>{key}</Label>
          {description && (
            <p id={hintId} className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <Switch
          id={inputId}
          role="switch"
          aria-checked={checked}
          checked={checked}
          onCheckedChange={(val) => onChange(key, val)}
          aria-describedby={hintId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>{key}</Label>
      <Input
        id={inputId}
        type={isNumber ? 'number' : 'text'}
        value={String(localValue ?? '')}
        onChange={(e) =>
          onChange(
            key,
            isNumber ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
          )
        }
        placeholder={key}
        aria-describedby={hintId}
      />
      {description && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
function SystemConfigPage() {
  const { entries, isLoading, isError, error, refetch, updateEntryAsync, isUpdating } =
    useSystemConfig();

  // Local edits: key → new value
  const [localEdits, setLocalEdits] = useState<Record<string, unknown>>({});
  // Maintenance mode confirmation dialog
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  // Pending maintenance value (true = enable, false = disable)
  const [pendingMaintenanceValue, setPendingMaintenanceValue] = useState(false);
  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Compute effective values: server value overridden by local edits
  const effectiveValues = useMemo(() => {
    const map: Record<string, unknown> = {};
    for (const entry of entries) {
      map[entry.key] = entry.key in localEdits ? localEdits[entry.key] : entry.value;
    }
    return map;
  }, [entries, localEdits]);

  // Dirty: any local edit differs from server value
  const isDirty = useMemo(() => {
    for (const entry of entries) {
      if (entry.key in localEdits && localEdits[entry.key] !== entry.value) {
        return true;
      }
    }
    return false;
  }, [entries, localEdits]);

  // Group entries by category
  const grouped = useMemo(() => {
    const map = new Map<string, SystemConfigEntry[]>();
    for (const entry of entries) {
      const group = map.get(entry.category) ?? [];
      group.push(entry);
      map.set(entry.category, group);
    }
    return map;
  }, [entries]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  const handleChange = (key: string, value: unknown) => {
    // Special case: maintenance_mode = true requires confirmation
    if (key === 'maintenance_mode' && value === true) {
      setPendingMaintenanceValue(true);
      setMaintenanceDialogOpen(true);
      return;
    }
    setLocalEdits((prev) => ({ ...prev, [key]: value }));
  };

  const handleMaintenanceConfirm = () => {
    setLocalEdits((prev) => ({ ...prev, maintenance_mode: pendingMaintenanceValue }));
    setMaintenanceDialogOpen(false);
  };

  const handleMaintenanceCancel = () => {
    setMaintenanceDialogOpen(false);
    // Revert local edit for maintenance_mode if it was pending
    setLocalEdits((prev) => {
      const next = { ...prev };
      delete next['maintenance_mode'];
      return next;
    });
  };

  const handleSave = async () => {
    const changed = Object.entries(localEdits).filter(([key, value]) => {
      const serverEntry = entries.find((e) => e.key === key);
      return serverEntry && serverEntry.value !== value;
    });

    if (changed.length === 0) return;

    setIsSaving(true);

    const results = await Promise.allSettled(
      changed.map(([key, value]) => updateEntryAsync({ key, dto: { value } }))
    );

    setIsSaving(false);

    const errors = results
      .map((result, i) =>
        result.status === 'rejected'
          ? `${changed[i][0]}: ${result.reason instanceof Error ? result.reason.message : 'Unknown error'}`
          : null
      )
      .filter((e): e is string => e !== null);

    if (errors.length > 0) {
      toast.error(`Some settings failed to save:\n${errors.join('\n')}`);
    } else {
      setLocalEdits({});
      toast.success(`${changed.length} setting${changed.length === 1 ? '' : 's'} saved`);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            System Configuration
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage platform-wide configuration settings
          </p>
        </div>
        <Button onClick={() => void handleSave()} disabled={!isDirty || isSaving || isUpdating}>
          <Save className="h-4 w-4 mr-2" aria-hidden="true" />
          {isSaving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* Error banner */}
      {isError && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <span className="flex-1 text-sm">
            {error instanceof Error ? error.message : 'Failed to load system configuration.'}
          </span>
          <button
            type="button"
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-sm font-medium hover:bg-red-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Config groups */}
      {isLoading ? (
        <ConfigSkeleton />
      ) : (
        <>
          {grouped.size === 0 && !isError && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No configuration entries found.
            </p>
          )}
          {Array.from(grouped.entries()).map(([category, categoryEntries]) => (
            <Card key={category}>
              <CardContent className="pt-4">
                <fieldset>
                  <legend className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {category}
                  </legend>
                  <div className="space-y-5">
                    {categoryEntries.map((entry) => (
                      <ConfigControl
                        key={entry.key}
                        entry={entry}
                        localValue={effectiveValues[entry.key]}
                        onChange={handleChange}
                      />
                    ))}
                  </div>
                </fieldset>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* Maintenance mode confirmation */}
      <MaintenanceDialog
        open={maintenanceDialogOpen}
        onCancel={handleMaintenanceCancel}
        onConfirm={handleMaintenanceConfirm}
        isConfirming={isSaving}
      />
    </div>
  );
}
