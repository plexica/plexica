import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import { testPlugins } from './fixtures/test-data';
import { mockPublishPluginEndpoint } from './helpers/api-mocks';

test.describe('Publish Plugin Wizard E2E', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);

    // Navigate to plugins page (empty list is fine for publish tests)
    await helpers.nav.goToPluginsPage([]);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('publish-plugin-end');
  });

  test('should open publish plugin modal', async ({ page }) => {
    // Click "Publish Plugin" button — use .first() because header + empty-state both have it
    const publishButton = page.locator('button:has-text("Publish Plugin")').first();
    await publishButton.click();

    // Wait for modal to open — title is "Publish New Plugin"
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Verify we're on step 1 (Basic Information)
    await expect(page.locator('text=Basic Information')).toBeVisible();
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();
  });

  test('should complete 4-step wizard and publish plugin successfully', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Mock API response for publishing — correct endpoint: POST /api/marketplace/publish
    await mockPublishPluginEndpoint(page, {
      ...newPlugin,
      status: 'PUBLISHED',
      createdAt: new Date().toISOString(),
    });

    // Click "Publish Plugin" button — use .first() to avoid strict mode error
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // ===== STEP 1: Basic Information =====
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();

    // Verify "Next" button is initially disabled
    const nextButton = page.locator('button:has-text("Next")');
    await expect(nextButton).toBeDisabled();

    // Fill basic information — inputs use placeholder selectors (no name attrs)
    await page.fill('input[placeholder="my-awesome-plugin"]', newPlugin.id);
    await page.fill('input[placeholder="My Awesome Plugin"]', newPlugin.name);
    // Version defaults to "1.0.0" — clear and fill if different
    const versionInput = page.locator('input[placeholder="1.0.0"]');
    await versionInput.clear();
    await versionInput.fill(newPlugin.version);
    await page.fill(
      'input[placeholder="A brief description of your plugin (max 150 chars)"]',
      newPlugin.description
    );

    // Select category — native <select> via label
    await page
      .locator('label:has-text("Category")')
      .locator('..')
      .locator('select')
      .selectOption(newPlugin.category);

    // Fill author info
    await page.fill('input[placeholder="John Doe"]', newPlugin.author);
    await page.fill('input[placeholder="john@example.com"]', newPlugin.authorEmail);

    // License is a <select> with default "MIT" — change to Apache-2.0
    await page
      .locator('label:has-text("License")')
      .locator('..')
      .locator('select')
      .selectOption(newPlugin.license);

    // Verify "Next" button is now enabled
    await expect(nextButton).toBeEnabled();

    // Click Next
    await nextButton.click();
    await page.waitForTimeout(300);

    // ===== STEP 2: Plugin Details =====
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();
    await expect(page.locator('text=Plugin Details')).toBeVisible();

    // Next should be disabled until longDescription is filled
    await expect(nextButton).toBeDisabled();

    // Fill long description
    await page.fill(
      'textarea[placeholder="Provide a detailed description of your plugin, its features, and benefits..."]',
      newPlugin.longDescription
    );

    // Add tags
    const tagInput = page.locator('input[placeholder="Add a tag (press Enter)"]');
    for (const tag of newPlugin.tags) {
      await tagInput.fill(tag);
      await tagInput.press('Enter');
      await page.waitForTimeout(200);
    }

    // Verify tags are displayed as Badge elements
    for (const tag of newPlugin.tags) {
      await expect(page.locator(`text=${tag}`)).toBeVisible();
    }

    // Fill URLs
    await page.fill('input[placeholder="https://myplugin.com"]', newPlugin.homepage);
    await page.fill('input[placeholder="https://github.com/user/plugin"]', newPlugin.repository);

    // Now next should be enabled
    await expect(nextButton).toBeEnabled();

    // Click Next
    await nextButton.click();
    await page.waitForTimeout(300);

    // ===== STEP 3: Media & Assets =====
    await expect(page.locator('text=Step 3 of 4')).toBeVisible();
    await expect(page.locator('text=Media & Assets')).toBeVisible();

    // Fill icon (emoji)
    await page.fill('input[placeholder="🧩"]', newPlugin.icon);

    // Fill demo URL
    await page.fill('input[placeholder="https://demo.myplugin.com"]', newPlugin.demoUrl);

    // Add screenshots
    const screenshotInput = page.locator('input[placeholder="Add screenshot URL (press Enter)"]');
    for (const screenshot of newPlugin.screenshots || []) {
      await screenshotInput.fill(screenshot);
      await screenshotInput.press('Enter');
      await page.waitForTimeout(300);
    }

    // Verify screenshots are displayed (preview images)
    const screenshotPreviews = page.locator('img[src*="picsum.photos"]');
    await expect(screenshotPreviews).toHaveCount(newPlugin.screenshots?.length || 0);

    // Click Next
    await nextButton.click();
    await page.waitForTimeout(300);

    // ===== STEP 4: Review & Publish =====
    await expect(page.locator('text=Step 4 of 4')).toBeVisible();
    await expect(page.locator('text=Review & Publish')).toBeVisible();

    // Verify summary shows entered data
    await expect(page.locator(`text=${newPlugin.name}`)).toBeVisible();
    await expect(page.locator(`text=${newPlugin.version}`)).toBeVisible();
    await expect(page.locator(`text=${newPlugin.author}`)).toBeVisible();

    // Verify tags displayed as individual Badge elements
    for (const tag of newPlugin.tags) {
      await expect(page.locator(`text=${tag}`).first()).toBeVisible();
    }

    // Verify screenshots section: "Screenshots (2)" heading
    await expect(
      page.locator(`text=Screenshots (${newPlugin.screenshots?.length ?? 0})`)
    ).toBeVisible();

    // Click "Publish Plugin" to submit — exact match to avoid matching header buttons with "+ Publish Plugin"
    const publishFinalButton = page.getByRole('button', { name: 'Publish Plugin', exact: true });
    await publishFinalButton.click();

    // Verify success toast (loading state "Publishing..." may flash too quickly with mocked API)
    await helpers.assert.expectToastMessage('Plugin published successfully');

    // Modal should close automatically after success
    await page.waitForTimeout(1000);
    await helpers.assert.expectModalClosed('Publish New Plugin');
  });

  test('should validate required fields in step 1', async ({ page }) => {
    // Click "Publish Plugin" button
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Verify "Next" button is disabled without filling fields
    const nextButton = page.locator('button:has-text("Next")');
    await expect(nextButton).toBeDisabled();

    // Fill only ID
    await page.fill('input[placeholder="my-awesome-plugin"]', 'test-id');
    await expect(nextButton).toBeDisabled();

    // Fill name
    await page.fill('input[placeholder="My Awesome Plugin"]', 'Test Name');
    await expect(nextButton).toBeDisabled();

    // Version already has default "1.0.0" — still disabled because other fields empty
    await expect(nextButton).toBeDisabled();

    // Fill description
    await page.fill(
      'input[placeholder="A brief description of your plugin (max 150 chars)"]',
      'Test description'
    );
    // Select category
    await page
      .locator('label:has-text("Category")')
      .locator('..')
      .locator('select')
      .selectOption('productivity');
    // Fill author
    await page.fill('input[placeholder="John Doe"]', 'Test Author');
    // Fill author email
    await page.fill('input[placeholder="john@example.com"]', 'test@example.com');
    // License has default "MIT" — no need to fill

    // Now next button should be enabled
    await expect(nextButton).toBeEnabled();
  });

  test('should allow going back to edit previous steps', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Fill step 1
    await page.fill('input[placeholder="my-awesome-plugin"]', newPlugin.id);
    await page.fill('input[placeholder="My Awesome Plugin"]', newPlugin.name);
    const versionInput = page.locator('input[placeholder="1.0.0"]');
    await versionInput.clear();
    await versionInput.fill(newPlugin.version);
    await page.fill(
      'input[placeholder="A brief description of your plugin (max 150 chars)"]',
      newPlugin.description
    );
    await page
      .locator('label:has-text("Category")')
      .locator('..')
      .locator('select')
      .selectOption(newPlugin.category);
    await page.fill('input[placeholder="John Doe"]', newPlugin.author);
    await page.fill('input[placeholder="john@example.com"]', newPlugin.authorEmail);
    await page
      .locator('label:has-text("License")')
      .locator('..')
      .locator('select')
      .selectOption(newPlugin.license);

    // Go to step 2
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();

    // Fill step 2 longDescription
    await page.fill(
      'textarea[placeholder="Provide a detailed description of your plugin, its features, and benefits..."]',
      newPlugin.longDescription
    );

    // Go to step 3
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 3 of 4')).toBeVisible();

    // Now go back to step 2
    const backButton = page.locator('button:has-text("Back")');
    await backButton.click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 2 of 4')).toBeVisible();

    // Verify longDescription data is still there
    const longDescTextarea = page.locator(
      'textarea[placeholder="Provide a detailed description of your plugin, its features, and benefits..."]'
    );
    await expect(longDescTextarea).toHaveValue(newPlugin.longDescription);

    // Go back to step 1
    await backButton.click();
    await page.waitForTimeout(300);
    await expect(page.locator('text=Step 1 of 4')).toBeVisible();

    // Verify name data is still there
    await expect(page.locator('input[placeholder="My Awesome Plugin"]')).toHaveValue(
      newPlugin.name
    );
  });

  test('should allow removing added tags', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Fill step 1 to enable next
    await page.fill('input[placeholder="my-awesome-plugin"]', newPlugin.id);
    await page.fill('input[placeholder="My Awesome Plugin"]', newPlugin.name);
    await page.fill(
      'input[placeholder="A brief description of your plugin (max 150 chars)"]',
      newPlugin.description
    );
    await page
      .locator('label:has-text("Category")')
      .locator('..')
      .locator('select')
      .selectOption(newPlugin.category);
    await page.fill('input[placeholder="John Doe"]', newPlugin.author);
    await page.fill('input[placeholder="john@example.com"]', newPlugin.authorEmail);

    // Go to step 2
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Fill longDescription so we're on step 2 properly
    await page.fill(
      'textarea[placeholder="Provide a detailed description of your plugin, its features, and benefits..."]',
      'Some description'
    );

    // Add tags
    const tagInput = page.locator('input[placeholder="Add a tag (press Enter)"]');

    await tagInput.fill('test-tag-1');
    await tagInput.press('Enter');
    await page.waitForTimeout(200);

    await tagInput.fill('test-tag-2');
    await tagInput.press('Enter');
    await page.waitForTimeout(200);

    // Verify both tags are visible
    await expect(page.locator('text=test-tag-1')).toBeVisible();
    await expect(page.locator('text=test-tag-2')).toBeVisible();

    // Remove first tag — Badge has an X button inside it
    // Tags are rendered as <Badge> with X button. Find the badge containing tag text and click X.
    const tag1Badge = page.locator('text=test-tag-1').locator('..').locator('button').first();
    await tag1Badge.click();
    await page.waitForTimeout(200);

    // Verify first tag is removed
    await expect(page.locator('text=test-tag-1')).not.toBeVisible();
    await expect(page.locator('text=test-tag-2')).toBeVisible();
  });

  test('should allow removing added screenshots', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Fill step 1 to enable next
    await page.fill('input[placeholder="my-awesome-plugin"]', newPlugin.id);
    await page.fill('input[placeholder="My Awesome Plugin"]', newPlugin.name);
    await page.fill(
      'input[placeholder="A brief description of your plugin (max 150 chars)"]',
      newPlugin.description
    );
    await page
      .locator('label:has-text("Category")')
      .locator('..')
      .locator('select')
      .selectOption(newPlugin.category);
    await page.fill('input[placeholder="John Doe"]', newPlugin.author);
    await page.fill('input[placeholder="john@example.com"]', newPlugin.authorEmail);

    // Go to step 2
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Fill longDescription so Next is enabled
    await page.fill(
      'textarea[placeholder="Provide a detailed description of your plugin, its features, and benefits..."]',
      'Some description for step 2'
    );

    // Go to step 3
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Add screenshots
    const screenshotInput = page.locator('input[placeholder="Add screenshot URL (press Enter)"]');

    await screenshotInput.fill('https://picsum.photos/800/600?random=1');
    await screenshotInput.press('Enter');
    await page.waitForTimeout(300);

    await screenshotInput.fill('https://picsum.photos/800/600?random=2');
    await screenshotInput.press('Enter');
    await page.waitForTimeout(300);

    // Verify both screenshots are visible
    const screenshots = page.locator('img[src*="picsum.photos"]');
    await expect(screenshots).toHaveCount(2);

    // Remove first screenshot — button is <button class="absolute top-2 right-2 ..."> with X icon (no aria-label)
    const removeButton = page.locator('button.absolute').first();
    await removeButton.click();
    await page.waitForTimeout(200);

    // Verify only one screenshot remains
    await expect(screenshots).toHaveCount(1);
  });

  test('should handle API error during publish', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Mock API error — correct endpoint: POST /api/marketplace/publish
    await mockPublishPluginEndpoint(page, undefined, {
      success: false,
      error: 'Plugin with this ID already exists',
    });

    // Open wizard and fill all steps
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Fill step 1
    await page.fill('input[placeholder="my-awesome-plugin"]', newPlugin.id);
    await page.fill('input[placeholder="My Awesome Plugin"]', newPlugin.name);
    await page.fill(
      'input[placeholder="A brief description of your plugin (max 150 chars)"]',
      newPlugin.description
    );
    await page
      .locator('label:has-text("Category")')
      .locator('..')
      .locator('select')
      .selectOption(newPlugin.category);
    await page.fill('input[placeholder="John Doe"]', newPlugin.author);
    await page.fill('input[placeholder="john@example.com"]', newPlugin.authorEmail);
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Fill step 2 longDescription (required for Next)
    await page.fill(
      'textarea[placeholder="Provide a detailed description of your plugin, its features, and benefits..."]',
      'Some description'
    );
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Skip step 3 (go to review)
    await page.locator('button:has-text("Next")').click();
    await page.waitForTimeout(300);

    // Try to publish — use exact match to avoid matching the header's "+ Publish Plugin" buttons
    await page.getByRole('button', { name: 'Publish Plugin', exact: true }).click();

    // Wait for API call
    await page.waitForTimeout(1000);

    // Verify error toast
    await helpers.assert.expectToastMessage('Failed to publish plugin');

    // Verify modal is still open (not closed on error)
    await helpers.assert.expectModalOpen('Publish New Plugin');
  });

  test('should close wizard and discard changes', async ({ page }) => {
    const newPlugin = testPlugins.newPlugin;

    // Open wizard
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Fill some fields
    await page.fill('input[placeholder="My Awesome Plugin"]', newPlugin.name);

    // Close modal — footer Cancel button (ghost variant)
    await page.locator('button:has-text("Cancel")').click();
    await page.waitForTimeout(300);

    // Verify modal is closed
    await helpers.assert.expectModalClosed('Publish New Plugin');

    // Reopen wizard
    await page.locator('button:has-text("Publish Plugin")').first().click();
    await helpers.modal.waitForModalOpen('Publish New Plugin');

    // Verify fields are empty/default (changes were discarded)
    await expect(page.locator('input[placeholder="My Awesome Plugin"]')).toHaveValue('');
    // Version field has default "1.0.0" — not empty
    await expect(page.locator('input[placeholder="1.0.0"]')).toHaveValue('1.0.0');
  });
});
