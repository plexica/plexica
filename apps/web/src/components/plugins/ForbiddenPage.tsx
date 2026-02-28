// apps/web/src/components/plugins/ForbiddenPage.tsx
//
// 403 Forbidden page shown when the current user lacks the tenant_admin role.
// Spec T004-32: RBAC guard for the Extensions page.

import { Link } from '@tanstack/react-router';
import { Button } from '@plexica/ui';
import { ShieldOff } from 'lucide-react';

export function ForbiddenPage() {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[400px] text-center px-4"
      aria-labelledby="forbidden-heading"
    >
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
        <ShieldOff className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 id="forbidden-heading" className="text-2xl font-bold text-foreground mb-2">
        Access Denied
      </h1>
      <p className="text-muted-foreground mb-6 max-w-sm">
        You don&apos;t have permission to manage extensions. Contact your administrator to request
        access.
      </p>
      <Link to="/">
        <Button variant="secondary">Go to Dashboard</Button>
      </Link>
    </div>
  );
}
