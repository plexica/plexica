// user-profile.spec.ts
// E2E-08: User profile (Spec 003, Phase 20.8).
// Tests display name update, avatar upload, timezone/language preferences.
// Timezone and language use Radix <Select> (button trigger + listbox popup);
// the trigger text mirrors the selected option's label exactly, so the current
// value can be captured from the trigger and restored by option name.
// Accessibility/keyboard coverage lives in user-profile-a11y.spec.ts
// (Constitution Rule 4 — no file above 200 lines).
// Skips when Keycloak credentials are absent or the stack is not running.

import { expect, test } from './helpers/base-fixture.js';
import { expectResponseTo } from './helpers/api-response.js';
import {
  hasKeycloak,
  loginAsAdmin,
  requireKeycloakInCI,
  uniqueName,
} from './helpers/admin-login.js';
import { PNG_1X1, runCleanups } from './helpers/settings-fixtures.js';

import type { Cleanup } from './helpers/settings-fixtures.js';
import type { Page } from './helpers/base-fixture.js';

const PROFILE_PATH = '/api/v1/profile';
const AVATAR_PATH = '/api/v1/profile/avatar';

/** Reads the label currently shown by a Radix Select trigger. */
async function currentSelectLabel(page: Page, field: RegExp): Promise<string> {
  const trigger = page.getByRole('combobox', { name: field });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  return (await trigger.innerText()).trim();
}

/** Opens a Radix Select and picks an option by its exact accessible name. */
async function pickSelectOption(page: Page, field: RegExp, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Restores a profile Radix Select to `label` if the test left it changed. */
function restoreSelect(field: RegExp, label: string): Cleanup {
  return async (page: Page): Promise<void> => {
    await page.goto('/profile');
    if ((await currentSelectLabel(page, field)) === label) return;
    await pickSelectOption(page, field, label);
    await expectResponseTo(page, PROFILE_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });
  };
}

test.describe('E2E-08: User profile', () => {
  test.skip(!hasKeycloak, 'Requires live Keycloak (PLAYWRIGHT_KEYCLOAK_* env vars)');

  test.beforeAll(() => {
    requireKeycloakInCI();
  });

  // FIX — order-dependent shared state.
  // Restores used to be inline code placed AFTER the assertions: when an
  // assertion failed or timed out, the reset never ran and the profile stayed
  // on a foreign timezone/language. On retry the "pick a value different from
  // the current one" logic no longer applied, the form was not dirty, Save
  // stayed disabled and the failure cascaded. afterEach runs even when the
  // test body fails, so restores registered here are always executed.
  let cleanups: Cleanup[] = [];

  test.beforeEach(async ({ page }) => {
    cleanups = [];
    await loginAsAdmin(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    const pending = cleanups;
    cleanups = [];
    // Same isolation + deadline guarantees as the tenant-settings suite: one
    // failing restore neither skips the others nor masks the real failure.
    await runCleanups(page, pending, testInfo);
  });

  test('navigate to /profile shows profile page', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
    // i18n: profile.title = 'Profile' (used for both <h1> page title and <h2> section heading)
    await expect(page.getByRole('heading', { name: /profile/i }).first()).toBeVisible();
  });

  test('update display name — server persists it and returns the updated DTO', async ({ page }) => {
    await page.goto('/profile');

    // i18n: profile.displayName.label = 'Display name'
    const displayNameInput = page.getByLabel(/display name/i);
    await expect(displayNameInput).toBeVisible({ timeout: 15_000 });
    const newName = uniqueName('Test User');
    await displayNameInput.clear();
    await displayNameInput.fill(newName);

    const saveResponse = await expectResponseTo(page, PROFILE_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });

    // Response body assertion. PATCH /api/v1/profile currently returns the bare
    // UserProfileDto (services/core-api/src/modules/user-profile/routes.ts:30-43),
    // NOT wrapped in { data }. Status alone would not catch a handler that
    // returns 200 with a stale or empty payload.
    expect(await saveResponse.json()).toMatchObject({ displayName: newName });

    // Round-trip: the value must come back from the server, not from the form.
    await page.reload();
    await expect(page.getByLabel(/display name/i)).toHaveValue(newName, { timeout: 15_000 });
  });

  test('upload avatar — file is persisted and served back as a real URL', async ({ page }) => {
    await page.goto('/profile');

    const fileInput = page.locator('input[type="file"]');

    // FileUpload calls onFile() as soon as the file is selected, which triggers
    // POST /api/v1/profile/avatar (profile-api.ts uploadAvatar).
    const uploadResponse = await expectResponseTo(page, AVATAR_PATH, 'POST', async () => {
      await fileInput.setInputFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: PNG_1X1,
      });
    });

    // Response body assertion — the status alone is not the contract.
    // POST /api/v1/profile/avatar returns the payload BARE
    // (services/core-api/src/modules/user-profile/routes.ts:49-63 →
    // service.ts uploadAvatar: `{ avatarUrl }`), like GET and PATCH /profile.
    // If the `{ data: … }` envelope came back, the client-side safeParse in
    // profile-api.ts would fail while the server-side upload still succeeded —
    // so the reload assertion below would keep passing and hide the regression.
    const uploadBody: unknown = await uploadResponse.json();
    expect(uploadBody).toMatchObject({ avatarUrl: expect.stringMatching(/^https?:\/\//) });
    expect(uploadBody).not.toHaveProperty('data');

    // The preview visible right after selection is a client-side artifact:
    // packages/ui/src/components/file-upload.tsx:64 does URL.createObjectURL(file)
    // and renders <img src="blob:…">, which appears even when the upload fails.
    // Reloading drops that local blob state, so the <img> can only render from
    // data.avatarUrl (profile-page.tsx:131) — a presigned MinIO URL produced by
    // the server. That proves the bytes were really stored and are readable.
    await page.reload();
    const preview = page.getByRole('img', { name: /preview/i });
    await expect(preview).toBeVisible({ timeout: 15_000 });
    await expect(preview).not.toHaveAttribute('src', /^blob:/);
    await expect(preview).toHaveAttribute('src', /^https?:\/\//);
  });

  test('change timezone — server persists the new zone', async ({ page }) => {
    await page.goto('/profile');

    // i18n: profile.timezone.label = 'Timezone'
    const field = /timezone/i;
    const original = await currentSelectLabel(page, field);
    // Pick a zone guaranteed to differ from the current one, otherwise the form
    // is not dirty and Save stays disabled (SaveBar: disabled={!isDirty}).
    const target = original === 'Pacific/Auckland' ? 'Europe/Rome' : 'Pacific/Auckland';
    cleanups.push(restoreSelect(field, original));

    await pickSelectOption(page, field, target);
    await expectResponseTo(page, PROFILE_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });

    await page.reload();
    await expect(page.getByRole('combobox', { name: field })).toHaveText(target, {
      timeout: 15_000,
    });
  });

  test('change language — server persists the new locale', async ({ page }) => {
    await page.goto('/profile');

    // i18n: profile.language.label = 'Language'
    const field = /language/i;
    const original = await currentSelectLabel(page, field);
    const target = original === 'Français' ? 'English' : 'Français';
    cleanups.push(restoreSelect(field, original));

    await pickSelectOption(page, field, target);
    await expectResponseTo(page, PROFILE_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });

    await page.reload();
    await expect(page.getByRole('combobox', { name: field })).toHaveText(target, {
      timeout: 15_000,
    });
  });
});
