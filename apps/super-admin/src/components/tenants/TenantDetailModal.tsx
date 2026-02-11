import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Badge } from '@plexica/ui';
import { X, AlertTriangle } from 'lucide-react';
import type { Tenant, TenantDetail } from '../../types';
import { apiClient } from '../../lib/api-client';

interface TenantDetailModalProps {
  tenant: Tenant;
  onClose: () => void;
}

export function TenantDetailModal({ tenant, onClose }: TenantDetailModalProps) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch full tenant details (includes plugins relation, settings, theme)
  const { data: tenantDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['tenant', tenant.id],
    queryFn: () => apiClient.getTenant(tenant.id),
  });

  const detail: Tenant | TenantDetail = tenantDetail ?? tenant;
  const plugins = 'plugins' in detail ? (detail as TenantDetail).plugins : [];
  const settings =
    detail.settings && Object.keys(detail.settings).length > 0 ? detail.settings : null;
  const theme = detail.theme && Object.keys(detail.theme).length > 0 ? detail.theme : null;

  // Check for provisioning error stored in settings
  const provisioningError =
    settings && typeof settings === 'object' && 'provisioningError' in settings
      ? (settings as Record<string, unknown>).provisioningError
      : null;

  // Suspend mutation
  const suspendMutation = useMutation({
    mutationFn: () => apiClient.suspendTenant(tenant.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenant.id] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  // Activate mutation
  const activateMutation = useMutation({
    mutationFn: () => apiClient.activateTenant(tenant.id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
      queryClient.invalidateQueries({ queryKey: ['tenant', tenant.id] });
    },
    onError: (err: Error) => setActionError(err.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteTenant(tenant.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      queryClient.invalidateQueries({ queryKey: ['tenants-stats'] });
      onClose();
    },
    onError: (err: Error) => setActionError(err.message),
  });

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

  // Infrastructure names use underscores for DB schema
  const dbSchemaName = `tenant_${tenant.slug.replace(/-/g, '_')}`;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{detail.name}</h2>
              <p className="text-sm text-muted-foreground">{detail.slug}</p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error Banner */}
          {actionError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="text-destructive text-sm">{actionError}</p>
            </div>
          )}

          {/* Provisioning Error Banner */}
          {provisioningError !== null && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  Provisioning Error
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  {String(provisioningError)}
                </p>
              </div>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            <Badge variant={getStatusBadgeVariant(detail.status)}>{detail.status}</Badge>
          </div>

          {/* Basic Info */}
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
          </div>

          {/* Infrastructure Info */}
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
                <span className="text-foreground font-mono text-muted-foreground/60">
                  {detail.slug}{' '}
                  <span className="text-xs text-muted-foreground">(not provisioned)</span>
                </span>
              </div>
            </div>
          </div>

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

          {/* Settings */}
          {settings && !provisioningError && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Settings</h3>
              <pre className="bg-muted/50 rounded-lg p-3 text-xs text-foreground overflow-x-auto">
                {JSON.stringify(settings, null, 2)}
              </pre>
            </div>
          )}

          {/* Theme */}
          {theme && (
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Theme</h3>
              <pre className="bg-muted/50 rounded-lg p-3 text-xs text-foreground overflow-x-auto">
                {JSON.stringify(theme, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3 flex-wrap">
              {detail.status === 'ACTIVE' ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(
                        `Suspend tenant "${detail.name}"? This will disable access for all users.`
                      )
                    ) {
                      suspendMutation.mutate();
                    }
                  }}
                  disabled={suspendMutation.isPending}
                >
                  {suspendMutation.isPending ? 'Suspending...' : 'Suspend Tenant'}
                </Button>
              ) : detail.status === 'SUSPENDED' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm(`Activate tenant "${detail.name}"?`)) {
                      activateMutation.mutate();
                    }
                  }}
                  disabled={activateMutation.isPending}
                >
                  {activateMutation.isPending ? 'Activating...' : 'Activate Tenant'}
                </Button>
              ) : null}
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (
                    confirm(
                      `Delete tenant "${detail.name}"? This will mark the tenant for deletion.`
                    )
                  ) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Tenant'}
              </Button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-6 py-4">
          <Button onClick={onClose} variant="outline" className="w-full">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
