// ac-03-visibility.spec.ts — Spec 004, AC-03: Plugin Workspace Visibility.
// Real behavior: open the visibility editor for an installed plugin, toggle a
// workspace off, see the UI reflect the pending change, toggle it back on.

import { expect, test } from '../helpers/base-fixture.js';
import {
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from '../helpers/admin-login.js';
import {
  createWorkspaceFixture,
  ensureCrmInstalled,
  getBrowserToken,
} from '../helpers/plugin-fixtures.js';

import type { APIResponse } from '@playwright/test';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

interface VisibilityEntry {
  workspaceId: string;
  isEnabled: boolean;
  isOverride: boolean;
}

async function expectPersistedVisibility(
  response: APIResponse,
  workspaceId: string,
  isEnabled: boolean
): Promise<void> {
  expect(response.status()).toBe(200);
  const entries = (await response.json()) as VisibilityEntry[];
  expect(entries.find((entry) => entry.workspaceId === workspaceId)).toEqual({
    workspaceId,
    workspaceName: expect.any(String),
    isEnabled,
    isOverride: true,
    updatedAt: expect.any(String),
  });
}

test.describe('004 Plugin System — AC-03: Plugin Workspace Visibility', () => {
  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('toggling a workspace visibility switch updates the UI and reverts', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const workspaceName = uniqueName('plugin-visibility');
    const workspaceId = await createWorkspaceFixture(page, token, workspaceName);
    const installId = await ensureCrmInstalled(page, token);
    await page.goto('/settings/plugins');

    await expect(page.getByRole('heading', { name: /installed plugins/i })).toBeVisible({ timeout: 10_000 });

    const visibilityToggle = page.getByRole('button', { name: /visibility/i }).first();
    await expect(visibilityToggle).toBeVisible({ timeout: 15_000 });
    await visibilityToggle.click();

    const workspaceSwitch = page.getByRole('switch', { name: `${workspaceName} visibility` });
    await expect(workspaceSwitch).toBeVisible({ timeout: 15_000 });
    const initial = await workspaceSwitch.getAttribute('aria-checked');
    const wasChecked = initial === 'true';
    const changedValue = !wasChecked;

    await workspaceSwitch.click();
    await expect(workspaceSwitch).toHaveAttribute('aria-checked', String(changedValue));
    const changedPatch = page.waitForResponse(
      (response) =>
        response.url().includes(`/plugins/${installId}/visibility`) &&
        response.request().method() === 'PATCH'
    );
    const changedRefresh = page.waitForResponse(
      (response) =>
        response.url().includes(`/plugins/${installId}/visibility`) &&
        response.request().method() === 'GET'
    );
    await page.getByRole('button', { name: /save changes/i }).click();
    expect((await changedPatch).status()).toBe(200);
    await expectPersistedVisibility(await changedRefresh, workspaceId, changedValue);
    await expect(workspaceSwitch).toHaveAttribute('aria-checked', String(changedValue));

    await workspaceSwitch.click();
    await expect(workspaceSwitch).toHaveAttribute('aria-checked', String(wasChecked));
    const revertedPatch = page.waitForResponse(
      (response) =>
        response.url().includes(`/plugins/${installId}/visibility`) &&
        response.request().method() === 'PATCH'
    );
    const revertedRefresh = page.waitForResponse(
      (response) =>
        response.url().includes(`/plugins/${installId}/visibility`) &&
        response.request().method() === 'GET'
    );
    await page.getByRole('button', { name: /save changes/i }).click();
    expect((await revertedPatch).status()).toBe(200);
    await expectPersistedVisibility(await revertedRefresh, workspaceId, wasChecked);
    await expect(workspaceSwitch).toHaveAttribute('aria-checked', String(wasChecked));

    const finalResponse = await page.request.get(
      `${API_BASE}/api/v1/plugins/${installId}/visibility`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    await expectPersistedVisibility(finalResponse, workspaceId, wasChecked);
  });
});
