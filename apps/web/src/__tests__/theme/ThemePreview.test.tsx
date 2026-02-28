// File: apps/web/src/__tests__/theme/ThemePreview.test.tsx
//
// T005-10: Unit tests for the ThemePreview component.
//
// Coverage targets (3 tests):
//   1. Renders the preview region with correct aria-label
//   2. Applies theme colors via inline styles (primary, background, text)
//   3. Shows logo img when theme.logo is set; falls back to placeholder otherwise

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemePreview } from '@/components/ui/ThemePreview';
import { DEFAULT_TENANT_THEME } from '@/lib/theme-utils';
import type { TenantTheme } from '@/lib/theme-utils';

// Minimal theme fixture
const BASE_THEME: TenantTheme = {
  ...DEFAULT_TENANT_THEME,
  colors: { ...DEFAULT_TENANT_THEME.colors },
  fonts: { ...DEFAULT_TENANT_THEME.fonts },
  logo: null,
};

// ---------------------------------------------------------------------------
// 1. aria-label / landmark
// ---------------------------------------------------------------------------

describe('ThemePreview — landmark', () => {
  it('renders a section with the default aria-label', () => {
    render(<ThemePreview theme={BASE_THEME} />);
    const region = screen.getByRole('region', { name: /theme preview/i });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('data-testid', 'theme-preview');
  });

  it('uses the supplied ariaLabel prop', () => {
    render(<ThemePreview theme={BASE_THEME} ariaLabel="Custom brand preview" />);
    const region = screen.getByRole('region', { name: /custom brand preview/i });
    expect(region).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Color application
// ---------------------------------------------------------------------------

describe('ThemePreview — color styles', () => {
  it('applies the primary color to the simulated header bar', () => {
    const theme: TenantTheme = {
      ...BASE_THEME,
      colors: { ...BASE_THEME.colors, primary: '#ff0000' },
    };
    render(<ThemePreview theme={theme} />);
    const header = screen.getByTestId('theme-preview-header');
    expect(header).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('applies the background color to the preview container', () => {
    const theme: TenantTheme = {
      ...BASE_THEME,
      colors: { ...BASE_THEME.colors, background: '#fafafa' },
    };
    render(<ThemePreview theme={theme} />);
    const container = screen.getByTestId('theme-preview');
    expect(container).toHaveStyle({ backgroundColor: '#fafafa' });
  });

  it('applies the text color to the heading sample', () => {
    const theme: TenantTheme = {
      ...BASE_THEME,
      colors: { ...BASE_THEME.colors, text: '#111111' },
    };
    render(<ThemePreview theme={theme} />);
    const heading = screen.getByTestId('theme-preview-heading');
    expect(heading).toHaveStyle({ color: '#111111' });
  });
});

// ---------------------------------------------------------------------------
// 3. Logo / placeholder
// ---------------------------------------------------------------------------

describe('ThemePreview — logo', () => {
  it('renders logo <img> when theme.logo is set', () => {
    const theme: TenantTheme = {
      ...BASE_THEME,
      logo: 'https://cdn.example.com/logo.png',
    };
    render(<ThemePreview theme={theme} />);
    const img = screen.getByTestId('theme-preview-logo');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/logo.png');
    expect(screen.queryByTestId('theme-preview-logo-placeholder')).not.toBeInTheDocument();
  });

  it('renders the "P" placeholder when theme.logo is null', () => {
    render(<ThemePreview theme={BASE_THEME} />);
    expect(screen.getByTestId('theme-preview-logo-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('theme-preview-logo')).not.toBeInTheDocument();
  });
});
