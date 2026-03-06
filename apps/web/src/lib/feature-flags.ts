// apps/web/src/lib/feature-flags.ts
//
// Lightweight feature flag system (Constitution Art. 9.1).
// All flags default to `false` unless set via environment variables.
// Flags are evaluated at runtime so they can be toggled without a rebuild
// by exporting them from the Vite config's `define` block.

/**
 * Supported feature flag names.
 * Add new flags here and document them in the table below.
 *
 * | Flag name                   | Default | Description                                      |
 * |-----------------------------|---------|--------------------------------------------------|
 * | ENABLE_NEW_SIDEBAR          | false   | Use redesigned SidebarNav instead of Sidebar.tsx |
 * | ENABLE_TENANT_BRANDING      | false   | Show branding settings & live theme preview      |
 * | ENABLE_AUTH_WARNINGS        | false   | Display banner when token refresh has failed     |
 * | ENABLE_DARK_MODE            | false   | Expose dark-mode toggle in UI                    |
 * | ENABLE_PLUGIN_WIDGETS       | false   | Allow plugins to embed cross-plugin widgets      |
 * | ENABLE_ADMIN_INTERFACES     | false   | Show Tenant Admin portal routes (Spec 008)       |
 * | ENABLE_WORKSPACE_HIERARCHY | false   | Show workspace hierarchy tree & template picker (Spec 011) |
 */
export type FeatureFlagName =
  | 'ENABLE_NEW_SIDEBAR'
  | 'ENABLE_TENANT_BRANDING'
  | 'ENABLE_AUTH_WARNINGS'
  | 'ENABLE_DARK_MODE'
  | 'ENABLE_PLUGIN_WIDGETS'
  | 'ENABLE_ADMIN_INTERFACES'
  | 'ENABLE_WORKSPACE_HIERARCHY';

/**
 * Returns `true` when the given feature flag is enabled.
 *
 * Flags are read from:
 *   1. Vite `import.meta.env` (injected at build time via `define`)
 *   2. Falls back to `false` when not set
 *
 * Usage:
 *   import { useFeatureFlag } from '@/lib/feature-flags';
 *   const isEnabled = useFeatureFlag('ENABLE_NEW_SIDEBAR');
 */
export function useFeatureFlag(flag: FeatureFlagName): boolean {
  // Vite replaces `import.meta.env.VITE_*` at build time.
  // We use a string map instead of direct property access so the function
  // remains testable without Vite-specific transforms.
  const envKey = `VITE_${flag}` as keyof ImportMetaEnv;
  const raw = import.meta.env[envKey];
  return raw === 'true' || raw === true;
}
