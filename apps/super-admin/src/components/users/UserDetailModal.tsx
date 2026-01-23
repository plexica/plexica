import { Button, Badge } from '@plexica/ui';
import { X } from 'lucide-react';

interface UserDetailModalProps {
  user: any;
  onClose: () => void;
}

export function UserDetailModal({ user, onClose }: UserDetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.email}</p>
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
            <Badge variant="default">{user.status}</Badge>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">User ID</p>
              <p className="text-sm text-foreground font-mono">{user.id}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Email</p>
              <p className="text-sm text-foreground">{user.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Tenant</p>
              <p className="text-sm text-foreground">{user.tenantName}</p>
              <p className="text-xs text-muted-foreground">{user.tenantSlug}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Roles</p>
              <div className="flex gap-1 flex-wrap">
                {user.roles.map((role: string) => (
                  <Badge key={role} variant="secondary" className="text-xs">
                    {role}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Activity Info */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Activity</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created:</span>
                <span className="text-foreground">{new Date(user.createdAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Last Login:</span>
                <span className="text-foreground">{new Date(user.lastLogin).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Actions</h3>
            <div className="flex gap-3">
              <Button variant="outline" size="sm">
                View in Keycloak
              </Button>
              <Button variant="outline" size="sm">
                Manage Roles
              </Button>
              <Button variant="danger" size="sm">
                Suspend User
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
