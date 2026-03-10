// File: apps/web/src/routes/settings.layout-configuration.tsx
//
// T014-23 — Layout Configuration settings tab component.
// Spec 014 Frontend Layout Engine — FR-011, FR-012, FR-015.
//
// Renders the LayoutConfigPanel at both tenant and (optionally) workspace scope.
// Gated by the ENABLE_LAYOUT_ENGINE feature flag (Constitution Art. 9.1).
// Admin-only: users without tenant_admin or tenant_owner role are shown a
// permission message.
//
// Used in settings.tsx as <LayoutConfigurationTab />.

import { useAuthStore } from '@/stores/auth-store';
import { useFeatureFlag } from '@/lib/feature-flags';
import { LayoutConfigPanel } from '@/components/layout-engine/LayoutConfigPanel.js';

// ---------------------------------------------------------------------------
// LayoutConfigurationTab
// ---------------------------------------------------------------------------

/**
 * Layout Configuration tab content for the workspace Settings page.
 *
 * Gated by:
 *   1. ENABLE_LAYOUT_ENGINE feature flag
 *   2. Tenant admin role (tenant_admin | tenant_owner | admin)
 *
 * @example
 * ```tsx
 * <TabsContent value="layout" className="mt-6">
 *   <LayoutConfigurationTab />
 * </TabsContent>
 * ```
 */
export function LayoutConfigurationTab() {
  const layoutEngineEnabled = useFeatureFlag('ENABLE_LAYOUT_ENGINE');
  const { user } = useAuthStore();

  // Flag guard — should not render unless flag is on, but defensive check here
  if (!layoutEngineEnabled) {
    return null;
  }

  // Role guard: only tenant admins may configure layouts
  const isAdmin =
    user?.roles?.some((r: string) =>
      ['tenant_admin', 'tenant_owner', 'admin', 'super_admin'].includes(r)
    ) ?? false;

  if (!isAdmin) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <p className="text-muted-foreground text-sm">
          You do not have permission to configure layout settings. Please contact your tenant
          administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-1">Layout Configuration</h2>
        <p className="text-sm text-muted-foreground">
          Customise field ordering, per-role visibility, section ordering, and column visibility for
          plugin-provided forms. Changes apply to all users in this tenant. Workspace admins can
          further override these settings at the workspace level.
        </p>
      </div>

      {/* Tenant-scope panel */}
      <div className="bg-card border border-border rounded-lg p-6">
        <LayoutConfigPanel scope="tenant" />
      </div>
    </div>
  );
}
