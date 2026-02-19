/**
 * Locale Switching E2E Tests
 *
 * Tests the full user journey for changing language/locale:
 * - LanguageSelector dropdown interaction
 * - UI text updates after locale change
 * - LocalStorage persistence across page reloads
 * - Missing translation fallback behavior
 * - Tenant translation overrides
 * - Keyboard navigation and accessibility
 */

import { test, expect, Page } from '@playwright/test';
import { mockAllApis } from './helpers/api-mocks';
import { z } from 'zod';

// Zod schemas for validation (from @plexica/i18n)
const LocaleCodeSchema = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Locale must be in BCP 47 format (e.g., en, it, en-US)');

const TranslationMessagesSchema = z.record(z.string(), z.string());

// Mock translation data for testing
const mockTranslations = {
  en: {
    core: {
      'welcome.title': 'Welcome to Plexica',
      'nav.dashboard': 'Dashboard',
      'nav.plugins': 'My Plugins',
      'nav.team': 'Team',
      'nav.settings': 'Settings',
      'button.logout': 'Logout',
    },
  },
  it: {
    core: {
      'welcome.title': 'Benvenuto a Plexica',
      'nav.dashboard': 'Dashboard', // Intentionally same in Italian
      'nav.plugins': 'I Miei Plugin',
      'nav.team': 'Squadra',
      'nav.settings': 'Impostazioni',
      'button.logout': 'Disconnetti',
    },
  },
  es: {
    core: {
      'welcome.title': 'Bienvenido a Plexica',
      'nav.dashboard': 'Panel',
      'nav.plugins': 'Mis Plugins',
      // Missing 'nav.team' to test fallback
      'nav.settings': 'Configuración',
      'button.logout': 'Cerrar sesión',
    },
  },
};

// Mock tenant overrides for testing
const mockTenantOverrides = {
  overrides: {
    en: {
      core: {
        'welcome.title': 'Welcome to Acme Corp Platform', // Custom override
      },
    },
  },
  updatedAt: new Date().toISOString(),
};

// Validate mock data at test setup time (fail fast if mocks are invalid)
test.beforeAll(() => {
  // Validate all locales follow BCP 47 format
  for (const locale of Object.keys(mockTranslations)) {
    try {
      LocaleCodeSchema.parse(locale);
    } catch (err) {
      throw new Error(
        `Mock translation locale "${locale}" is invalid: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  // Validate all translation messages are string-to-string records
  for (const [locale, namespaces] of Object.entries(mockTranslations)) {
    for (const [namespace, messages] of Object.entries(namespaces)) {
      try {
        TranslationMessagesSchema.parse(messages);
      } catch (err) {
        throw new Error(
          `Mock translation messages for "${locale}.${namespace}" are invalid: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }
    }
  }

  // Validate tenant overrides structure
  for (const [locale, namespaces] of Object.entries(mockTenantOverrides.overrides)) {
    LocaleCodeSchema.parse(locale);
    for (const messages of Object.values(namespaces)) {
      TranslationMessagesSchema.parse(messages);
    }
  }
});

/**
 * Helper function to mock translation API endpoints
 */
async function mockTranslationApis(page: Page) {
  // GET /api/v1/translations/:locale/:namespace
  await page.route('**/api/v1/translations/**', async (route) => {
    const url = route.request().url();
    const match = url.match(/\/translations\/([^/]+)\/([^/]+)/);

    if (match) {
      const [, locale, namespace] = match;
      const messages =
        mockTranslations[locale as keyof typeof mockTranslations]?.[
          namespace as keyof (typeof mockTranslations)['en']
        ];

      if (messages) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            locale,
            namespace,
            messages,
            contentHash: 'mock-hash-123',
            updatedAt: new Date().toISOString(),
          }),
        });
      } else {
        // 404 for missing translations
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'TRANSLATIONS_NOT_FOUND',
              message: `Translations not found for locale '${locale}' and namespace '${namespace}'`,
            },
          }),
        });
      }
    } else {
      await route.continue();
    }
  });

  // GET /api/v1/tenant/translations/overrides
  await page.route('**/api/v1/tenant/translations/overrides', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTenantOverrides),
      });
    } else {
      await route.continue();
    }
  });
}

