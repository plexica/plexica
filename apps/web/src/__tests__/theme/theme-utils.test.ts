// apps/web/src/__tests__/theme/theme-utils.test.ts
//
// T2.7: Unit tests for theme-utils.ts
//
// Coverage targets (tasks.md):
//   - Valid hex colors pass validation                    ✓
//   - Invalid colors fallback to defaults                 ✓
//   - Partial theme merged with defaults                  ✓
//   - Warnings logged for invalid values                  ✓
//   - applyTheme sets CSS custom properties               ✓
//   - isValidHexColor helper                              ✓
//   - isValidHttpsUrl helper                              ✓

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Pino logger (must be hoisted)
// ---------------------------------------------------------------------------

const { mockWarn } = vi.hoisted(() => {
  const mockWarn = vi.fn();
  return { mockWarn };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: mockWarn,
    info: vi.fn(),
    debug: vi.fn(),
  },
  createContextLogger: vi.fn(() => ({ error: vi.fn(), warn: mockWarn })),
}));

import {
  isValidHexColor,
  isValidHttpsUrl,
  validateTheme,
  applyTheme,
  DEFAULT_TENANT_THEME,
} from '@/lib/theme-utils';

// ---------------------------------------------------------------------------
// Helper — reset CSS custom properties before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Reset inline style so tests start clean
  document.documentElement.removeAttribute('style');
});

// ---------------------------------------------------------------------------
// isValidHexColor
// ---------------------------------------------------------------------------

