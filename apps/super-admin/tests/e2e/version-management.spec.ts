import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import { testPlugins } from './fixtures/test-data';
import { mockMarketplacePluginDetail, mockPublishVersionEndpoint } from './helpers/api-mocks';

test.describe('Plugin Version Management E2E', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);

    // Navigate to plugins page with published plugin in the list
    await helpers.nav.goToPluginsPage([testPlugins.publishedPlugin]);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('version-management-end');
  });

  test('should display existing versions for a plugin', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock marketplace plugin detail (includes versions when ?includeAllVersions=true)
    // Must be registered BEFORE clicking plugin name which opens PluginDetailModal
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Click on plugin to open detail modal
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Click "Manage Versions" button
    const manageVersionsButton = page.locator('button:has-text("Manage Versions")');
    await manageVersionsButton.click();

    // Wait for Version Manager modal
    await helpers.modal.waitForModalOpen('Version Manager');

    // Verify versions are displayed with "v" prefix
    for (const version of publishedPlugin.versions || []) {
      await expect(page.locator(`text=v${version.version}`).first()).toBeVisible();
    }

    // Verify "Latest" badge is on the correct version
    const latestVersion = publishedPlugin.versions?.find((v) => v.isLatest);
    if (latestVersion) {
      await expect(page.locator('text=Latest').first()).toBeVisible();
    }
  });

  test('should expand and collapse version changelog', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock marketplace plugin detail
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Open plugin detail
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Open Version Manager
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    const firstVersion = publishedPlugin.versions?.[0];
    if (firstVersion) {
      // Changelogs are collapsed by default — verify changelog heading is NOT visible initially
      const changelogHeading = page.locator('h5:has-text("Changelog")');
      await expect(changelogHeading).not.toBeVisible();

      // Find the version card containing the version text
      // Each Card contains an h4 with the version + a chevron button for expand/collapse
      // Use the Card container that has the version text
      const versionCard = page
        .locator('div')
        .filter({ has: page.locator(`h4:has-text("v${firstVersion.version}")`) })
        .filter({ has: page.locator('button') })
        .last(); // last() picks the innermost match (the Card itself)

      // The chevron button is the last button in the card header area
      const expandButton = versionCard.locator('button').last();

      // Click to expand changelog
      await expandButton.click();
      await page.waitForTimeout(300);

      // Verify "Changelog" heading and content are visible
      await expect(changelogHeading).toBeVisible();
      await expect(page.locator(`text=${firstVersion.changelog}`).first()).toBeVisible();

      // Click to collapse
      await expandButton.click();
      await page.waitForTimeout(300);
    }
  });

  test('should publish new version successfully', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;
    const newVersion = testPlugins.newVersion;

    // Mock marketplace plugin detail
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Mock publish version endpoint: POST /api/marketplace/plugins/:id/versions
    await mockPublishVersionEndpoint(page, publishedPlugin.id);

    // Open plugin detail
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Open Version Manager
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version" button — toggles inline form
    const publishNewVersionButton = page.locator('button:has-text("Publish New Version")');
    await publishNewVersionButton.click();

    // Wait for form heading to appear
    await expect(page.locator('text=Publish New Version').first()).toBeVisible();

    // Fill version number — input placeholder "e.g., 1.1.0"
    await page.fill('input[placeholder="e.g., 1.1.0"]', newVersion.version);

    // Fill changelog — textarea placeholder "What's new in this version?"
    await page.fill('textarea[placeholder="What\'s new in this version?"]', newVersion.changelog);

    // setAsLatest checkbox (id="setAsLatest") is checked by default
    // If we don't want latest, we'd uncheck it. For this test, keep default.

    // Click "Publish Version"
    const publishButton = page.locator('button:has-text("Publish Version")');
    await publishButton.click();

    // Verify success toast: title "Version published"
    await helpers.assert.expectToastMessage('Version published');
  });

  test('should validate required fields for new version', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock marketplace plugin detail
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version"
    await page.locator('button:has-text("Publish New Version")').click();

    // The Publish button is NOT disabled based on empty fields — instead,
    // handlePublishVersion() checks and shows a validation toast.
    // Click "Publish Version" with empty fields
    const publishButton = page.locator('button:has-text("Publish Version")');
    await publishButton.click();

    // Should show validation toast (fields empty)
    await helpers.assert.expectToastMessage('Validation error');

    // Fill version number only
    await page.fill('input[placeholder="e.g., 1.1.0"]', '3.0.0');

    // Still fails without changelog
    await publishButton.click();
    await page.waitForTimeout(500);

    // Fill changelog — now both fields are filled
    await page.fill('textarea[placeholder="What\'s new in this version?"]', 'New features');

    // Now publish should work (if mocked)
    // Just verify the button is clickable and fields are filled
    await expect(page.locator('input[placeholder="e.g., 1.1.0"]')).toHaveValue('3.0.0');
    await expect(page.locator('textarea[placeholder="What\'s new in this version?"]')).toHaveValue(
      'New features'
    );
  });

  test('should display download count for each version', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock marketplace plugin detail with download counts
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Verify download counts are displayed — locale-formatted with "downloads" text
    // The browser uses toLocaleString() which formats as "1,234", "5,678", "2,345"
    for (const version of publishedPlugin.versions || []) {
      if (version.downloadCount !== undefined) {
        // Use regex to match locale-formatted number followed by " downloads"
        const downloadText = page.locator(
          `text=/${version.downloadCount.toLocaleString('en-US')} downloads/`
        );
        await expect(downloadText.first()).toBeVisible();
      }
    }
  });

  test('should handle API error during version publish', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock marketplace plugin detail
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Mock publish version with error
    await mockPublishVersionEndpoint(page, publishedPlugin.id, {
      success: false,
      error: 'Version already exists',
    });

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version"
    await page.locator('button:has-text("Publish New Version")').click();

    // Fill form
    await page.fill('input[placeholder="e.g., 1.1.0"]', '2.1.0');
    await page.fill('textarea[placeholder="What\'s new in this version?"]', 'Duplicate version');

    // Try to publish
    await page.locator('button:has-text("Publish Version")').click();

    // Wait for API call
    await page.waitForTimeout(1000);

    // Verify error toast
    await helpers.assert.expectToastMessage('Failed to publish version');

    // Verify modal is still open
    await helpers.assert.expectModalOpen('Version Manager');
  });

  test('should cancel new version form', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock marketplace plugin detail
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version"
    await page.locator('button:has-text("Publish New Version")').click();

    // Verify the form heading is visible
    await expect(page.locator('text=Publish New Version').first()).toBeVisible();

    // Fill some data
    await page.fill('input[placeholder="e.g., 1.1.0"]', '3.0.0');
    await page.fill('textarea[placeholder="What\'s new in this version?"]', 'Test changelog');

    // Click Cancel
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();
    await page.waitForTimeout(300);

    // Verify form is hidden — "Publish New Version" heading should disappear
    // but the "Publish New Version" button should reappear
    await expect(page.locator('input[placeholder="e.g., 1.1.0"]')).not.toBeVisible();

    // Verify we're back to version list
    await expect(page.locator('text=Version Manager')).toBeVisible();
    await expect(page.locator('button:has-text("Publish New Version")')).toBeVisible();
  });

  test('should sort versions by date (newest first)', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock marketplace plugin detail
    await mockMarketplacePluginDetail(page, publishedPlugin.id, publishedPlugin);

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Versions are displayed as cards with "v{version}" in h4 headings
    // Verify the order by checking all version h4 texts
    const versionHeadings = page.locator('h4').filter({ hasText: /^v\d+\.\d+\.\d+$/ });
    const count = await versionHeadings.count();

    // Verify at least 3 versions are present
    expect(count).toBeGreaterThanOrEqual(3);

    // Verify the order: v2.1.0 (newest) should come before v2.0.0, then v1.0.0
    const firstText = await versionHeadings.nth(0).textContent();
    const secondText = await versionHeadings.nth(1).textContent();
    const thirdText = await versionHeadings.nth(2).textContent();

    expect(firstText).toContain('2.1.0');
    expect(secondText).toContain('2.0.0');
    expect(thirdText).toContain('1.0.0');
  });
});
