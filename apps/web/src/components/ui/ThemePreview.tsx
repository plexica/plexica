// File: apps/web/src/components/ui/ThemePreview.tsx
//
// T005-10: ThemePreview — a live mini-mockup of the tenant branding theme.
//
// Renders a compact, non-interactive preview card that reflects the supplied
// TenantTheme colors and fonts. Used in the Branding settings page so admins
// can see theme changes before saving.

import type { TenantTheme } from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThemePreviewProps {
  theme: TenantTheme;
  /** Accessible label for the preview region */
  ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ThemePreview({ theme, ariaLabel = 'Theme preview' }: ThemePreviewProps) {
  const { colors, fonts, logo } = theme;

  return (
    <section
      aria-label={ariaLabel}
      data-testid="theme-preview"
      style={{
        backgroundColor: colors.background,
        fontFamily: fonts.body,
        borderColor: colors.surface,
      }}
      className="rounded-lg border overflow-hidden shadow-sm w-full max-w-sm select-none"
    >
      {/* --- Simulated header bar --- */}
      <div
        data-testid="theme-preview-header"
        style={{ backgroundColor: colors.primary }}
        className="flex items-center gap-2 px-3 py-2"
      >
        {logo ? (
          <img
            src={logo}
            alt="Tenant logo preview"
            className="h-5 w-auto object-contain"
            data-testid="theme-preview-logo"
          />
        ) : (
          <div
            className="h-5 w-5 rounded flex items-center justify-center text-[10px] font-bold"
            style={{ backgroundColor: colors.secondary, color: colors.background }}
            data-testid="theme-preview-logo-placeholder"
          >
            P
          </div>
        )}
        <span
          style={{ color: colors.background, fontFamily: fonts.heading }}
          className="text-xs font-semibold truncate"
        >
          Plexica
        </span>
      </div>

      {/* --- Simulated content area --- */}
      <div style={{ backgroundColor: colors.surface }} className="px-3 py-3 space-y-2">
        {/* Heading sample */}
        <p
          style={{ color: colors.text, fontFamily: fonts.heading }}
          className="text-sm font-semibold"
          data-testid="theme-preview-heading"
        >
          Workspace Settings
        </p>

        {/* Body copy sample */}
        <p
          style={{ color: colors.textSecondary, fontFamily: fonts.body }}
          className="text-xs leading-relaxed"
          data-testid="theme-preview-body"
        >
          Manage your workspace members, permissions, and preferences in one place.
        </p>

        {/* CTA button sample */}
        <button
          type="button"
          disabled
          style={{ backgroundColor: colors.primary, color: colors.background }}
          className="mt-1 rounded px-3 py-1 text-xs font-medium opacity-90"
          data-testid="theme-preview-cta"
          aria-label="Primary action button sample"
        >
          Save changes
        </button>

        {/* Status indicators */}
        <div className="flex items-center gap-2 pt-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: colors.success }}
            aria-label="Success color sample"
            data-testid="theme-preview-success"
          />
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: colors.warning }}
            aria-label="Warning color sample"
            data-testid="theme-preview-warning"
          />
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: colors.error }}
            aria-label="Error color sample"
            data-testid="theme-preview-error"
          />
        </div>
      </div>
    </section>
  );
}