describe('isValidHexColor', () => {
  it('accepts valid 6-digit hex colors', () => {
    expect(isValidHexColor('#1976d2')).toBe(true);
    expect(isValidHexColor('#FFFFFF')).toBe(true);
    expect(isValidHexColor('#000000')).toBe(true);
    expect(isValidHexColor('#a1b2c3')).toBe(true);
  });

  it('accepts valid 3-digit hex shorthand', () => {
    expect(isValidHexColor('#fff')).toBe(true);
    expect(isValidHexColor('#F00')).toBe(true);
    expect(isValidHexColor('#abc')).toBe(true);
  });

  it('rejects invalid color strings', () => {
    expect(isValidHexColor('red')).toBe(false);
    expect(isValidHexColor('rgb(255,0,0)')).toBe(false);
    expect(isValidHexColor('1976d2')).toBe(false); // missing #
    expect(isValidHexColor('#1976g2')).toBe(false); // invalid char
    expect(isValidHexColor('#12345')).toBe(false); // wrong length
    expect(isValidHexColor('')).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
    expect(isValidHexColor(undefined)).toBe(false);
    expect(isValidHexColor(123)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isValidHttpsUrl
// ---------------------------------------------------------------------------

describe('isValidHttpsUrl', () => {
  it('accepts valid https URLs', () => {
    expect(isValidHttpsUrl('https://example.com/logo.png')).toBe(true);
    expect(isValidHttpsUrl('https://cdn.plexica.io/acme/logo.svg')).toBe(true);
  });

  it('rejects http, empty, and non-URL strings', () => {
    expect(isValidHttpsUrl('http://example.com/logo.png')).toBe(false);
    expect(isValidHttpsUrl('/local/logo.svg')).toBe(false);
    expect(isValidHttpsUrl('')).toBe(false);
    expect(isValidHttpsUrl(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateTheme — null / undefined input
// ---------------------------------------------------------------------------

describe('validateTheme — null/undefined', () => {
  it('returns default theme for null input', () => {
    const result = validateTheme(null);
    expect(result.colors.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    expect(result.fonts.heading).toBe(DEFAULT_TENANT_THEME.fonts.heading);
    expect(result.logo).toBeNull();
  });

  it('returns default theme for undefined input', () => {
    const result = validateTheme(undefined);
    expect(result.colors.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
  });
});

// ---------------------------------------------------------------------------
// validateTheme — valid colors
// ---------------------------------------------------------------------------

describe('validateTheme — valid colors pass through', () => {
  it('accepts a fully valid theme', () => {
    const result = validateTheme({
      logo: 'https://cdn.example.com/logo.png',
      colors: {
        primary: '#ff5733',
        secondary: '#33c1ff',
        background: '#f0f0f0',
        surface: '#e0e0e0',
        text: '#111111',
        textSecondary: '#555555',
        error: '#cc0000',
        success: '#009900',
        warning: '#ff8800',
      },
      fonts: {
        heading: 'Arial',
        body: 'Roboto',
        mono: 'Fira Code',
      },
    });

    expect(result.colors.primary).toBe('#ff5733');
    expect(result.colors.secondary).toBe('#33c1ff');
    expect(result.logo).toBe('https://cdn.example.com/logo.png');
    expect(result.fonts.heading).toBe('Arial');
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// validateTheme — invalid colors fall back
// ---------------------------------------------------------------------------

describe('validateTheme — invalid colors fallback to defaults', () => {
  it('replaces invalid color with default and logs a warning', () => {
    const result = validateTheme({
      colors: {
        ...DEFAULT_TENANT_THEME.colors,
        primary: 'not-a-color',
      },
    });

    expect(result.colors.primary).toBe(DEFAULT_TENANT_THEME.colors.primary);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'primary', value: 'not-a-color' }),
      expect.stringContaining('Invalid tenant theme color')
    );
  });

  it('replaces rgb() value with default and logs a warning', () => {
    const result = validateTheme({
      colors: {
        ...DEFAULT_TENANT_THEME.colors,
        secondary: 'rgb(220, 0, 78)',
      },
    });

    expect(result.colors.secondary).toBe(DEFAULT_TENANT_THEME.colors.secondary);
    expect(mockWarn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// validateTheme — partial theme merges with defaults
// ---------------------------------------------------------------------------

describe('validateTheme — partial theme merged with defaults', () => {
  it('fills missing colors from defaults', () => {
    const result = validateTheme({
      colors: { ...DEFAULT_TENANT_THEME.colors, primary: '#aabbcc' },
    });

    // Provided value is used
    expect(result.colors.primary).toBe('#aabbcc');
    // Missing values fall back to defaults silently
    expect(result.colors.secondary).toBe(DEFAULT_TENANT_THEME.colors.secondary);
    expect(result.colors.background).toBe(DEFAULT_TENANT_THEME.colors.background);
    // No warnings for simply missing keys
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('fills missing fonts from defaults', () => {
    const result = validateTheme({
      fonts: { ...DEFAULT_TENANT_THEME.fonts, heading: 'Georgia' },
    });

    expect(result.fonts.heading).toBe('Georgia');
    expect(result.fonts.body).toBe(DEFAULT_TENANT_THEME.fonts.body);
    expect(result.fonts.mono).toBe(DEFAULT_TENANT_THEME.fonts.mono);
  });
});

// ---------------------------------------------------------------------------
// validateTheme — invalid logo
// ---------------------------------------------------------------------------

describe('validateTheme — logo validation', () => {
  it('rejects http logo and warns', () => {
    const result = validateTheme({ logo: 'http://insecure.com/logo.png' });
    expect(result.logo).toBeNull();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ logo: 'http://insecure.com/logo.png' }),
      expect.stringContaining('Invalid tenant logo URL')
    );
  });

  it('rejects relative path and warns', () => {
    const result = validateTheme({ logo: '/local/logo.svg' });
    expect(result.logo).toBeNull();
    expect(mockWarn).toHaveBeenCalled();
  });

  it('accepts null logo without warning', () => {
    const result = validateTheme({ logo: null });
    expect(result.logo).toBeNull();
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// applyTheme — CSS custom properties
// ---------------------------------------------------------------------------

describe('applyTheme', () => {
  it('sets all color CSS custom properties on :root', () => {
    const spy = vi.spyOn(document.documentElement.style, 'setProperty');

    applyTheme(DEFAULT_TENANT_THEME);

    expect(spy).toHaveBeenCalledWith('--tenant-primary', DEFAULT_TENANT_THEME.colors.primary);
    expect(spy).toHaveBeenCalledWith('--tenant-secondary', DEFAULT_TENANT_THEME.colors.secondary);
    expect(spy).toHaveBeenCalledWith('--tenant-background', DEFAULT_TENANT_THEME.colors.background);
    expect(spy).toHaveBeenCalledWith('--tenant-surface', DEFAULT_TENANT_THEME.colors.surface);
    expect(spy).toHaveBeenCalledWith('--tenant-text', DEFAULT_TENANT_THEME.colors.text);
    expect(spy).toHaveBeenCalledWith(
      '--tenant-text-secondary',
      DEFAULT_TENANT_THEME.colors.textSecondary
    );
    expect(spy).toHaveBeenCalledWith('--tenant-error', DEFAULT_TENANT_THEME.colors.error);
    expect(spy).toHaveBeenCalledWith('--tenant-success', DEFAULT_TENANT_THEME.colors.success);
    expect(spy).toHaveBeenCalledWith('--tenant-warning', DEFAULT_TENANT_THEME.colors.warning);

    spy.mockRestore();
  });

  it('sets all font CSS custom properties on :root', () => {
    const spy = vi.spyOn(document.documentElement.style, 'setProperty');

    applyTheme(DEFAULT_TENANT_THEME);

    expect(spy).toHaveBeenCalledWith('--tenant-font-heading', DEFAULT_TENANT_THEME.fonts.heading);
    expect(spy).toHaveBeenCalledWith('--tenant-font-body', DEFAULT_TENANT_THEME.fonts.body);
    expect(spy).toHaveBeenCalledWith('--tenant-font-mono', DEFAULT_TENANT_THEME.fonts.mono);

    spy.mockRestore();
  });

  it('re-applies theme when called a second time with different values', () => {
    const spy = vi.spyOn(document.documentElement.style, 'setProperty');

    applyTheme(DEFAULT_TENANT_THEME);
    applyTheme({
      ...DEFAULT_TENANT_THEME,
      colors: { ...DEFAULT_TENANT_THEME.colors, primary: '#abcdef' },
    });

    // Second call should have set the updated primary color
    const primaryCalls = spy.mock.calls.filter(([prop]) => prop === '--tenant-primary');
    expect(primaryCalls).toHaveLength(2);
    expect(primaryCalls[1][1]).toBe('#abcdef');

    spy.mockRestore();
  });
});
