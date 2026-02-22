// apps/super-admin/src/components/tenants/TenantDetailModal.tsx
// T001-23: Enhanced detail modal per Spec 001 design-spec Screen 3.
//
// Additions over original:
//  - DeletionCountdown banner (PENDING_DELETION only)
//  - Resend Invitation button (invitationStatus === 'pending')
//  - Reactivate button (PENDING_DELETION)
//  - Provisioning error section with Retry button
//  - Theme visual section (colors + logo preview)

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Badge, DeletionCountdown, ThemePreview, ConfirmDialog } from '@plexica/ui';
import { X, AlertTriangle, Mail, RotateCcw } from 'lucide-react';
import type { Tenant, TenantDetail } from '../../types';
import { apiClient } from '../../lib/api-client';

interface TenantDetailModalProps {
  tenant: Tenant;
  onClose: () => void;
}

export function TenantDetailModal({ tenant, onClose }: TenantDetailModalProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    { type: 'suspend' } | { type: 'activate' } | { type: 'reactivate' } | { type: 'delete' } | null
  >(null);

  // Fetch full tenant details (includes plugins, settings, theme)
  const { data: tenantDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['tenant', tenant.id],
    queryFn: () => apiClient.getTenant(tenant.id),
  });

  const detail: Tenant | TenantDetail = tenantDetail ?? tenant;
  const plugins = 'plugins' in detail ? (detail as TenantDetail).plugins : [];
  const settings =
    detail.settings && Object.keys(detail.settings).length > 0
      ? (detail.settings as Record<string, unknown>)
      : null;
  const themeData =
    detail.theme && Object.keys(detail.theme).length > 0
      ? (detail.theme as Record<string, string | undefined>)
      : null;

  // Provisioning error from settings
  const provisioningError =
    settings && 'provisioningError' in settings ? String(settings.provisioningError) : null;

  // Invitation status from settings
  const invitationStatus =
    settings && 'invitationStatus' in settings ? String(settings.invitationStatus) : null;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tenants'] });
    queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
    queryClient.invalidateQueries({ queryKey: ['tenant', tenant.id] });
  };

  const suspendMutation = useMutation({
    mutationFn: () => apiClient.suspendTenant(tenant.id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const activateMutation = useMutation({
    mutationFn: () => apiClient.activateTenant(tenant.id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteTenant(tenant.id),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const resendMutation = useMutation({
    mutationFn: () => apiClient.resendInvite(tenant.id),
    onSuccess: () => {
      setResendSuccess(true);
      invalidate();
    },
    onError: (err: Error) => setActionError(err.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'SUSPENDED':
        return 'danger';
      case 'PROVISIONING':
        return 'secondary';
      case 'PENDING_DELETION':
        return 'danger';
      default:
        return 'outline';
    }
  };

  const dbSchemaName = `tenant_${tenant.slug.replace(/-/g, '_')}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={`Tenant details: ${detail.name}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{detail.name}</h2>
              <p className="text-sm text-muted-foreground">{detail.slug}</p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded"
              aria-label="Close tenant detail"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Action error banner */}
          {actionError && (
            <div
              className="bg-destructive/10 border border-destructive/30 rounded-lg p-3"
              role="alert"
            >
              <p className="text-destructive text-sm">{actionError}</p>
            </div>
          )}

          {/* Resend success banner */}
          {resendSuccess && (
            <div
              className="bg-green-100 border border-green-300 rounded-lg p-3"
              role="status"
              aria-live="polite"
            >
              <p className="text-green-700 text-sm">Invitation email resent successfully.</p>
            </div>
          )}

          {/* DeletionCountdown banner — PENDING_DELETION only */}
          {detail.status === 'PENDING_DELETION' && detail.deletionScheduledAt && (
            <DeletionCountdown deletionScheduledAt={detail.deletionScheduledAt} variant="banner" />
          )}

          {/* Provisioning error banner */}
          {provisioningError && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3" role="alert">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Provisioning Error
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    {provisioningError}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Re-trigger provisioning by re-creating the tenant isn't possible;
                    // we surface this as a retry that calls the admin to act.
                    // Future: POST /admin/tenants/:id/retry-provision
                    setActionError('Manual retry is not yet implemented. Please contact support.');
                  }}
                  aria-label="Retry provisioning"
                >
                  <RotateCcw className="h-3 w-3 mr-1" aria-hidden="true" />
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            <Badge variant={getStatusBadgeVariant(detail.status)}>{detail.status}</Badge>
          </div>

          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Tenant ID</p>
              <p className="text-sm text-foreground font-mono">{detail.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Created At</p>
              <p className="text-sm text-foreground">
                {new Date(detail.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Updated At</p>
              <p className="text-sm text-foreground">
                {new Date(detail.updatedAt).toLocaleString()}
              </p>
            </div>
            {detail.deletionScheduledAt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Deletion Scheduled</p>
                <p className="text-sm text-foreground">
                  {new Date(detail.deletionScheduledAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Infrastructure */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Infrastructure</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Database Schema:</span>
                <span className="text-foreground font-mono">{dbSchemaName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Keycloak Realm:</span>
                <span className="text-foreground font-mono">{detail.slug}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Storage Bucket:</span>
                <span className="text-foreground font-mono">tenant-{detail.slug}</span>
              </div>
            </div>
          </div>

          {/* Theme section */}
          {themeData && (themeData.primaryColor || themeData.logoUrl) && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Theme</h3>
              <div className="flex items-start gap-4">
                {/* Color swatches */}
                <div className="flex items-center gap-2">
                  {themeData.primaryColor && (
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ background: themeData.primaryColor }}
                      title={`Primary: ${themeData.primaryColor}`}
                      aria-label={`Primary color: ${themeData.primaryColor}`}
                    />
                  )}
                  {themeData.secondaryColor && (
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ background: themeData.secondaryColor }}
                      title={`Secondary: ${themeData.secondaryColor}`}
                      aria-label={`Secondary color: ${themeData.secondaryColor}`}
                    />
                  )}
                  {themeData.accentColor && (
                    <div
                      className="w-6 h-6 rounded-full border border-border"
                      style={{ background: themeData.accentColor }}
                      title={`Accent: ${themeData.accentColor}`}
                      aria-label={`Accent color: ${themeData.accentColor}`}
                    />
                  )}
                </div>
                {/* Logo thumbnail */}
                {themeData.logoUrl && (
                  <img
                    src={themeData.logoUrl}
                    alt="Tenant logo"
                    className="h-8 max-w-[120px] object-contain border border-border rounded"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                {/* Live preview */}
                <div className="ml-auto">
                  <ThemePreview
                    primaryColor={themeData.primaryColor}
                    secondaryColor={themeData.secondaryColor}
                    accentColor={themeData.accentColor}
                    logoUrl={themeData.logoUrl}
                    fontFamily={themeData.fontFamily}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Plugins */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Installed Plugins ({plugins.length})
            </h3>
            {isDetailLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : plugins.length > 0 ? (
              <div className="space-y-2">
                {plugins.map((tp) => (
                  <div
                    key={tp.id}
                    className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{tp.plugin.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tp.plugin.version} &middot; {tp.plugin.category}
                      </p>
                    </div>
                    <Badge variant={tp.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {tp.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No plugins installed</p>
            )}
          </div>

          {/* Settings (raw, for debug — only when no provisioning error) */}
          {settings && !provisioningError && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Settings</h3>
              <pre className="bg-muted/50 rounded-lg p-3 text-xs text-foreground overflow-x-auto">
                {JSON.stringify(settings, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3 flex-wrap">
              {/* Suspend (ACTIVE only) */}
              {detail.status === 'ACTIVE' && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmAction({ type: 'suspend' })}
                  disabled={suspendMutation.isPending}
                  aria-label="Suspend tenant"
                >
                  {suspendMutation.isPending ? 'Suspending...' : 'Suspend Tenant'}
                </Button>
              )}

              {/* Activate (SUSPENDED only) */}
              {detail.status === 'SUSPENDED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmAction({ type: 'activate' })}
                  disabled={activateMutation.isPending}
                  aria-label="Activate tenant"
                >
                  {activateMutation.isPending ? 'Activating...' : 'Activate Tenant'}
                </Button>
              )}

              {/* Reactivate (PENDING_DELETION → SUSPENDED) */}
              {detail.status === 'PENDING_DELETION' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmAction({ type: 'reactivate' })}
                  disabled={activateMutation.isPending}
                  aria-label="Reactivate tenant — cancel scheduled deletion"
                >
                  {activateMutation.isPending ? 'Cancelling...' : 'Reactivate (Cancel Deletion)'}
                </Button>
              )}

              {/* Resend Invitation (pending only) */}
              {invitationStatus === 'pending' && !resendSuccess && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  aria-label="Resend invitation email to tenant admin"
                >
                  <Mail className="h-3 w-3 mr-1" aria-hidden="true" />
                  {resendMutation.isPending ? 'Sending...' : 'Resend Invitation'}
                </Button>
              )}

              {/* Delete (soft delete — ACTIVE or SUSPENDED) */}
              {(detail.status === 'ACTIVE' || detail.status === 'SUSPENDED') && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmAction({ type: 'delete' })}
                  disabled={deleteMutation.isPending}
                  aria-label="Schedule tenant for deletion"
                >
                  {deleteMutation.isPending ? 'Scheduling deletion...' : 'Delete Tenant'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4">
          <Button onClick={onClose} variant="outline" className="w-full" aria-label="Close">
            Close
          </Button>
        </div>
      </div>

      {/* Accessible confirmation dialogs (role="alertdialog") */}
      <ConfirmDialog
        open={confirmAction?.type === 'suspend'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Suspend Tenant"
        description={`Suspend tenant "${detail.name}"? This will disable access for all users.`}
        confirmLabel="Suspend"
        variant="destructive"
        onConfirm={() => {
          setConfirmAction(null);
          suspendMutation.mutate();
        }}
        onCancel={() => setConfirmAction(null)}
        loading={suspendMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'activate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Activate Tenant"
        description={`Activate tenant "${detail.name}"? Users will regain access.`}
        confirmLabel="Activate"
        onConfirm={() => {
          setConfirmAction(null);
          activateMutation.mutate();
        }}
        onCancel={() => setConfirmAction(null)}
        loading={activateMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'reactivate'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Cancel Deletion"
        description={`Cancel deletion of "${detail.name}"? The tenant will be moved to Suspended.`}
        confirmLabel="Cancel Deletion"
        onConfirm={() => {
          setConfirmAction(null);
          activateMutation.mutate();
        }}
        onCancel={() => setConfirmAction(null)}
        loading={activateMutation.isPending}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'delete'}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title="Delete Tenant"
        description={`Delete tenant "${detail.name}"? This will schedule it for permanent deletion in 30 days.`}
        confirmLabel="Schedule Deletion"
        variant="destructive"
        onConfirm={() => {
          setConfirmAction(null);
          deleteMutation.mutate();
        }}
        onCancel={() => setConfirmAction(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
