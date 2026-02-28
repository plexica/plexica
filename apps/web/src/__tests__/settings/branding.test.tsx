// File: apps/web/src/__tests__/settings/branding.test.tsx
//
// T005-12: Integration tests for the BrandingTab component.
//
// Tests (8):
//   1. Renders null when ENABLE_TENANT_THEMING flag is off
//   2. Renders branding form when flag is on
//   3. Live preview updates when a color field changes
//   4. Live preview updates when a font selector changes
//   5. Save button calls PATCH /api/v1/tenant/settings with draft theme
//   6. Shows success message after successful save
//   7. Shows error message when save fails
//   8. Reset button restores original theme values

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------

const { mockUseFeatureFlag, mockUseTenantTheme, mockApiPatch, mockRefreshTenantTheme } = vi.hoisted(
  () => {
    const mockRefreshTenantTheme = vi.fn().mockResolvedValue(undefined);
    const mockUseFeatureFlag = vi.fn(() => true); // default: flag ON
    const mockApiPatch = vi.fn().mockResolvedValue({ success: true });

    const DEFAULT_THEME = {
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

    const mockUseTenantTheme = vi.fn(() => ({
      tenantTheme: DEFAULT_THEME,
      tenantThemeLoading: false,
      tenantThemeError: null,
      refreshTenantTheme: mockRefreshTenantTheme,
    }));

    return { mockUseFeatureFlag, mockUseTenantTheme, mockApiPatch, mockRefreshTenantTheme };
  }
);

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/feature-flags', () => ({
  useFeatureFlag: mockUseFeatureFlag,
}));

vi.mock('@/contexts/ThemeContext', () => ({
  useTenantTheme: mockUseTenantTheme,
}));

vi.mock('@/lib/api-client', () => ({
  default: { patch: mockApiPatch },
  apiClient: { patch: mockApiPatch },
}));

// ---------------------------------------------------------------------------
// Import component under test (after mocks are registered)
// ---------------------------------------------------------------------------

import { BrandingTab } from '@/routes/settings.branding';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBrandingTab() {
  return render(<BrandingTab />);
}

// ---------------------------------------------------------------------------
// 1. Feature-flag gate
// ---------------------------------------------------------------------------

describe('BrandingTab — feature flag gate', () => {
  it('renders null when ENABLE_TENANT_THEMING flag is off', () => {
    mockUseFeatureFlag.mockReturnValueOnce(false);
    const { container } = renderBrandingTab();
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// 2. Initial render
// ---------------------------------------------------------------------------

describe('BrandingTab — initial render', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
  });

  it('renders branding form with heading, color fields, font selectors and preview', () => {
    renderBrandingTab();

    // Section heading
    expect(screen.getByRole('heading', { name: /branding/i })).toBeInTheDocument();

    // Logo input
    expect(screen.getByTestId('branding-logo-url')).toBeInTheDocument();

    // At least one color picker is rendered (primary)
    expect(screen.getAllByTestId('color-picker-native').length).toBeGreaterThan(0);

    // Font selectors (3: heading, body, mono)
    expect(screen.getAllByTestId('font-selector-select')).toHaveLength(3);

    // Live preview
    expect(screen.getByTestId('theme-preview')).toBeInTheDocument();

    // Save / Reset buttons
    expect(screen.getByTestId('branding-save-button')).toBeInTheDocument();
    expect(screen.getByTestId('branding-reset-button')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Live preview — color change
// ---------------------------------------------------------------------------

describe('BrandingTab — live color preview', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
  });

  it('updates the preview header background when primary color changes', () => {
    renderBrandingTab();

    // Find the first native color input (Primary)
    const pickers = screen.getAllByTestId('color-picker-native');
    const primaryPicker = pickers[0]!;

    // Change primary color
    fireEvent.change(primaryPicker, { target: { value: '#ff0000' } });

    // Preview header should now have the new primary color applied
    const previewHeader = screen.getByTestId('theme-preview-header');
    expect(previewHeader).toHaveStyle({ backgroundColor: '#ff0000' });
  });
});

// ---------------------------------------------------------------------------
// 4. Live preview — font change
// ---------------------------------------------------------------------------

describe('BrandingTab — live font preview', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
  });

  it('updates the preview heading font when heading font selector changes', () => {
    renderBrandingTab();

    // Find heading font selector (first of three)
    const selects = screen.getAllByTestId('font-selector-select');
    const headingSelect = selects[0]!;

    // Change to Roboto (id = 'roboto', name = 'Roboto')
    fireEvent.change(headingSelect, { target: { value: 'roboto' } });

    // The preview heading should now use 'Roboto' as font family
    const previewHeading = screen.getByTestId('theme-preview-heading');
    expect(previewHeading).toHaveStyle({ fontFamily: 'Roboto' });
  });
});

// ---------------------------------------------------------------------------
// 5. Save — calls PATCH with draft
// ---------------------------------------------------------------------------

describe('BrandingTab — save', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockApiPatch.mockResolvedValue({ success: true });
    mockRefreshTenantTheme.mockResolvedValue(undefined);
  });

  it('calls PATCH /api/v1/tenant/settings with the current draft theme when save is clicked', async () => {
    renderBrandingTab();

    const saveButton = screen.getByTestId('branding-save-button');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        '/api/v1/tenant/settings',
        expect.objectContaining({
          theme: expect.objectContaining({
            colors: expect.any(Object),
            fonts: expect.any(Object),
          }),
        })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Save success feedback
// ---------------------------------------------------------------------------

describe('BrandingTab — save success', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockApiPatch.mockResolvedValue({ success: true });
    mockRefreshTenantTheme.mockResolvedValue(undefined);
  });

  it('shows success message after successful save', async () => {
    renderBrandingTab();

    fireEvent.click(screen.getByTestId('branding-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('branding-save-success')).toBeInTheDocument();
    });
    expect(screen.getByTestId('branding-save-success')).toHaveTextContent(
      /branding saved successfully/i
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Save error feedback
// ---------------------------------------------------------------------------

describe('BrandingTab — save error', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockApiPatch.mockRejectedValue(new Error('Network error'));
    mockRefreshTenantTheme.mockResolvedValue(undefined);
  });

  it('shows error message when save fails', async () => {
    renderBrandingTab();

    fireEvent.click(screen.getByTestId('branding-save-button'));

    await waitFor(() => {
      expect(screen.getByTestId('branding-save-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('branding-save-error')).toHaveTextContent('Network error');
  });
});

// ---------------------------------------------------------------------------
// 8. Reset button
// ---------------------------------------------------------------------------

describe('BrandingTab — reset', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
  });

  it('restores original theme values when reset is clicked after making changes', () => {
    renderBrandingTab();

    // Change primary color
    const pickers = screen.getAllByTestId('color-picker-native');
    fireEvent.change(pickers[0]!, { target: { value: '#ff0000' } });

    // Preview reflects the change
    expect(screen.getByTestId('theme-preview-header')).toHaveStyle({
      backgroundColor: '#ff0000',
    });

    // Reset
    fireEvent.click(screen.getByTestId('branding-reset-button'));

    // Preview is restored to the original primary color from tenantTheme
    expect(screen.getByTestId('theme-preview-header')).toHaveStyle({
      backgroundColor: '#1976d2',
    });
  });
});
