import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Scope coverage to Spec 005 deliverables only.
      // Pre-existing files outside Spec 005 scope are intentionally excluded
      // so the 80% threshold enforces quality on the files this spec owns.
      // Additional files will be added as their own specs add tests.
      include: [
        // Layout shell (T005-01)
        'src/components/Layout/AppLayout.tsx',
        'src/components/Layout/Breadcrumbs.tsx',
        'src/components/Layout/Header.tsx',
        'src/components/Layout/SidebarNav.tsx',
        // Auth warning (T005-17)
        'src/components/AuthWarningBanner.tsx',
        // Plugin not found (T005-03)
        'src/components/PluginNotFoundPage.tsx',
        // Widget container (T005-05)
        'src/components/WidgetContainer.tsx',
        // UI primitives (T005-09, T005-10, T005-11)
        'src/components/ui/ColorPickerField.tsx',
        'src/components/ui/FontSelector.tsx',
        'src/components/ui/ThemePreview.tsx',
        // Theme context (T005-06, T005-07)
        'src/contexts/ThemeContext.tsx',
        // Utilities (T005-06, T005-08, T005-13)
        'src/lib/contrast-utils.ts',
        'src/lib/feature-flags.ts',
        'src/lib/font-loader.ts',
        // Plugin route enforcement (T005-03)
        'src/lib/plugin-routes.tsx',
        // Branding settings (T005-12)
        'src/routes/settings.branding.tsx',
        // Auth store (T005-14 through T005-17)
        'src/stores/auth.store.ts',
        // Spec 008 Admin components (T008-60)
        'src/components/PermissionGroupAccordion.tsx',
        'src/components/AuditLogTable.tsx',
        'src/components/DestructiveConfirmModal.tsx',
        // Spec 008 hooks (T008-61)
        'src/hooks/useTenantAdminDashboard.ts',
        'src/hooks/useUsers.ts',
        'src/hooks/useTeams.ts',
        'src/hooks/useRoles.ts',
        // Spec 008 API client (T008-39)
        'src/api/admin.ts',
        // Spec 009 Workspace Management components (T8, T9)
        'src/components/workspace/WorkspaceSettingsForm.tsx',
        'src/components/workspace/SharePluginDialog.tsx',
        'src/components/workspace/SharedResourceRow.tsx',
        'src/components/workspace/RevokeShareDialog.tsx',
        'src/components/workspace/SharingDisabledEmptyState.tsx',
        'src/components/workspace/SharedResourcesList.tsx',
        'src/components/WorkspaceSwitcher.tsx',
        // Spec 011 Workspace Hierarchy & Templates components (T011-20 through T011-25)
        'src/components/workspace/WorkspaceTreeNode.tsx',
        'src/components/workspace/WorkspaceTreeView.tsx',
        'src/components/workspace/TemplateCard.tsx',
        'src/components/workspace/TemplatePickerGrid.tsx',
        'src/components/workspace/PluginToggleCard.tsx',
        'src/components/workspace/MoveWorkspaceDialog.tsx',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/routeTree.gen.ts',
        // Framework entry point — createRootRoute + import.meta.env cannot be
        // unit-tested in jsdom without a full TanStack Router test harness.
        'src/routes/__root.tsx',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
