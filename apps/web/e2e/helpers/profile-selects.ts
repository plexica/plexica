// profile-selects.ts
// Radix Select helpers for the profile E2E specs (timezone/language).
// Split from user-profile.spec.ts to honor the 200-line gate (Rule 4).

import { expect } from './base-fixture.js';
import { expectResponseTo } from './api-response.js';

import type { Cleanup } from './settings-fixtures.js';
import type { Page } from './base-fixture.js';

const PROFILE_PATH = '/api/v1/profile';

/** Reads the label currently shown by a Radix Select trigger. */
export async function currentSelectLabel(page: Page, field: RegExp): Promise<string> {
  const trigger = page.getByRole('combobox', { name: field });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  return (await trigger.innerText()).trim();
}

/** Opens a Radix Select and picks an option by its exact accessible name. */
export async function pickSelectOption(page: Page, field: RegExp, option: string): Promise<void> {
  await page.getByRole('combobox', { name: field }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Restores a profile Radix Select to `label` if the test left it changed. */
export function restoreSelect(field: RegExp, label: string): Cleanup {
  return async (page: Page): Promise<void> => {
    await page.goto('/profile');
    if ((await currentSelectLabel(page, field)) === label) return;
    await pickSelectOption(page, field, label);
    await expectResponseTo(page, PROFILE_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });
  };
}
