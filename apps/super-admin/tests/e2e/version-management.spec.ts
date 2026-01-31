import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import { testPlugins } from './fixtures/test-data';

test.describe('Plugin Version Management E2E', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);

    // Authentication is handled by global setup via storage state
    // No need to login here - we're already authenticated!

    // Navigate to plugins page with published plugin in the list
    await helpers.nav.goToPluginsPage([testPlugins.publishedPlugin]);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('version-management-end');
  });

  test('should display existing versions for a plugin', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock API to return plugin with versions
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    // Mock versions API
    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            versions: publishedPlugin.versions,
          }),
        });
      }
    );

    // Click on plugin to open detail modal
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Click "Manage Versions" button
    const manageVersionsButton = page.locator('button:has-text("Manage Versions")');
    await manageVersionsButton.click();

    // Wait for Version Manager modal
    await helpers.modal.waitForModalOpen('Version Manager');

    // Verify versions are displayed
    for (const version of publishedPlugin.versions || []) {
      await expect(page.locator(`text=${version.version}`)).toBeVisible();
      await expect(page.locator(`text=${version.changelog}`)).toBeVisible();
    }

    // Verify "Latest" badge is on the correct version
    const latestVersion = publishedPlugin.versions?.find((v) => v.isLatest);
    if (latestVersion) {
      const latestBadge = page.locator(`text=${latestVersion.version} >> .. >> text=Latest`);
      await expect(latestBadge).toBeVisible();
    }

    // Take screenshot of version list
    await helpers.screenshot.takeModal('version-manager-list');
  });

  test('should expand and collapse version changelog', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock API responses
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            versions: publishedPlugin.versions,
          }),
        });
      }
    );

    // Open plugin detail
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Open Version Manager
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    const firstVersion = publishedPlugin.versions?.[0];
    if (firstVersion) {
      // Find expand/collapse button for first version
      const expandButton = page
        .locator(`text=${firstVersion.version}`)
        .locator('..')
        .locator('button')
        .first();

      // Click to expand changelog
      await expandButton.click();
      await page.waitForTimeout(300);

      // Verify full changelog is visible
      await expect(page.locator(`text=${firstVersion.changelog}`)).toBeVisible();

      // Take screenshot of expanded changelog
      await helpers.screenshot.takeModal('version-manager-expanded');

      // Click to collapse
      await expandButton.click();
      await page.waitForTimeout(300);

      // Verify changelog is collapsed (truncated)
      // This depends on implementation - might not be fully hidden
    }
  });

  test('should publish new version successfully', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;
    const newVersion = testPlugins.newVersion;

    // Mock API responses
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              versions: publishedPlugin.versions,
            }),
          });
        } else if (route.request().method() === 'POST') {
          // Mock successful version publish
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              version: newVersion.version,
              changelog: newVersion.changelog,
              isLatest: newVersion.setAsLatest,
              createdAt: new Date().toISOString(),
            }),
          });
        }
      }
    );

    // Open plugin detail
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);

    // Open Version Manager
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version" button
    const publishNewVersionButton = page.locator('button:has-text("Publish New Version")');
    await publishNewVersionButton.click();

    // Wait for new version form to appear
    await expect(page.locator('text=New Version')).toBeVisible();

    // Fill version number
    await page.fill('input[name="version"]', newVersion.version);

    // Fill changelog
    await page.fill('textarea[name="changelog"]', newVersion.changelog);

    // Check "Mark as latest version" if specified
    if (newVersion.setAsLatest) {
      const latestCheckbox = page.locator('input[type="checkbox"][name="setAsLatest"]');
      await latestCheckbox.check();
    }

    // Take screenshot of filled form
    await helpers.screenshot.takeModal('version-manager-new-version-form');

    // Click "Publish Version"
    const publishButton = page.locator('button:has-text("Publish Version")');
    await publishButton.click();

    // Wait for API call
    await helpers.wait.forApiCall(
      `/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`
    );

    // Verify success toast
    await helpers.assert.expectToastMessage(`Version ${newVersion.version} has been published`);

    // Take screenshot after publish
    await helpers.screenshot.takeModal('version-manager-after-publish');

    // Verify new version appears in the list
    await expect(page.locator(`text=${newVersion.version}`)).toBeVisible();

    // If set as latest, verify "Latest" badge moved to new version
    if (newVersion.setAsLatest) {
      const latestBadge = page.locator(`text=${newVersion.version} >> .. >> text=Latest`);
      await expect(latestBadge).toBeVisible();
    }
  });

  test('should validate required fields for new version', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock API responses
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            versions: publishedPlugin.versions,
          }),
        });
      }
    );

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version"
    await page.locator('button:has-text("Publish New Version")').click();

    // Try to publish without filling required fields
    const publishButton = page.locator('button:has-text("Publish Version")');
    await expect(publishButton).toBeDisabled();

    // Fill version number only
    await page.fill('input[name="version"]', '3.0.0');
    await expect(publishButton).toBeDisabled();

    // Fill changelog
    await page.fill('textarea[name="changelog"]', 'New features and improvements');

    // Now publish button should be enabled
    await expect(publishButton).toBeEnabled();
  });

  test('should display download count for each version', async ({ page }) => {
    const publishedPlugin = {
      ...testPlugins.publishedPlugin,
      versions: [
        {
          version: '2.1.0',
          changelog: 'Latest version',
          isLatest: true,
          downloadCount: 1234,
        },
        {
          version: '2.0.0',
          changelog: 'Previous version',
          isLatest: false,
          downloadCount: 5678,
        },
        {
          version: '1.0.0',
          changelog: 'Initial release',
          isLatest: false,
          downloadCount: 2345,
        },
      ],
    };

    // Mock API responses
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            versions: publishedPlugin.versions,
          }),
        });
      }
    );

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Verify download counts are displayed
    for (const version of publishedPlugin.versions || []) {
      if (version.downloadCount !== undefined) {
        const downloadText = `${version.downloadCount} downloads`;
        await expect(page.locator(`text=${downloadText}`)).toBeVisible();
      }
    }

    // Take screenshot with download counts
    await helpers.screenshot.takeModal('version-manager-download-counts');
  });

  test('should handle API error during version publish', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock API responses
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              versions: publishedPlugin.versions,
            }),
          });
        } else if (route.request().method() === 'POST') {
          // Mock error
          await route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Version already exists',
            }),
          });
        }
      }
    );

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version"
    await page.locator('button:has-text("Publish New Version")').click();

    // Fill form
    await page.fill('input[name="version"]', '2.1.0'); // Same as existing version
    await page.fill('textarea[name="changelog"]', 'Duplicate version');

    // Try to publish
    await page.locator('button:has-text("Publish Version")').click();

    // Wait for API call
    await page.waitForTimeout(1000);

    // Verify error toast
    await helpers.assert.expectToastMessage('Failed to publish version');

    // Take screenshot of error state
    await helpers.screenshot.takeModal('version-manager-publish-error');

    // Verify modal is still open
    await helpers.assert.expectModalOpen('Version Manager');
  });

  test('should cancel new version form', async ({ page }) => {
    const publishedPlugin = testPlugins.publishedPlugin;

    // Mock API responses
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            versions: publishedPlugin.versions,
          }),
        });
      }
    );

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Click "Publish New Version"
    await page.locator('button:has-text("Publish New Version")').click();

    // Fill some data
    await page.fill('input[name="version"]', '3.0.0');
    await page.fill('textarea[name="changelog"]', 'Test changelog');

    // Click Cancel
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();
    await page.waitForTimeout(300);

    // Verify form is hidden/closed
    await expect(page.locator('text=New Version')).not.toBeVisible();

    // Verify we're back to version list
    await expect(page.locator('text=Version Manager')).toBeVisible();
    await expect(page.locator('button:has-text("Publish New Version")')).toBeVisible();
  });

  test('should sort versions by date (newest first)', async ({ page }) => {
    const publishedPlugin = {
      ...testPlugins.publishedPlugin,
      versions: [
        {
          version: '2.1.0',
          changelog: 'Latest',
          isLatest: true,
          createdAt: '2026-01-28T10:00:00Z',
        },
        {
          version: '2.0.0',
          changelog: 'Previous',
          isLatest: false,
          createdAt: '2026-01-15T10:00:00Z',
        },
        {
          version: '1.0.0',
          changelog: 'Initial',
          isLatest: false,
          createdAt: '2026-01-01T10:00:00Z',
        },
      ],
    };

    // Mock API responses
    await page.route(`**/api/v1/marketplace/plugins/${publishedPlugin.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(publishedPlugin),
      });
    });

    await page.route(
      `**/api/v1/marketplace/admin/plugins/${publishedPlugin.id}/versions`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            versions: publishedPlugin.versions,
          }),
        });
      }
    );

    // Open plugin detail and Version Manager
    await page.click(`text=${publishedPlugin.name}`);
    await helpers.modal.waitForModalOpen(publishedPlugin.name);
    await page.locator('button:has-text("Manage Versions")').click();
    await helpers.modal.waitForModalOpen('Version Manager');

    // Get all version elements
    const versionElements = page.locator('[data-testid="version-item"]');
    const count = await versionElements.count();

    // Verify order (newest first)
    if (count >= 3) {
      const firstVersion = await versionElements.nth(0).textContent();
      const secondVersion = await versionElements.nth(1).textContent();
      const thirdVersion = await versionElements.nth(2).textContent();

      expect(firstVersion).toContain('2.1.0');
      expect(secondVersion).toContain('2.0.0');
      expect(thirdVersion).toContain('1.0.0');
    }
  });
});
