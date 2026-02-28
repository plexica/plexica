// File: apps/web/src/routes/settings.branding.tsx
//
// T005-12: Branding settings page component.
//
// Allows tenant admins to customise:
//   - Colors  (primary, secondary, background, surface, text, textSecondary,
//              error, success, warning)
//   - Fonts   (heading, body, mono)
//   - Logo    (HTTPS URL)
//
// Gated by the ENABLE_TENANT_THEMING feature flag (Constitution Art. 9.1).
// Only rendered when the flag is on — see settings.tsx for the tab wrapper.
//
// Save path: PATCH /api/v1/tenant/settings { theme: { colors, fonts, logo } }

import { useState, useCallback } from 'react';
import { useTenantTheme } from '@/contexts/ThemeContext';
import { useFeatureFlag } from '@/lib/feature-flags';
import { ColorPickerField } from '@/components/ui/ColorPickerField';
import { FontSelector } from '@/components/ui/FontSelector';
import { ThemePreview } from '@/components/ui/ThemePreview';
import { FONT_CATALOG } from '@plexica/types';
import apiClient from '@/lib/api-client.js';
import type { TenantTheme, TenantThemeColors, TenantThemeFonts } from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a font display-name or ID to the catalog ID (FontSelector speaks IDs). */
function toFontId(nameOrId: string): string {
  // Direct ID match
  const byId = FONT_CATALOG.find((f) => f.id === nameOrId);
  if (byId) return byId.id;
  // Display-name match (case-insensitive)
  const byName = FONT_CATALOG.find((f) => f.name.toLowerCase() === nameOrId.toLowerCase());
  if (byName) return byName.id;
  // Fallback — return as-is (font-loader handles unknown gracefully)
  return nameOrId;
}

/** Map a catalog font ID back to its display name for CSS / theme storage. */
function toFontName(id: string): string {
  return FONT_CATALOG.find((f) => f.id === id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Color field definitions
// ---------------------------------------------------------------------------

interface ColorField {
  key: keyof TenantThemeColors;
  label: string;
  contrastKey?: keyof TenantThemeColors;
}

const COLOR_FIELDS: ColorField[] = [
  { key: 'primary', label: 'Primary', contrastKey: 'background' },
  { key: 'secondary', label: 'Secondary', contrastKey: 'background' },
  { key: 'background', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text', contrastKey: 'background' },
  { key: 'textSecondary', label: 'Secondary Text', contrastKey: 'background' },
  { key: 'error', label: 'Error', contrastKey: 'background' },
  { key: 'success', label: 'Success', contrastKey: 'background' },
  { key: 'warning', label: 'Warning', contrastKey: 'background' },
];

// ---------------------------------------------------------------------------
// BrandingTab component
// ---------------------------------------------------------------------------

export function BrandingTab() {
  const isEnabled = useFeatureFlag('ENABLE_TENANT_THEMING');
  const { tenantTheme, refreshTenantTheme } = useTenantTheme();

  // Local draft state for live preview (not yet saved)
  const [draft, setDraft] = useState<TenantTheme>(() => ({
    logo: tenantTheme.logo,
    colors: { ...tenantTheme.colors },
    fonts: { ...tenantTheme.fonts },
  }));

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // -------------------------------------------------------------------
  // Handlers — ALL hooks must be declared before any early return
  //            (react-hooks/rules-of-hooks).  The feature-flag guard
  //            is moved to just before the render return below.
  // -------------------------------------------------------------------

  const handleColorChange = useCallback((key: keyof TenantThemeColors, value: string) => {
    setDraft((prev) => ({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }));
    setSaveSuccess(false);
  }, []);

  const handleFontChange = useCallback((key: keyof TenantThemeFonts, fontId: string) => {
    const fontName = toFontName(fontId);
    setDraft((prev) => ({
      ...prev,
      fonts: { ...prev.fonts, [key]: fontName },
    }));
    setSaveSuccess(false);
  }, []);

  const handleLogoChange = useCallback((url: string) => {
    setDraft((prev) => ({ ...prev, logo: url.trim() || null }));
    setSaveSuccess(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      await apiClient.patch('/api/v1/tenant/settings', { theme: draft });
      setSaveSuccess(true);
      // Refresh context so ThemeContext re-fetches and applies the new theme
      await refreshTenantTheme();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save branding settings.');
    } finally {
      setSaving(false);
    }
  }, [draft, refreshTenantTheme]);

  const handleReset = useCallback(() => {
    setDraft({
      logo: tenantTheme.logo,
      colors: { ...tenantTheme.colors },
      fonts: { ...tenantTheme.fonts },
    });
    setSaveError(null);
    setSaveSuccess(false);
  }, [tenantTheme]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  // Gate — feature flag off → nothing rendered.
  // Placed AFTER all hook declarations to satisfy rules-of-hooks.
  if (!isEnabled) return null;

  return (
    <section aria-label="Branding settings" data-testid="branding-tab">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">Branding</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customise the colors, fonts, and logo for your tenant workspace.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_auto]">
        {/* ── Left: form fields ── */}
        <div className="space-y-8">
          {/* Logo URL */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Logo</h3>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="branding-logo-url" className="text-sm font-medium text-foreground">
                Logo URL
              </label>
              <input
                id="branding-logo-url"
                type="url"
                value={draft.logo ?? ''}
                onChange={(e) => handleLogoChange(e.target.value)}
                placeholder="https://cdn.example.com/logo.svg"
                className="h-9 w-full max-w-sm rounded border border-border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="branding-logo-url"
                aria-label="Logo URL"
              />
              <p className="text-xs text-muted-foreground">
                Must be an HTTPS URL. Leave empty to use the default placeholder.
              </p>
            </div>
          </div>

          {/* Colors */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Colors</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {COLOR_FIELDS.map(({ key, label, contrastKey }) => (
                <ColorPickerField
                  key={key}
                  label={label}
                  value={draft.colors[key]}
                  contrastWith={contrastKey ? draft.colors[contrastKey] : undefined}
                  onChange={(hex) => handleColorChange(key, hex)}
                  disabled={saving}
                />
              ))}
            </div>
          </div>

          {/* Fonts */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Fonts</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FontSelector
                label="Heading Font"
                value={toFontId(draft.fonts.heading)}
                onChange={(id) => handleFontChange('heading', id)}
                disabled={saving}
              />
              <FontSelector
                label="Body Font"
                value={toFontId(draft.fonts.body)}
                onChange={(id) => handleFontChange('body', id)}
                disabled={saving}
              />
              <FontSelector
                label="Monospace Font"
                value={toFontId(draft.fonts.mono)}
                onChange={(id) => handleFontChange('mono', id)}
                disabled={saving}
              />
            </div>
          </div>

          {/* Save / Reset actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="branding-save-button"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="branding-reset-button"
            >
              Reset
            </button>
          </div>

          {/* Feedback messages */}
          {saveError && (
            <p role="alert" className="text-sm text-destructive" data-testid="branding-save-error">
              {saveError}
            </p>
          )}
          {saveSuccess && (
            <p role="status" className="text-sm text-success" data-testid="branding-save-success">
              Branding saved successfully.
            </p>
          )}
        </div>

        {/* ── Right: live preview ── */}
        <div className="shrink-0">
          <p className="mb-2 text-sm font-medium text-foreground">Preview</p>
          <ThemePreview theme={draft} ariaLabel="Live branding preview" />
        </div>
      </div>
    </section>
  );
}