test.describe('Locale Switching', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.context().clearCookies();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());

    // Mock all APIs
    await mockAllApis(page);
    await mockTranslationApis(page);
  });

  test('should render LanguageSelector in header', async ({ page }) => {
    await page.goto('/');

    // Wait for dashboard to load
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // LanguageSelector should be visible in the header
    const languageSelector = page.getByRole('combobox', { name: /language|locale/i });
    await expect(languageSelector).toBeVisible();
  });

  test('should open dropdown when LanguageSelector is clicked', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Click the LanguageSelector trigger
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();

    // Dropdown menu should appear with locale options
    await expect(page.getByRole('option', { name: /english/i }).first()).toBeVisible();
    await expect(page.getByRole('option', { name: /italiano/i }).first()).toBeVisible();
  });

  test('should change locale when user selects from dropdown', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Open LanguageSelector
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();

    // Select Italian (Italiano)
    const italianOption = page.getByRole('option', { name: /italiano/i }).first();
    await italianOption.click();

    // Wait for locale to change in context
    await page.waitForTimeout(500);

    // Verify localStorage has been updated
    const storedLocale = await page.evaluate(() => localStorage.getItem('plexica_locale'));
    expect(storedLocale).toBe('it');
  });

  test('should update UI text after locale change', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Initial state: English
    await expect(page.getByText('Settings').first()).toBeVisible();

    // Change to Italian
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();
    const italianOption = page.getByRole('option', { name: /italiano/i }).first();
    await italianOption.click();

    // Wait for translations to load and UI to update
    await page.waitForTimeout(1000);

    // UI should now show Italian text
    await expect(page.getByText('Impostazioni').first()).toBeVisible({ timeout: 5000 });
  });

  test('should persist locale selection after page reload', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Change to Italian
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();
    const italianOption = page.getByRole('option', { name: /italiano/i }).first();
    await italianOption.click();

    // Wait for locale to be saved to localStorage
    await page.waitForTimeout(500);

    // Reload the page
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Verify locale is still Italian
    const storedLocale = await page.evaluate(() => localStorage.getItem('plexica_locale'));
    expect(storedLocale).toBe('it');

    // Verify UI is still in Italian
    await expect(page.getByText('Impostazioni').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show fallback for missing translations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Change to Spanish (which is missing 'nav.team' translation)
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();

    // Wait for Spanish option to appear in dropdown
    await page.waitForTimeout(500);
    const spanishOption = page.getByRole('option', { name: /español/i }).first();
    await spanishOption.click();

    // Wait for translations to load
    await page.waitForTimeout(1000);

    // UI should show Spanish text for existing translations
    await expect(page.getByText('Configuración').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Panel').first()).toBeVisible({ timeout: 5000 });

    // Missing translation should fallback to translation key or English
    // Since 'nav.team' is missing in Spanish, it should either show:
    // 1. The key itself: 'nav.team'
    // 2. The English fallback: 'Team'
    // We test for presence of either
    const teamText = page.getByText(/team|nav\.team/i).first();
    await expect(teamText).toBeVisible();
  });

  test('should apply tenant translation overrides', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Wait for translations to load (including overrides)
    await page.waitForTimeout(1000);

    // Verify tenant override is applied
    // Mock has 'welcome.title' overridden to 'Welcome to Acme Corp Platform'
    await expect(page.getByText('Welcome to Acme Corp Platform').first()).toBeVisible({
      timeout: 5000,
    });
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Focus on LanguageSelector using Tab
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // May need multiple tabs to reach selector

    // Find the LanguageSelector trigger
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();

    // Focus it programmatically for reliability
    await trigger.focus();

    // Press Enter to open dropdown
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Dropdown should be open
    await expect(page.getByRole('option', { name: /english/i }).first()).toBeVisible();

    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown'); // Move to Italian

    // Press Enter to select
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // Verify locale changed to Italian
    const storedLocale = await page.evaluate(() => localStorage.getItem('plexica_locale'));
    expect(storedLocale).toBe('it');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock translation API to return 500 error
    await page.route('**/api/v1/translations/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Failed to load translations',
          },
        }),
      });
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // LanguageSelector should still render
    const languageSelector = page.getByRole('combobox', { name: /language|locale/i });
    await expect(languageSelector).toBeVisible();

    // Changing locale shouldn't crash the app
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();
    const italianOption = page.getByRole('option', { name: /italiano/i }).first();
    await italianOption.click();

    // App should still be functional (dashboard visible)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should have proper ARIA labels for accessibility', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // LanguageSelector trigger should have aria-label or accessible name
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    const ariaLabel = await trigger.getAttribute('aria-label');
    const ariaLabelledBy = await trigger.getAttribute('aria-labelledby');

    // Either aria-label or aria-labelledby should be present
    const hasAriaLabel = !!ariaLabel || !!ariaLabelledBy;
    expect(hasAriaLabel).toBe(true);

    // Trigger should have aria-expanded attribute
    const ariaExpanded = await trigger.getAttribute('aria-expanded');
    expect(ariaExpanded).toBeDefined();

    // Open dropdown
    await trigger.click();
    await page.waitForTimeout(300);

    // Dropdown options should have role="option"
    const options = page.getByRole('option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThan(0);
  });

  test('should display available locales in LanguageSelector', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Open LanguageSelector
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();

    // Wait for dropdown to open
    await page.waitForTimeout(300);

    // Verify expected locales are present
    await expect(page.getByRole('option', { name: /english/i }).first()).toBeVisible();
    await expect(page.getByRole('option', { name: /italiano/i }).first()).toBeVisible();
    await expect(page.getByRole('option', { name: /español/i }).first()).toBeVisible();
    await expect(page.getByRole('option', { name: /français/i }).first()).toBeVisible();
    await expect(page.getByRole('option', { name: /deutsch/i }).first()).toBeVisible();
  });
});

