// File: apps/web/src/__tests__/settings/branding.test.tsx
//
// T005-12: Integration tests for the BrandingTab component.
//
// Tests:
//   1.  Renders null when ENABLE_TENANT_BRANDING flag is off
//   2.  Shows 403 message for non-admin users (SEC-001)
//   3.  Renders branding form for admin users
//   4.  Live preview updates when a color field changes
//   5.  Live preview updates when a font selector changes
//   6.  Save button calls PUT /api/v1/tenant/settings with draft theme (SPEC-001)
//   7.  Shows success message after successful save
//   8.  Shows error message when save fails
//   9.  Reset button restores original theme values
//  10.  Logo URL input updates draft
//  11.  Logo URL cleared sets draft.logo to null
//  12.  Save and reset buttons disabled while saving
//  13.  Unsaved changes guard fires beforeunload when form is dirty (SPEC-002)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Hoisted mock factories — must be declared before any vi.mock() calls
// ---------------------------------------------------------------------------

const {
  mockUseFeatureFlag,
  mockUseTenantTheme,
  mockApiPut,
  mockRefreshTenantTheme,
  mockUseAuthStore,
} = vi.hoisted(() => {
  const mockRefreshTenantTheme = vi.fn().mockResolvedValue(undefined);
  const mockUseFeatureFlag = vi.fn(() => true); // default: flag ON
  const mockApiPut = vi.fn().mockResolvedValue({ success: true });

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

  // Default: admin user
  const mockUseAuthStore = vi.fn((selector: (s: { user: { roles: string[] } | null }) => unknown) =>
    selector({ user: { roles: ['admin'] } })
  );

  return {
    mockUseFeatureFlag,
    mockUseTenantTheme,
    mockApiPut,
    mockRefreshTenantTheme,
    mockUseAuthStore,
  };
});

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
  default: { put: mockApiPut },
  apiClient: { put: mockApiPut },
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: mockUseAuthStore,
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
  it('renders null when ENABLE_TENANT_BRANDING flag is off', () => {
    mockUseFeatureFlag.mockReturnValueOnce(false);
    const { container } = renderBrandingTab();
    expect(container).toBeEmptyDOMElement();
  });
});

// ---------------------------------------------------------------------------
// 2. RBAC gate (SEC-001)
// ---------------------------------------------------------------------------

describe('BrandingTab — RBAC gate', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
  });

  it('shows 403 forbidden message for non-admin users', () => {
    // Override to return a user without admin role
    mockUseAuthStore.mockImplementationOnce(
      (selector: (s: { user: { roles: string[] } | null }) => unknown) =>
        selector({ user: { roles: ['viewer'] } })
    );
    renderBrandingTab();
    expect(screen.getByTestId('branding-forbidden')).toBeInTheDocument();
    expect(screen.getByTestId('branding-forbidden')).toHaveTextContent(/admin role required/i);
    // The branding form should NOT be rendered
    expect(screen.queryByTestId('branding-save-button')).not.toBeInTheDocument();
  });

  it('shows 403 forbidden message when user has no roles', () => {
    mockUseAuthStore.mockImplementationOnce(
      (selector: (s: { user: { roles: string[] } | null }) => unknown) =>
        selector({ user: { roles: [] } })
    );
    renderBrandingTab();
    expect(screen.getByTestId('branding-forbidden')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3. Initial render (admin)
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

    // Live preview (aria-hidden, not a landmark)
    expect(screen.getByTestId('theme-preview')).toBeInTheDocument();
    expect(screen.getByTestId('theme-preview')).toHaveAttribute('aria-hidden', 'true');

    // Save / Reset buttons
    expect(screen.getByTestId('branding-save-button')).toBeInTheDocument();
    expect(screen.getByTestId('branding-reset-button')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Live preview — color change
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
// 5. Live preview — font change
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
// 6. Save — calls PUT with draft (SPEC-001)
// ---------------------------------------------------------------------------

describe('BrandingTab — save', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockApiPut.mockResolvedValue({ success: true });
    mockRefreshTenantTheme.mockResolvedValue(undefined);
  });

  it('calls PUT /api/v1/tenant/settings with the current draft theme when save is clicked', async () => {
    renderBrandingTab();

    const saveButton = screen.getByTestId('branding-save-button');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith(
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
// 7. Save success feedback
// ---------------------------------------------------------------------------

describe('BrandingTab — save success', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockApiPut.mockResolvedValue({ success: true });
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
// 8. Save error feedback
// ---------------------------------------------------------------------------

describe('BrandingTab — save error', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
    mockApiPut.mockRejectedValue(new Error('Network error'));
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
// 9. Reset button
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

// ---------------------------------------------------------------------------
// 10. Logo URL input
// ---------------------------------------------------------------------------

describe('BrandingTab — logo URL', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
  });

  it('updates draft logo when a URL is typed in the logo input', () => {
    renderBrandingTab();

    const logoInput = screen.getByTestId('branding-logo-url') as HTMLInputElement;
    fireEvent.change(logoInput, { target: { value: 'https://cdn.example.com/logo.svg' } });

    // Input should reflect the new value
    expect(logoInput.value).toBe('https://cdn.example.com/logo.svg');
  });

  it('sets draft.logo to null when logo URL input is cleared', () => {
    renderBrandingTab();

    const logoInput = screen.getByTestId('branding-logo-url') as HTMLInputElement;
    // First set to a value
    fireEvent.change(logoInput, { target: { value: 'https://cdn.example.com/logo.svg' } });
    // Then clear it — handleLogoChange trims to '' and sets logo to null
    fireEvent.change(logoInput, { target: { value: '' } });

    // React controlled input reflects the empty value
    expect(logoInput.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 11. Save button disabled state during save
// ---------------------------------------------------------------------------

describe('BrandingTab — save disabled during saving', () => {
  it('save and reset buttons are disabled while saving', async () => {
    // Use a never-resolving promise to keep the saving state active
    mockApiPut.mockReturnValue(new Promise(() => {}));
    mockUseFeatureFlag.mockReturnValue(true);

    renderBrandingTab();

    const saveButton = screen.getByTestId('branding-save-button');
    fireEvent.click(saveButton);

    // Buttons should be disabled while the save promise is pending
    expect(screen.getByTestId('branding-save-button')).toBeDisabled();
    expect(screen.getByTestId('branding-reset-button')).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 12. Unsaved changes guard — beforeunload (SPEC-002)
// ---------------------------------------------------------------------------

describe('BrandingTab — unsaved changes guard', () => {
  beforeEach(() => {
    mockUseFeatureFlag.mockReturnValue(true);
  });

  it('registers a beforeunload listener when the form is dirty', () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    renderBrandingTab();

    // Make the form dirty by changing a color
    const pickers = screen.getAllByTestId('color-picker-native');
    fireEvent.change(pickers[0]!, { target: { value: '#ff0000' } });

    // beforeunload listener should have been registered
    const calls = addEventSpy.mock.calls.filter(([event]) => event === 'beforeunload');
    expect(calls.length).toBeGreaterThan(0);

    addEventSpy.mockRestore();
  });

  it('does not register a beforeunload listener when form is clean', () => {
    const addEventSpy = vi.spyOn(window, 'addEventListener');
    renderBrandingTab();

    // No changes made — form should not be dirty
    const calls = addEventSpy.mock.calls.filter(([event]) => event === 'beforeunload');
    expect(calls.length).toBe(0);

    addEventSpy.mockRestore();
  });
});
