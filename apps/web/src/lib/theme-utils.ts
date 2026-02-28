// apps/web/src/lib/theme-utils.ts
//
// Tenant theme validation and CSS custom property application.
// Part of Spec 010 Phase 2: Tenant Theming.
//
// Design decisions (ADR-020):
//  - Fonts: self-hosted WOFF2 via MinIO/CDN; font-src 'self' CSP.
//  - Colors: hex format validated; invalid values fall back to defaults.
//  - Logo: HTTPS URL validated; empty / invalid falls back to null.
//  - Partial themes: merged with defaults (never rejected entirely).

import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  error: string;
  success: string;
  warning: string;
}

export interface TenantThemeFonts {
  heading: string;
  body: string;
  mono: string;
}

export interface TenantTheme {
  logo: string | null;
  colors: TenantThemeColors;
  fonts: TenantThemeFonts;
}

// ---------------------------------------------------------------------------
// Defaults — match existing Plexica design tokens
// ---------------------------------------------------------------------------

export const DEFAULT_TENANT_THEME: TenantTheme = {
  logo: null,
  colors: {
    primary: '#1976d2',
    secondary: '#dc004e',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#212121',
    textSecondary: '#757575',
    error: '#f44336',
    success: '#4caf50',
    warning: '#ff9800',
  },
  fonts: {
    heading: 'Inter',
    body: 'Inter',
    mono: 'JetBrains Mono Variable',
  },
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const HEX_COLOR_RE = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const HTTPS_URL_RE = /^https:\/\/.+/;

/**
 * Returns true when `color` is a valid #RRGGBB or #RGB hex string.
 */
export function isValidHexColor(color: unknown): boolean {
  return typeof color === 'string' && HEX_COLOR_RE.test(color);
}

/**
 * Returns true when `url` is a non-empty HTTPS URL.
 */
export function isValidHttpsUrl(url: unknown): boolean {
  return typeof url === 'string' && HTTPS_URL_RE.test(url);
}

// ---------------------------------------------------------------------------
// Theme validation
// ---------------------------------------------------------------------------

/**
 * Validate a raw (possibly partial / untrusted) theme object from the API.
 * Invalid individual values are replaced with defaults and a warning is logged.
 * Returns a fully-populated, type-safe `TenantTheme`.
 */
export function validateTheme(raw: Partial<TenantTheme> | null | undefined): TenantTheme {
  if (!raw)
    return {
      ...DEFAULT_TENANT_THEME,
      colors: { ...DEFAULT_TENANT_THEME.colors },
      fonts: { ...DEFAULT_TENANT_THEME.fonts },
    };

  // --- Logo ---
  const logo = raw.logo != null && isValidHttpsUrl(raw.logo) ? raw.logo : null;

  if (raw.logo != null && !isValidHttpsUrl(raw.logo)) {
    logger.warn(
      { logo: raw.logo },
      'Invalid tenant logo URL — must be https://. Falling back to null.'
    );
  }

  // --- Colors ---
  const rawColors = raw.colors ?? {};
  const validatedColors = {} as Record<string, string>;

  for (const key of Object.keys(DEFAULT_TENANT_THEME.colors) as (keyof TenantThemeColors)[]) {
    const value = (rawColors as Partial<TenantThemeColors>)[key];
    if (value === undefined) {
      // Missing key → use default silently
      validatedColors[key] = DEFAULT_TENANT_THEME.colors[key];
    } else if (isValidHexColor(value)) {
      validatedColors[key] = value as string;
    } else {
      logger.warn(
        { key, value },
        `Invalid tenant theme color for "${key}" — expected #RRGGBB or #RGB. Using default.`
      );
      validatedColors[key] = DEFAULT_TENANT_THEME.colors[key];
    }
  }

  // --- Fonts ---
  const rawFonts = raw.fonts ?? {};
  const validatedFonts = {} as Record<string, string>;

  for (const key of Object.keys(DEFAULT_TENANT_THEME.fonts) as (keyof TenantThemeFonts)[]) {
    const value = (rawFonts as Partial<TenantThemeFonts>)[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      validatedFonts[key] = value.trim();
    } else {
      if (value !== undefined) {
        logger.warn(
          { key, value },
          `Invalid tenant theme font for "${key}" — must be non-empty string. Using default.`
        );
      }
      validatedFonts[key] = DEFAULT_TENANT_THEME.fonts[key];
    }
  }

  return {
    logo,
    colors: validatedColors as unknown as TenantThemeColors,
    fonts: validatedFonts as unknown as TenantThemeFonts,
  };
}

// ---------------------------------------------------------------------------
// CSS custom property application
// ---------------------------------------------------------------------------

/**
 * Apply a validated `TenantTheme` to the document root via CSS custom
 * properties. Called by ThemeProvider whenever the tenant theme changes.
 *
 * Sets:
 *   --tenant-primary, --tenant-secondary, --tenant-background,
 *   --tenant-surface, --tenant-text, --tenant-text-secondary,
 *   --tenant-error, --tenant-success, --tenant-warning,
 *   --tenant-font-heading, --tenant-font-body, --tenant-font-mono
 */
export function applyTheme(theme: TenantTheme): void {
  const root = document.documentElement;

  // Colors
  root.style.setProperty('--tenant-primary', theme.colors.primary);
  root.style.setProperty('--tenant-secondary', theme.colors.secondary);
  root.style.setProperty('--tenant-background', theme.colors.background);
  root.style.setProperty('--tenant-surface', theme.colors.surface);
  root.style.setProperty('--tenant-text', theme.colors.text);
  root.style.setProperty('--tenant-text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--tenant-error', theme.colors.error);
  root.style.setProperty('--tenant-success', theme.colors.success);
  root.style.setProperty('--tenant-warning', theme.colors.warning);

  // Fonts (ADR-020: self-hosted, valid font-family names)
  root.style.setProperty('--tenant-font-heading', theme.fonts.heading);
  root.style.setProperty('--tenant-font-body', theme.fonts.body);
  root.style.setProperty('--tenant-font-mono', theme.fonts.mono);
}

// ---------------------------------------------------------------------------
// Dark mode colour derivation (T005-20)
// ---------------------------------------------------------------------------

/**
 * Parse a 6-digit hex colour into [r, g, b] components in the 0–255 range.
 * Returns null for invalid or 3-digit hex strings.
 */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([A-Fa-f0-9]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Convert an [r, g, b] triple back to a lowercase #RRGGBB hex string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Blend a hex colour toward black (`factor` 0 = original, 1 = black).
 * Used to darken background / surface colours in dark mode.
 */
function darken(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => c * (1 - factor));
  return rgbToHex(r, g, b);
}

/**
 * Blend a hex colour toward white (`factor` 0 = original, 1 = white).
 * Used to lighten text / icon colours in dark mode.
 */
function lighten(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => c + (255 - c) * factor);
  return rgbToHex(r, g, b);
}

/**
 * Derive sensible dark-mode colour overrides from a light tenant theme.
 *
 * Strategy (T005-20):
 *  - background → heavily darkened (~87 %)
 *  - surface    → moderately darkened (~80 %)
 *  - text       → strongly lightened (~85 %)
 *  - textSecondary → moderately lightened (~50 %)
 *  - primary / secondary / error / success / warning → lightly lightened
 *    (+15 %) so they remain legible on the dark background while retaining
 *    the tenant brand hue.
 *
 * Fonts are unchanged — dark mode is purely a colour concern.
 */
export function generateDarkTheme(light: TenantTheme): TenantTheme {
  return {
    logo: light.logo,
    fonts: { ...light.fonts },
    colors: {
      background: darken(light.colors.background, 0.87),
      surface: darken(light.colors.surface, 0.8),
      text: lighten(light.colors.text, 0.85),
      textSecondary: lighten(light.colors.textSecondary, 0.5),
      primary: lighten(light.colors.primary, 0.15),
      secondary: lighten(light.colors.secondary, 0.15),
      error: lighten(light.colors.error, 0.15),
      success: lighten(light.colors.success, 0.15),
      warning: lighten(light.colors.warning, 0.15),
    },
  };
}
