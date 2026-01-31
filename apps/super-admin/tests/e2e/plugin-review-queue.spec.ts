import { test, expect } from '@playwright/test';
import { TestHelpers } from './helpers/test-helpers';
import { testPlugins, apiEndpoints } from './fixtures/test-data';

test.describe('Plugin Review Queue E2E', () => {
  let helpers: TestHelpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);

    // Authentication is handled by global setup via storage state
    // No need to login here - we're already authenticated!

    // Navigate to plugins page with pending plugin in the list
    await helpers.nav.goToPluginsPage([testPlugins.pendingPlugin]);
  });

  test.afterEach(async () => {
    await helpers.screenshot.takeFullPage('review-queue-end');
  });

  test('should display pending plugins in review queue', async ({ page }) => {
    // Mock API to return pending plugins
    await helpers.api.mockGetPendingPlugins([testPlugins.pendingPlugin]);

    // Navigate to Review Queue tab
    await helpers.nav.goToReviewQueue();

    // Verify pending plugin appears in the queue
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();
    await expect(page.locator(`text=${testPlugins.pendingPlugin.description}`)).toBeVisible();

    // Verify "Review" button is present
    await expect(
      page.locator(`text=${testPlugins.pendingPlugin.name} >> .. >> button:has-text("Review")`)
    ).toBeVisible();

    // Take screenshot of the review queue
    await helpers.screenshot.takeFullPage('review-queue-with-pending-plugin');
  });

  test('should approve plugin successfully', async ({ page }) => {
    // Mock API responses
    await helpers.api.mockGetPendingPlugins([testPlugins.pendingPlugin]);
    await helpers.api.mockApprovePlugin(testPlugins.pendingPlugin.id, {
      ...testPlugins.pendingPlugin,
      status: 'PUBLISHED',
    });

    // Navigate to Review Queue tab
    await helpers.nav.goToReviewQueue();

    // Wait for pending plugin to be visible
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();

    // Click "Review" button
    const reviewButton = page.locator(
      `text=${testPlugins.pendingPlugin.name} >> .. >> button:has-text("Review")`
    );
    await reviewButton.click();

    // Wait for review dialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Verify plugin details are displayed
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();
    await expect(page.locator(`text=${testPlugins.pendingPlugin.description}`)).toBeVisible();
    await expect(page.locator(`text=${testPlugins.pendingPlugin.author}`)).toBeVisible();

    // Take screenshot of review dialog
    await helpers.screenshot.takeModal('review-dialog-before-approve');

    // Click "Approve" button
    const approveButton = page.locator('button:has-text("Approve")');
    await approveButton.click();

    // Wait for API call to complete
    await helpers.wait.forApiCall(
      `${apiEndpoints.marketplace.reviewPlugin(testPlugins.pendingPlugin.id)}/approve`
    );

    // Verify success toast appears
    await helpers.assert.expectToastMessage('Plugin approved');
    await helpers.screenshot.takeFullPage('review-queue-approve-toast');

    // Wait for toast to disappear
    await helpers.wait.forToastDisappear();

    // Mock empty pending plugins (plugin was approved)
    await helpers.api.mockGetPendingPlugins([]);

    // Refresh the queue
    await page.reload();
    await helpers.wait.forNetworkIdle();

    // Verify plugin is removed from queue
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).not.toBeVisible();

    // Verify empty state message
    await expect(page.locator('text=No pending reviews')).toBeVisible();
  });

  test('should reject plugin with reason', async ({ page }) => {
    const rejectionReason = 'Plugin does not meet quality standards. Please improve documentation.';

    // Mock API responses
    await helpers.api.mockGetPendingPlugins([testPlugins.pendingPlugin]);
    await helpers.api.mockRejectPlugin(testPlugins.pendingPlugin.id, {
      ...testPlugins.pendingPlugin,
      status: 'REJECTED',
    });

    // Navigate to Review Queue tab
    await helpers.nav.goToReviewQueue();

    // Wait for pending plugin to be visible
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();

    // Click "Review" button
    const reviewButton = page.locator(
      `text=${testPlugins.pendingPlugin.name} >> .. >> button:has-text("Review")`
    );
    await reviewButton.click();

    // Wait for review dialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Click "Reject" button
    const rejectButton = page.locator('button:has-text("Reject")');
    await rejectButton.click();

    // Wait for rejection reason textarea to appear
    await expect(page.locator('textarea[placeholder*="reason"]')).toBeVisible();

    // Take screenshot of rejection form
    await helpers.screenshot.takeModal('review-dialog-rejection-form');

    // Try to submit without reason (should fail validation)
    const submitButton = page.locator('button:has-text("Submit")');
    await submitButton.click();

    // Verify validation error
    await expect(page.locator('text=Rejection reason is required')).toBeVisible();

    // Fill rejection reason
    await helpers.form.fillTextarea('textarea[placeholder*="reason"]', rejectionReason);

    // Take screenshot with filled reason
    await helpers.screenshot.takeModal('review-dialog-rejection-filled');

    // Submit rejection
    await submitButton.click();

    // Wait for API call to complete
    await helpers.wait.forApiCall(
      `${apiEndpoints.marketplace.reviewPlugin(testPlugins.pendingPlugin.id)}/reject`
    );

    // Verify success toast appears
    await helpers.assert.expectToastMessage('Plugin rejected');
    await helpers.screenshot.takeFullPage('review-queue-reject-toast');

    // Wait for toast to disappear
    await helpers.wait.forToastDisappear();

    // Mock empty pending plugins (plugin was rejected)
    await helpers.api.mockGetPendingPlugins([]);

    // Refresh the queue
    await page.reload();
    await helpers.wait.forNetworkIdle();

    // Verify plugin is removed from queue
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).not.toBeVisible();

    // Verify empty state message
    await expect(page.locator('text=No pending reviews')).toBeVisible();
  });

  test('should display empty state when no pending reviews', async ({ page }) => {
    // Mock API to return empty array
    await helpers.api.mockGetPendingPlugins([]);

    // Navigate to Review Queue tab
    await helpers.nav.goToReviewQueue();

    // Verify empty state message
    await expect(page.locator('text=No pending reviews')).toBeVisible();
    await expect(page.locator('text=All plugins have been reviewed')).toBeVisible();

    // Take screenshot of empty state
    await helpers.screenshot.takeFullPage('review-queue-empty-state');
  });

  test('should handle multiple pending plugins', async ({ page }) => {
    const secondPlugin = {
      ...testPlugins.pendingPlugin,
      id: 'pending-plugin-2',
      name: 'Another Pending Plugin',
      description: 'Another plugin waiting for review',
    };

    // Mock API to return multiple pending plugins
    await helpers.api.mockGetPendingPlugins([testPlugins.pendingPlugin, secondPlugin]);

    // Navigate to Review Queue tab
    await helpers.nav.goToReviewQueue();

    // Verify both plugins are visible
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();
    await expect(page.locator(`text=${secondPlugin.name}`)).toBeVisible();

    // Verify both have Review buttons
    const reviewButtons = page.locator('button:has-text("Review")');
    await expect(reviewButtons).toHaveCount(2);

    // Take screenshot with multiple plugins
    await helpers.screenshot.takeFullPage('review-queue-multiple-plugins');
  });

  test('should close review dialog without action', async ({ page }) => {
    // Mock API responses
    await helpers.api.mockGetPendingPlugins([testPlugins.pendingPlugin]);

    // Navigate to Review Queue tab
    await helpers.nav.goToReviewQueue();

    // Click "Review" button
    const reviewButton = page.locator(
      `text=${testPlugins.pendingPlugin.name} >> .. >> button:has-text("Review")`
    );
    await reviewButton.click();

    // Wait for review dialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Close dialog using X button or Cancel
    await helpers.modal.closeModal();

    // Verify dialog is closed
    await expect(page.locator('text=Review Plugin')).not.toBeVisible();

    // Verify plugin is still in queue
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();
  });

  test('should handle API error during approval', async ({ page }) => {
    // Mock API responses
    await helpers.api.mockGetPendingPlugins([testPlugins.pendingPlugin]);

    // Mock API error for approval
    await page.route(
      `**/api/v1/marketplace/admin/review/${testPlugins.pendingPlugin.id}/approve`,
      (route) => route.abort('failed')
    );

    // Navigate to Review Queue tab
    await helpers.nav.goToReviewQueue();

    // Click "Review" button
    const reviewButton = page.locator(
      `text=${testPlugins.pendingPlugin.name} >> .. >> button:has-text("Review")`
    );
    await reviewButton.click();

    // Wait for review dialog to open
    await helpers.modal.waitForModalOpen('Review Plugin');

    // Click "Approve" button
    const approveButton = page.locator('button:has-text("Approve")');
    await approveButton.click();

    // Verify error toast appears
    await helpers.assert.expectToastMessage('Failed to approve plugin');

    // Take screenshot of error state
    await helpers.screenshot.takeFullPage('review-queue-approve-error');

    // Verify plugin is still in queue after error
    await helpers.modal.closeModal();
    await expect(page.locator(`text=${testPlugins.pendingPlugin.name}`)).toBeVisible();
  });
});
