// 005-07-deletion.spec.ts — Deletion saga E2E (Feature 005-07).
// Provision a throwaway tenant via the admin API → open its detail → Delete
// with type-to-confirm → watch the deletion panel → poll until all 3 steps are
// done → verify the tenant row is `deleted` and the saga steps are all `done`.
// The test is its own cleanup: the provisioned tenant is permanently erased.
//
// NOTE: the bounded 7-minute saga wait covers the slow self-hosted CI Keycloak
// while still failing with the exact incomplete/failed step state.
// Tenant is provisioned INSIDE the test (not in beforeAll) so retries get a
// fresh tenant — avoids 500 errors from re-visiting a partially deleted tenant.

import { randomUUID } from 'node:crypto';

import { expect, test } from './helpers/base-fixture.js';
import { loginAsAdmin, requireKeycloakInCI } from './helpers/admin-login.js';
import { adminApi } from './helpers/api-client.js';

import type { AdminApiClient, DeletionStatusResponse } from './helpers/api-client.js';

const SAGA_TIMEOUT_MS = 420_000;

async function waitForCompletedSaga(
  api: AdminApiClient,
  tenantId: string
): Promise<DeletionStatusResponse> {
  const deadline = Date.now() + SAGA_TIMEOUT_MS;
  let latest: DeletionStatusResponse = { steps: [] };
  while (Date.now() < deadline) {
    latest = await api.getDeletionStatus(tenantId);
    const failed = latest.steps.find((step) => step.status === 'failed');
    if (failed !== undefined) {
      throw new Error(
        `Deletion step ${failed.step} failed after ${String(failed.attempts)} attempts: ` +
          (failed.lastError ?? 'no error reported')
      );
    }
    if (latest.steps.length === 3 && latest.steps.every((step) => step.status === 'done')) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Deletion saga timed out. Last state: ${JSON.stringify(latest.steps)}`);
}

test.describe('005-07 Tenant deletion saga', () => {
  test.beforeAll(() => requireKeycloakInCI());

  test(
    'deleting a tenant erases schema/realm/bucket and marks it deleted',
    async ({ page }) => {
      test.setTimeout(480_000);

      const suffix = randomUUID().slice(0, 8);
      const slug = `e2e-del-${suffix}`;
      const name = `E2E Delete ${suffix}`;
      const adminEmail = `admin@${slug}.local`;

      const api = adminApi();
      const result = await api.provisionTenant({ slug, name, adminEmail });
      const tenantId = result.tenantId;

      await loginAsAdmin(page);
      await page.goto(`/tenants/${tenantId}`);
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({
        timeout: 15_000,
      });

      // Open the type-to-confirm delete dialog.
      await page.getByRole('button', { name: `Delete ${name}` }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      // Type the slug exactly to arm the destructive confirm button.
      await page.getByLabel(/Type the tenant slug/i).fill(slug);
      await dialog.getByRole('button', { name: 'Delete Permanently' }).click();

      const deletionPanel = page.getByRole('region', {
        name: `Deletion in progress — ${name}`,
      });
      await expect(deletionPanel).toBeVisible({ timeout: 15_000 });

      const status = await waitForCompletedSaga(api, tenantId);
      await expect(deletionPanel.getByText(/Deletion complete/)).toBeVisible({
        timeout: 15_000,
      });
      const tenantInformation = page.getByRole('region', { name: 'Tenant information' });
      await expect(tenantInformation.getByText('Deleted', { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      // Source-of-truth checks via the admin API.
      const deletedTenant = await api.findTenantBySlug(slug);
      expect(deletedTenant).toMatchObject({ id: tenantId, slug, status: 'deleted' });
      expect(status.steps).toEqual([
        expect.objectContaining({ step: 'schema_drop', status: 'done' }),
        expect.objectContaining({ step: 'realm_delete', status: 'done' }),
        expect.objectContaining({ step: 'bucket_delete', status: 'done' }),
      ]);
    }
  );
});
