// apps/super-admin/src/routes/_layout/plugins/extension-permissions.tsx
//
// T013-17: Super Admin Extension Permissions screen.
//
// Allows super admins to view and manage cross-plugin extension permissions.
// Shows which plugins are contributing to which slots, with grant/revoke
// actions protected by a confirmation dialog.
//
// Columns: Contributing Plugin | Target Slot | Status | Action
// ADR-031 safeguard: only Super Admin role has access to this route.
// FR-024, FR-026, US-004

import { useState, useEffect, useCallback, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Button,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Input,
} from '@plexica/ui';
import { AlertCircle, Search, ShieldCheck, ShieldX, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export const Route = createFileRoute('/_layout/plugins/extension-permissions' as never)({
  component: ExtensionPermissionsPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PermissionStatus = 'ACTIVE' | 'REVOKED' | 'PENDING';

interface ExtensionPermission {
  id: string;
  contributingPluginId: string;
  contributingPluginName: string;
  targetPluginId: string;
  targetSlotId: string;
  requiredPermission: string;
  status: PermissionStatus;
  grantedAt?: string;
  revokedAt?: string;
}

interface PermissionsResponse {
  permissions: ExtensionPermission[];
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }: { status: PermissionStatus }) {
  const variants: Record<PermissionStatus, string> = {
    ACTIVE: 'bg-green-100 text-green-800 border-green-200',
    REVOKED: 'bg-red-100 text-red-800 border-red-200',
    PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${variants[status]}`}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function PermissionRowSkeleton() {
  return (
    <tr aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton width="80%" height={16} shape="line" />
        </td>
      ))}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog (native <dialog> — no @plexica/ui Dialog dependency
// to avoid module federation boundary issues)
// ---------------------------------------------------------------------------
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: 'destructive' | 'default';
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmVariant = 'default',
  isPending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLButtonElement>(null);

  // Focus trap & Esc dismiss
  useEffect(() => {
    if (!open) return;
    firstFocusRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      {/* Panel */}
      <div
        ref={dialogRef}
        className="relative bg-background border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-foreground mb-2">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="text-sm text-muted-foreground mb-6">
          {message}
        </p>
        <div className="flex justify-end gap-3">
          <Button ref={firstFocusRef} variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? 'Processing…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
function ExtensionPermissionsPage() {
  const [permissions, setPermissions] = useState<ExtensionPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<string | null>(null); // id being mutated

  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    permissionId: string;
    action: 'grant' | 'revoke';
    pluginName: string;
    slotId: string;
  }>({ open: false, permissionId: '', action: 'grant', pluginName: '', slotId: '' });

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await (
        apiClient as unknown as { get: <T>(url: string) => Promise<T> }
      ).get<PermissionsResponse>('/api/v1/admin/extension-registry/permissions');
      setPermissions(res.permissions ?? []);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Failed to load extension permissions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = permissions.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.contributingPluginId.toLowerCase().includes(q) ||
      p.contributingPluginName.toLowerCase().includes(q) ||
      p.targetPluginId.toLowerCase().includes(q) ||
      p.targetSlotId.toLowerCase().includes(q) ||
      p.requiredPermission.toLowerCase().includes(q)
    );
  });

  // ── Action helpers ─────────────────────────────────────────────────────────
  const openConfirm = (p: ExtensionPermission, action: 'grant' | 'revoke') => {
    setConfirmState({
      open: true,
      permissionId: p.id,
      action,
      pluginName: p.contributingPluginName || p.contributingPluginId,
      slotId: p.targetSlotId,
    });
  };

  const handleConfirm = async () => {
    const { permissionId, action } = confirmState;
    setPending(permissionId);
    setConfirmState((s) => ({ ...s, open: false }));

    try {
      await (
        apiClient as unknown as { patch: <T>(url: string, body: unknown) => Promise<T> }
      ).patch(`/api/v1/admin/extension-registry/permissions/${permissionId}`, {
        action,
      });
      toast.success(
        action === 'grant' ? 'Permission granted successfully.' : 'Permission revoked successfully.'
      );
      await load();
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message ?? `Failed to ${action} permission.`);
    } finally {
      setPending(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Extension Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage cross-plugin extension permissions across the platform.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">
            Permissions{' '}
            {!isLoading && (
              <Badge variant="secondary" className="ml-2">
                {filtered.length}
              </Badge>
            )}
          </CardTitle>
          {/* Search */}
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search by plugin, slot, or permission…"
              className="pl-9"
              aria-label="Search extension permissions"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Extension permissions table">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Contributing Plugin
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Target Plugin
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Target Slot
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Required Permission
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => <PermissionRowSkeleton key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      {permissions.length === 0
                        ? 'No extension permissions configured.'
                        : 'No permissions match your search.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((permission) => (
                    <PermissionRow
                      key={permission.id}
                      permission={permission}
                      isPending={pending === permission.id}
                      onGrant={() => openConfirm(permission, 'grant')}
                      onRevoke={() => openConfirm(permission, 'revoke')}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={confirmState.open}
        title={
          confirmState.action === 'grant'
            ? 'Grant Extension Permission'
            : 'Revoke Extension Permission'
        }
        message={
          confirmState.action === 'grant'
            ? `Allow "${confirmState.pluginName}" to contribute to slot "${confirmState.slotId}"?`
            : `Revoke "${confirmState.pluginName}"'s access to slot "${confirmState.slotId}"? This will immediately hide its contributions from all workspaces.`
        }
        confirmLabel={confirmState.action === 'grant' ? 'Grant' : 'Revoke'}
        confirmVariant={confirmState.action === 'revoke' ? 'destructive' : 'default'}
        isPending={!!pending}
        onConfirm={() => void handleConfirm()}
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission row
// ---------------------------------------------------------------------------
interface PermissionRowProps {
  permission: ExtensionPermission;
  isPending: boolean;
  onGrant: () => void;
  onRevoke: () => void;
}

function PermissionRow({ permission, isPending, onGrant, onRevoke }: PermissionRowProps) {
  const canGrant = permission.status !== 'ACTIVE';
  const canRevoke = permission.status === 'ACTIVE';

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-4 py-3">
        <div className="font-medium text-foreground">
          {permission.contributingPluginName || permission.contributingPluginId}
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          {permission.contributingPluginId}
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-foreground">{permission.targetPluginId}</td>
      <td className="px-4 py-3 font-mono text-xs text-foreground">{permission.targetSlotId}</td>
      <td className="px-4 py-3">
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
          {permission.requiredPermission}
        </code>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={permission.status} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {canGrant && (
            <Button
              variant="outline"
              size="sm"
              onClick={onGrant}
              disabled={isPending}
              aria-label={`Grant permission for ${permission.contributingPluginId} to slot ${permission.targetSlotId}`}
            >
              <ShieldCheck className="h-3.5 w-3.5 mr-1" />
              Grant
            </Button>
          )}
          {canRevoke && (
            <Button
              variant="destructive"
              size="sm"
              onClick={onRevoke}
              disabled={isPending}
              aria-label={`Revoke permission for ${permission.contributingPluginId} from slot ${permission.targetSlotId}`}
            >
              <ShieldX className="h-3.5 w-3.5 mr-1" />
              Revoke
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
