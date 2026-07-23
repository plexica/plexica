// ac-03-visibility.spec.ts — Spec 004, AC-03: Plugin Workspace Visibility.
// Real behavior: open the visibility editor for an installed plugin, toggle a
// workspace off, see the UI reflect the pending change, toggle it back on.

import { randomUUID } from 'node:crypto';

import { setWorkspaceMembershipFixture } from '../../../../e2e/fixtures/crm-database-fixture.js';
import { expect, test } from '../helpers/base-fixture.js';
import {
  ADMIN_TENANT_SLUG,
  loginAsAdmin,
  loginAsMember,
  loginAsViewer,
  requireKeycloakInCI,
  uniqueName,
} from '../helpers/admin-login.js';
import {
  createWorkspaceFixture,
  ensureCrmInstalled,
  getBrowserToken,
} from '../helpers/plugin-fixtures.js';

const API_BASE = process.env['PLAYWRIGHT_API_URL'] ?? 'http://localhost:3001';

interface VisibilityEntry {
  workspaceId: string;
  isEnabled: boolean;
  isOverride: boolean;
}

let installId = '';
let workspaceId = '';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Tenant-Slug': ADMIN_TENANT_SLUG,
    'Content-Type': 'application/json',
  };
}

async function profileId(page: import('@playwright/test').Page, token: string): Promise<string> {
  const response = await page.request.get(`${API_BASE}/api/v1/profile`, { headers: headers(token) });
  expect(response.status(), JSON.stringify(await response.json())).toBe(200);
  return ((await response.json()) as { userId: string }).userId;
}

async function patchVisibility(
  page: import('@playwright/test').Page,
  token: string,
  targetWorkspaceId: string,
): Promise<import('@playwright/test').APIResponse> {
  return page.request.patch(`${API_BASE}/api/v1/plugins/${installId}/visibility`, {
    headers: headers(token),
    data: [{ workspaceId: targetWorkspaceId, isEnabled: false }],
  });
}

async function expectPersistedVisibility(
  response: { status: () => number; json: () => Promise<unknown> },
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

test.describe.serial('004 Plugin System — AC-03: Plugin Workspace Visibility', () => {
  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  test('toggling a workspace visibility switch updates the UI and reverts', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const workspaceName = uniqueName('plugin-visibility');
    workspaceId = await createWorkspaceFixture(page, token, workspaceName);
    installId = await ensureCrmInstalled(page, token);
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

  test('workspace admin can update visibility with workspace:update', async ({ page }) => {
    await loginAsMember(page);
    const token = await getBrowserToken(page);
    await setWorkspaceMembershipFixture(workspaceId, await profileId(page, token), 'admin');
    expect((await patchVisibility(page, token, workspaceId)).status()).toBe(200);
  });

  test('non-member cannot update workspace visibility', async ({ page }) => {
    await loginAsViewer(page);
    const token = await getBrowserToken(page);
    expect((await patchVisibility(page, token, workspaceId)).status()).toBe(403);
  });

  test('tenant admin cannot forge a missing workspace id', async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getBrowserToken(page);
    const response = await patchVisibility(page, token, randomUUID());
    expect(response.status()).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'WORKSPACE_NOT_FOUND' } });
  });
});
