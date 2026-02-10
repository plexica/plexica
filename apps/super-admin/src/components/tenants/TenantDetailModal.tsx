import { Button, Badge } from '@plexica/ui';
import { X } from 'lucide-react';
import { Tenant } from '../../types';

interface TenantDetailModalProps {
  tenant: Tenant;
  onClose: () => void;
}

export function TenantDetailModal({ tenant, onClose }: TenantDetailModalProps) {
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'SUSPENDED':
        return 'danger';
      case 'PROVISIONING':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{tenant.name}</h2>
              <p className="text-sm text-muted-foreground">{tenant.slug}</p>
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
          {/* Status Badge */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">Status:</span>
            <Badge variant={getStatusBadgeVariant(tenant.status)}>{tenant.status}</Badge>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Tenant ID</p>
              <p className="text-sm text-foreground font-mono">{tenant.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Created At</p>
              <p className="text-sm text-foreground">
                {new Date(tenant.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Updated At</p>
              <p className="text-sm text-foreground">
                {new Date(tenant.updatedAt).toLocaleString()}
              </p>
            </div>
            {tenant.suspendedAt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Suspended At</p>
                <p className="text-sm text-foreground">
                  {new Date(tenant.suspendedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Infrastructure Info */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Infrastructure</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Database Schema:</span>
                <span className="text-foreground font-mono">{tenant.slug}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Keycloak Realm:</span>
                <span className="text-foreground font-mono">{tenant.slug}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">MinIO Bucket:</span>
                <span className="text-foreground font-mono">{tenant.slug}</span>
              </div>
            </div>
          </div>

          {/* Statistics Placeholder */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Statistics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Members</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">Plugins</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">API Calls</p>
                <p className="text-xl font-bold text-foreground">-</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Detailed statistics coming in future release
            </p>
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3">
              <Button variant="outline" size="sm">
                View Details
              </Button>
              <Button variant="outline" size="sm">
                Manage Settings
              </Button>
              {tenant.status === 'ACTIVE' ? (
                <Button variant="danger" size="sm">
                  Suspend Tenant
                </Button>
              ) : tenant.status === 'SUSPENDED' ? (
                <Button variant="outline" size="sm">
                  Activate Tenant
                </Button>
              ) : null}
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
