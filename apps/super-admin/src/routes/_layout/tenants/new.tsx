// File: apps/super-admin/src/routes/_layout/tenants/new.tsx
//
// T008-45 — "Create Tenant" page that hosts the ProvisioningWizard.
// Route: /tenants/new (nested under _layout, so auth guard inherited).
//
// Spec 008 Admin Interfaces — Super Admin Phase 6

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ProvisioningWizard } from '@/components/ProvisioningWizard';

export const Route = createFileRoute('/_layout/tenants/new' as never)({
  component: NewTenantPage,
});

function NewTenantPage() {
  const navigate = useNavigate();

  const handleCancel = () => {
    void navigate({ to: '/_layout/tenants' as never });
  };

  return (
    <div className="py-4">
      <ProvisioningWizard onCancel={handleCancel} />
    </div>
  );
}
