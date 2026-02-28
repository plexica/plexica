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
 * | ENABLE_TENANT_THEMING       | false   | Show branding settings & live theme preview      |
 * | ENABLE_AUTH_WARNING_BANNER  | false   | Display banner when token refresh has failed     |
 * | ENABLE_DARK_MODE            | false   | Expose dark-mode toggle in UI                    |
 */
export type FeatureFlagName =
  | 'ENABLE_NEW_SIDEBAR'
  | 'ENABLE_TENANT_THEMING'
  | 'ENABLE_AUTH_WARNING_BANNER'
  | 'ENABLE_DARK_MODE';

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
