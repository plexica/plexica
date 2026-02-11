import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import { testPlugins } from './fixtures/test-data';
import { mockPluginReviewEndpoint } from './helpers/api-mocks';

test.describe('Plugin Review Queue E2E', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('review-queue-end');
  });

  test('should display pending plugins in review queue', async ({ page }) => {
    const pendingPlugin = testPlugins.pendingPlugin;

    // goToReviewQueue registers marketplace search mock for PENDING_REVIEW BEFORE clicking tab
    await helpers.nav.goToReviewQueue([pendingPlugin]);

    // Verify pending plugin appears in the queue
    await expect(page.locator(`text=${pendingPlugin.name}`)).toBeVisible();
    await expect(page.locator(`text=${pendingPlugin.description}`)).toBeVisible();

    // Verify "Review" button is present — find the card that contains plugin name
    const pluginCard = page
      .locator('div')
      .filter({ hasText: pendingPlugin.name })
      .filter({ has: page.locator('button:has-text("Review")') })
      .last();
    await expect(pluginCard.locator('button:has-text("Review")')).toBeVisible();
  });

  test('should approve plugin successfully', async ({ page }) => {
    const pendingPlugin = testPlugins.pendingPlugin;

    // Navigate to Review Queue with the pending plugin
    await helpers.nav.goToReviewQueue([pendingPlugin]);

    // Mock review endpoint AFTER goToReviewQueue so it takes LIFO priority over the catch-all
    await mockPluginReviewEndpoint(page, pendingPlugin.id);

    // Wait for pending plugin to be visible
    await expect(page.locator(`text=${pendingPlugin.name}`)).toBeVisible();

    // Click "Review" button — find the card containing the plugin name
    const pluginCard = page
      .locator('div')
      .filter({ hasText: pendingPlugin.name })
      .filter({ has: page.locator('button:has-text("Review")') })
      .last();
    await pluginCard.locator('button:has-text("Review")').click();

    // Wait for ReviewDialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Verify dialog opened with correct plugin (check heading in dialog)
    await expect(page.getByRole('heading', { name: pendingPlugin.name })).toBeVisible();

    // Two-step approve flow:
    // Step 1: Click "Approve" button → shows green confirmation panel
    const approveButton = page.locator('button:has-text("Approve")');
    await approveButton.click();

    // Verify confirmation panel appears
    await expect(page.locator('text=Ready to approve')).toBeVisible();

    // Step 2: Click "Confirm Approval" to finalize
    const confirmButton = page.locator('button:has-text("Confirm Approval")');
    await confirmButton.click();

    // Verify success toast: title "Success", description "Plugin approved successfully"
    await helpers.assert.expectToastMessage('Plugin approved successfully');
  });

  test('should reject plugin with reason', async ({ page }) => {
    const pendingPlugin = testPlugins.pendingPlugin;
    const rejectionReason = 'Plugin does not meet quality standards. Please improve documentation.';

    // Navigate to Review Queue
    await helpers.nav.goToReviewQueue([pendingPlugin]);

    // Mock review endpoint AFTER goToReviewQueue so it takes LIFO priority over the catch-all
    await mockPluginReviewEndpoint(page, pendingPlugin.id);

    // Wait for pending plugin
    await expect(page.locator(`text=${pendingPlugin.name}`)).toBeVisible();

    // Click "Review" button — find the card containing the plugin name
    const pluginCard = page
      .locator('div')
      .filter({ hasText: pendingPlugin.name })
      .filter({ has: page.locator('button:has-text("Review")') })
      .last();
    await pluginCard.locator('button:has-text("Review")').click();

    // Wait for ReviewDialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Two-step reject flow:
    // Step 1: Click "Reject" button → shows red rejection panel + textarea
    const rejectButton = page.locator('button:has-text("Reject")');
    await rejectButton.click();

    // Verify rejection textarea appears
    const rejectionTextarea = page.locator(
      'textarea[placeholder="Explain why this plugin is being rejected..."]'
    );
    await expect(rejectionTextarea).toBeVisible();

    // Try to submit without reason — click "Confirm Rejection"
    const confirmRejectButton = page.locator('button:has-text("Confirm Rejection")');
    await confirmRejectButton.click();

    // Verify validation toast: title "Error", description "Please provide a reason for rejection"
    await helpers.assert.expectToastMessage('Please provide a reason for rejection');

    // Fill rejection reason
    await rejectionTextarea.fill(rejectionReason);

    // Submit rejection
    await confirmRejectButton.click();

    // Verify success toast: title "Success", description "Plugin rejected successfully"
    await helpers.assert.expectToastMessage('Plugin rejected successfully');
  });

  test('should display empty state when no pending reviews', async ({ page }) => {
    // Navigate to Review Queue with empty list
    await helpers.nav.goToReviewQueue([]);

    // Verify empty state: "All Caught Up!" heading and "No plugins pending review at the moment."
    await expect(page.locator('text=All Caught Up!')).toBeVisible();
    await expect(page.locator('text=No plugins pending review at the moment.')).toBeVisible();
  });

  test('should handle multiple pending plugins', async ({ page }) => {
    const secondPlugin = {
      ...testPlugins.pendingPlugin,
      id: 'pending-plugin-2',
      name: 'Another Pending Plugin',
      description: 'Another plugin waiting for review',
    };

    // Navigate to Review Queue with multiple plugins
    await helpers.nav.goToReviewQueue([testPlugins.pendingPlugin, secondPlugin]);

    // Verify both plugins are visible
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();
    await expect(page.locator(`text=${secondPlugin.name}`)).toBeVisible();

    // Verify both have Review buttons (exact match to exclude "Review Queue" tab button)
    const reviewButtons = page.getByRole('button', { name: 'Review', exact: true });
    await expect(reviewButtons).toHaveCount(2);
  });

  test('should close review dialog without action', async ({ page }) => {
    const pendingPlugin = testPlugins.pendingPlugin;

    // Navigate to Review Queue
    await helpers.nav.goToReviewQueue([pendingPlugin]);

    // Click "Review" button — find the card containing the plugin name
    const pluginCard = page
      .locator('div')
      .filter({ hasText: pendingPlugin.name })
      .filter({ has: page.locator('button:has-text("Review")') })
      .last();
    await pluginCard.locator('button:has-text("Review")').click();

    // Wait for ReviewDialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Close dialog — "Close" button is visible when no action selected
    await page.locator('button:has-text("Close")').click();
    await page.waitForTimeout(300);

    // Verify dialog is closed
    await expect(page.locator('h2:has-text("Review Plugin")')).not.toBeVisible();

    // Verify plugin is still in queue
    await expect(page.locator(`text=${pendingPlugin.name}`)).toBeVisible();
  });

  test('should handle API error during approval', async ({ page }) => {
    const pendingPlugin = testPlugins.pendingPlugin;

    // Navigate to Review Queue
    await helpers.nav.goToReviewQueue([pendingPlugin]);

    // Mock review endpoint with error AFTER goToReviewQueue (LIFO priority)
    await mockPluginReviewEndpoint(page, pendingPlugin.id, {
      success: false,
      error: 'Review failed',
    });

    // Click "Review" button — find the card containing the plugin name
    const pluginCard = page
      .locator('div')
      .filter({ hasText: pendingPlugin.name })
      .filter({ has: page.locator('button:has-text("Review")') })
      .last();
    await pluginCard.locator('button:has-text("Review")').click();

    // Wait for ReviewDialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Two-step approve: Approve → Confirm Approval
    await page.locator('button:has-text("Approve")').click();
    await expect(page.locator('text=Ready to approve')).toBeVisible();
    await page.locator('button:has-text("Confirm Approval")').click();

    // Verify error toast
    await helpers.assert.expectToastMessage('Failed to approve plugin');
  });
});
