import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import { testPlugins } from './fixtures/test-data';

test.describe('Publish Plugin Wizard E2E', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);

    // Authentication is handled by global setup via storage state
    // No need to login here - we're already authenticated!

    // Navigate to plugins page (empty list is fine for publish tests)
    await helpers.nav.goToPluginsPage([]);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('publish-plugin-end');
  });

  test('should open publish plugin modal', async ({ page }) => {
    // Click "Publish Plugin" button
    const publishButton = page.locator('button:has-text("Publish Plugin")');
    await publishButton.click();

    // Wait for modal to open
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Verify we're on step 1 (Basic Information)
    await expect(page.locator('text=Basic Information')).toBeVisible();
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();

    // Take screenshot of empty wizard
    await helpers.screenshot.takeModal('publish-wizard-step-1-empty');
  });

  test('should complete 4-step wizard and publish plugin successfully', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Mock API response for publishing
    await page.route('**/api/v1/marketplace/admin/publish', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...newPlugin,
          status: 'PUBLISHED',
          createdAt: new Date().toISOString(),
        }),
      });
    });

    // Click "Publish Plugin" button
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // ===== STEP 1: Basic Information =====
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();

    // Verify "Next" button is initially disabled
    const nextButton = page.locator('button:has-text("Next")');
    await expect(nextButton).toBeDisabled();

    // Fill basic information
    await page.fill('input[name="id"]', newPlugin.id);
    await page.fill('input[name="name"]', newPlugin.name);
    await page.fill('input[name="version"]', newPlugin.version);
    await page.fill('input[name="description"]', newPlugin.description);

    // Select category
    await page.selectOption('select[name="category"]', newPlugin.category);

    // Fill author info
    await page.fill('input[name="author"]', newPlugin.author);
    await page.fill('input[name="authorEmail"]', newPlugin.authorEmail);
    await page.fill('input[name="license"]', newPlugin.license);

    // Take screenshot of filled step 1
    await helpers.screenshot.takeModal('publish-wizard-step-1-filled');

    // Verify "Next" button is now enabled
    await expect(nextButton).toBeEnabled();

    // Click Next
    await nextButton.click();
    await page.waitForTimeout(300);

    // ===== STEP 2: Details =====
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();
    await expect(page.locator('text=Details')).toBeVisible();

    // Fill long description
    await page.fill('textarea[name="longDescription"]', newPlugin.longDescription);

    // Add tags
    const tagInput = page.locator('input[placeholder*="tag"]');
    for (const tag of newPlugin.tags) {
      await tagInput.fill(tag);
      await page.locator('button:has-text("Add")').click();
      await page.waitForTimeout(200);
    }

    // Verify tags are displayed
    for (const tag of newPlugin.tags) {
      await expect(page.locator(`text=${tag}`)).toBeVisible();
    }

    // Fill URLs
    await page.fill('input[name="homepage"]', newPlugin.homepage);
    await page.fill('input[name="repository"]', newPlugin.repository);

    // Take screenshot of filled step 2
    await helpers.screenshot.takeModal('publish-wizard-step-2-filled');

    // Click Next
    await nextButton.click();
    await page.waitForTimeout(300);

    // ===== STEP 3: Media =====
    await expect(page.locator('text=Step 3 of 4')).toBeVisible();
    await expect(page.locator('text=Media')).toBeVisible();

    // Fill icon (emoji)
    await page.fill('input[name="icon"]', newPlugin.icon);

    // Fill demo URL
    await page.fill('input[name="demoUrl"]', newPlugin.demoUrl);

    // Add screenshots
    const screenshotInput = page.locator('input[placeholder*="screenshot"]');
    for (const screenshot of newPlugin.screenshots || []) {
      await screenshotInput.fill(screenshot);
      await page.locator('button:has-text("Add Screenshot")').click();
      await page.waitForTimeout(200);
    }

    // Verify screenshots are displayed (preview images)
    const screenshotPreviews = page.locator('img[src*="picsum.photos"]');
    await expect(screenshotPreviews).toHaveCount(newPlugin.screenshots?.length || 0);

    // Take screenshot of filled step 3
    await helpers.screenshot.takeModal('publish-wizard-step-3-filled');

    // Click Next
    await nextButton.click();
    await page.waitForTimeout(300);

    // ===== STEP 4: Review & Publish =====
    await expect(page.locator('text=Step 4 of 4')).toBeVisible();
    await expect(page.locator('text=Review & Publish')).toBeVisible();

    // Verify summary shows all entered data
    await expect(page.locator(`text=${newPlugin.name}`)).toBeVisible();
    await expect(page.locator(`text=${newPlugin.version}`)).toBeVisible();
    await expect(page.locator(`text=${newPlugin.author}`)).toBeVisible();
    await expect(page.locator(`text=${newPlugin.category}`)).toBeVisible();

    // Verify tags count
    const tagsText = `${newPlugin.tags.length} tag${newPlugin.tags.length > 1 ? 's' : ''}`;
    await expect(page.locator(`text=${tagsText}`)).toBeVisible();

    // Verify screenshots count
    const screenshotsText = `${newPlugin.screenshots?.length || 0} screenshot${(newPlugin.screenshots?.length || 0) !== 1 ? 's' : ''}`;
    await expect(page.locator(`text=${screenshotsText}`)).toBeVisible();

    // Take screenshot of review step
    await helpers.screenshot.takeModal('publish-wizard-step-4-review');

    // Click "Publish Plugin"
    const publishFinalButton = page.locator('button:has-text("Publish Plugin")');
    await publishFinalButton.click();

    // Verify loading state
    await expect(page.locator('text=Publishing...')).toBeVisible();

    // Wait for API call to complete
    await helpers.wait.forApiCall('/api/v1/marketplace/admin/publish');

    // Verify success toast
    await helpers.assert.expectToastMessage('Plugin published successfully');

    // Wait for modal to close
    await page.waitForTimeout(1000);
    await helpers.assert.expectModalClosed('Publish Plugin');

    // Verify plugin appears in list
    await page.waitForTimeout(500);
    await helpers.assert.expectPluginInList(newPlugin.name);
  });

  test('should validate required fields in step 1', async ({ page }) => {
    // Click "Publish Plugin" button
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Verify "Next" button is disabled without filling fields
    const nextButton = page.locator('button:has-text("Next")');
    await expect(nextButton).toBeDisabled();

    // Fill only ID
    await page.fill('input[name="id"]', 'test-id');
    await expect(nextButton).toBeDisabled();

    // Fill only name
    await page.fill('input[name="name"]', 'Test Name');
    await expect(nextButton).toBeDisabled();

    // Fill version
    await page.fill('input[name="version"]', '1.0.0');
    await expect(nextButton).toBeDisabled();

    // Description should enable next if other required fields are filled
    await page.fill('input[name="description"]', 'Test description');
    await page.selectOption('select[name="category"]', 'productivity');
    await page.fill('input[name="author"]', 'Test Author');
    await page.fill('input[name="authorEmail"]', 'test@example.com');
    await page.fill('input[name="license"]', 'MIT');

    // Now next button should be enabled
    await expect(nextButton).toBeEnabled();
  });

  test('should allow going back to edit previous steps', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Fill step 1
    await page.fill('input[name="id"]', newPlugin.id);
    await page.fill('input[name="name"]', newPlugin.name);
    await page.fill('input[name="version"]', newPlugin.version);
    await page.fill('input[name="description"]', newPlugin.description);
    await page.selectOption('select[name="category"]', newPlugin.category);
    await page.fill('input[name="author"]', newPlugin.author);
    await page.fill('input[name="authorEmail"]', newPlugin.authorEmail);
    await page.fill('input[name="license"]', newPlugin.license);

    // Go to step 2
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();

    // Fill step 2
    await page.fill('textarea[name="longDescription"]', newPlugin.longDescription);

    // Go to step 3
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 3 of 4')).toBeVisible();

    // Now go back to step 2
    const backButton = page.locator('button:has-text("Back")');
    await backButton.click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();

    // Verify data is still there
    const longDescTextarea = page.locator('textarea[name="longDescription"]');
    await expect(longDescTextarea).toHaveValue(newPlugin.longDescription);

    // Go back to step 1
    await backButton.click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();

    // Verify data is still there
    await expect(page.locator('input[name="name"]')).toHaveValue(newPlugin.name);
  });

  test('should allow removing added tags', async ({ page }) => {
    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Fill step 1 to enable next
    const newPlugin = testPlugins.newPlugin;
    await page.fill('input[name="id"]', newPlugin.id);
    await page.fill('input[name="name"]', newPlugin.name);
    await page.fill('input[name="version"]', newPlugin.version);
    await page.fill('input[name="description"]', newPlugin.description);
    await page.selectOption('select[name="category"]', newPlugin.category);
    await page.fill('input[name="author"]', newPlugin.author);
    await page.fill('input[name="authorEmail"]', newPlugin.authorEmail);
    await page.fill('input[name="license"]', newPlugin.license);

    // Go to step 2
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Add tags
    const tagInput = page.locator('input[placeholder*="tag"]');
    await tagInput.fill('test-tag-1');
    await page.locator('button:has-text("Add")').click();
    await page.waitForTimeout(200);

    await tagInput.fill('test-tag-2');
    await page.locator('button:has-text("Add")').click();
    await page.waitForTimeout(200);

    // Verify both tags are visible
    await expect(page.locator('text=test-tag-1')).toBeVisible();
    await expect(page.locator('text=test-tag-2')).toBeVisible();

    // Remove first tag (click X button)
    const removeButton = page.locator('text=test-tag-1 >> .. >> button').first();
    await removeButton.click();
    await page.waitForTimeout(200);

    // Verify first tag is removed
    await expect(page.locator('text=test-tag-1')).not.toBeVisible();
    await expect(page.locator('text=test-tag-2')).toBeVisible();
  });

  test('should allow removing added screenshots', async ({ page }) => {
    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Fill step 1 to enable next
    const newPlugin = testPlugins.newPlugin;
    await page.fill('input[name="id"]', newPlugin.id);
    await page.fill('input[name="name"]', newPlugin.name);
    await page.fill('input[name="version"]', newPlugin.version);
    await page.fill('input[name="description"]', newPlugin.description);
    await page.selectOption('select[name="category"]', newPlugin.category);
    await page.fill('input[name="author"]', newPlugin.author);
    await page.fill('input[name="authorEmail"]', newPlugin.authorEmail);
    await page.fill('input[name="license"]', newPlugin.license);

    // Go to step 2, then step 3
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Add screenshots
    const screenshotInput = page.locator('input[placeholder*="screenshot"]');
    await screenshotInput.fill('https://picsum.photos/800/600?random=1');
    await page.locator('button:has-text("Add Screenshot")').click();
    await page.waitForTimeout(300);

    await screenshotInput.fill('https://picsum.photos/800/600?random=2');
    await page.locator('button:has-text("Add Screenshot")').click();
    await page.waitForTimeout(300);

    // Verify both screenshots are visible
    const screenshots = page.locator('img[src*="picsum.photos"]');
    await expect(screenshots).toHaveCount(2);

    // Remove first screenshot
    const removeButton = page.locator('button[aria-label*="Remove"]').first();
    await removeButton.click();
    await page.waitForTimeout(200);

    // Verify only one screenshot remains
    await expect(screenshots).toHaveCount(1);
  });

  test('should handle API error during publish', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Mock API error
    await page.route('**/api/v1/marketplace/admin/publish', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Plugin with this ID already exists',
        }),
      });
    });

    // Open wizard and fill all steps
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Fill step 1
    await page.fill('input[name="id"]', newPlugin.id);
    await page.fill('input[name="name"]', newPlugin.name);
    await page.fill('input[name="version"]', newPlugin.version);
    await page.fill('input[name="description"]', newPlugin.description);
    await page.selectOption('select[name="category"]', newPlugin.category);
    await page.fill('input[name="author"]', newPlugin.author);
    await page.fill('input[name="authorEmail"]', newPlugin.authorEmail);
    await page.fill('input[name="license"]', newPlugin.license);
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Skip step 2 (just go to next)
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Skip step 3 (go to review)
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Try to publish
    await page.locator('button:has-text("Publish Plugin")').click();

    // Wait for API call
    await page.waitForTimeout(1000);

    // Verify error toast
    await helpers.assert.expectToastMessage('Failed to publish plugin');

    // Take screenshot of error state
    await helpers.screenshot.takeModal('publish-wizard-error');

    // Verify modal is still open (not closed on error)
    await helpers.assert.expectModalOpen('Publish Plugin');
  });

  test('should close wizard and discard changes', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Fill some fields
    await page.fill('input[name="name"]', newPlugin.name);
    await page.fill('input[name="version"]', newPlugin.version);

    // Close modal
    await helpers.modal.closeModal();

    // Verify modal is closed
    await helpers.assert.expectModalClosed('Publish Plugin');

    // Reopen wizard
    await page.locator('button:has-text("Publish Plugin")').click();
    await helpers.modal.waitForModalOpen('Publish Plugin');

    // Verify fields are empty (changes were discarded)
    await expect(page.locator('input[name="name"]')).toHaveValue('');
    await expect(page.locator('input[name="version"]')).toHaveValue('');
  });
});