test.describe('Locale Switching - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await mockAllApis(page);
    await mockTranslationApis(page);
  });

  test('should handle invalid locale in localStorage gracefully', async ({ page }) => {
    // Set invalid locale in localStorage
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('plexica_locale', 'invalid-locale-xyz'));

    // Reload page
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // App should fallback to default locale (English)
    const storedLocale = await page.evaluate(() => localStorage.getItem('plexica_locale'));
    // Either cleared to null/empty or reset to 'en'
    expect(['en', null, '']).toContain(storedLocale);
  });

  test('should handle rapid locale switching without errors', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Rapidly switch locales
    for (let i = 0; i < 3; i++) {
      const trigger = page.getByRole('button', { name: /select language/i }).first();
      await trigger.click();
      await page.waitForTimeout(100);

      const italianOption = page.getByRole('option', { name: /italiano/i }).first();
      await italianOption.click();
      await page.waitForTimeout(300);

      await trigger.click();
      await page.waitForTimeout(100);

      const englishOption = page.getByRole('option', { name: /english/i }).first();
      await englishOption.click();
      await page.waitForTimeout(300);
    }

    // App should still be functional
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('should preserve locale when navigating between pages', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15000 });

    // Change to Italian
    const trigger = page.getByRole('button', { name: /select language|english|en/i }).first();
    await trigger.click();
    const italianOption = page.getByRole('option', { name: /italiano/i }).first();
    await italianOption.click();
    await page.waitForTimeout(500);

    // Navigate to Settings page
    const settingsLink = page.getByRole('link', { name: /settings|impostazioni/i }).first();
    await settingsLink.click();

    // Wait for Settings page to load
    await expect(page.getByText(/workspace settings|impostazioni/i)).toBeVisible({ timeout: 5000 });

    // Verify locale is still Italian
    const storedLocale = await page.evaluate(() => localStorage.getItem('plexica_locale'));
    expect(storedLocale).toBe('it');

    // Verify UI is still in Italian
    await expect(page.getByText(/impostazioni/i).first()).toBeVisible();
  });
});
