// settings-fixtures.ts
// Shared fixtures and cleanup factories for the settings/profile E2E specs.
//
// The cleanup factories are returned as closures so a test can register them
// BEFORE mutating state, and afterEach can execute them even when the test body
// fails or times out. Inline cleanup after the assertions is skipped on failure,
// which used to leave the tenant permanently renamed / flipped and poison both
// the retry and every subsequent test.
//
// Each cleanup is a no-op when the value already matches the original: the
// Save button is `disabled={!isDirty}` (settings-section.tsx SaveBar), so
// submitting an unchanged form would hang waiting for a PATCH that never fires.

import { expect } from '@playwright/test';

import { expectResponseTo } from './api-response.js';

import type { Page, TestInfo } from '@playwright/test';

export const SETTINGS_PATH = '/api/v1/tenant/settings';
export const BRANDING_PATH = '/api/v1/tenant/branding';
export const AUTH_CONFIG_PATH = '/api/v1/tenant/auth-config';

/** A cleanup registered by a test and executed by afterEach. */
export type Cleanup = (page: Page) => Promise<void>;

/** Hard ceiling for a single cleanup — see runCleanups(). */
const CLEANUP_DEADLINE_MS = 15_000;

/**
 * Runs every registered cleanup, in order, without letting teardown decide the
 * verdict of the test.
 *
 * Two failure modes are neutralised:
 *   * `for (const run of pending) await run(page)` aborted the whole chain at
 *     the first rejection, so one failed restore left every later one unapplied
 *     AND failed an otherwise green test. Each cleanup is now isolated.
 *   * Every cleanup starts with `page.goto('/settings…')` and waits up to 15 s
 *     for a form control. When the test failed because authentication broke,
 *     that wait consumed the remaining test budget and Playwright reported a
 *     timeout "in afterEach hook", masking the real failure. Each cleanup now
 *     races an explicit deadline, and failures are reported as annotations.
 *
 * The deadline is a bound on an already-failing operation, not a sleep: nothing
 * here waits for a fixed duration on the happy path.
 */
export async function runCleanups(
  page: Page,
  pending: Cleanup[],
  testInfo: TestInfo
): Promise<void> {
  for (const run of pending) {
    const attempt = run(page);
    // The attempt keeps running after the deadline wins the race; without its
    // own handler its later rejection would be an unhandled rejection.
    attempt.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`cleanup exceeded ${String(CLEANUP_DEADLINE_MS)}ms`)),
        CLEANUP_DEADLINE_MS
      );
    });
    try {
      await Promise.race([attempt, deadline]);
    } catch (error) {
      testInfo.annotations.push({ type: 'cleanup-failed', description: String(error) });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Minimal valid 1×1 PNG used by the avatar and logo upload tests. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** Restores the tenant display name if the test left it changed. */
export function restoreDisplayName(original: string): Cleanup {
  return async (page: Page): Promise<void> => {
    await page.goto('/settings');
    const input = page.getByLabel(/organization name/i);
    await expect(input).toBeVisible({ timeout: 15_000 });
    if ((await input.inputValue()) === original) return;
    await input.fill(original);
    await expectResponseTo(page, SETTINGS_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });
  };
}

/** Restores the tenant dark-mode flag if the test left it flipped. */
export function restoreDarkMode(original: boolean): Cleanup {
  return async (page: Page): Promise<void> => {
    await page.goto('/settings/branding');
    const toggle = page.getByRole('switch', { name: /dark mode/i });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    if ((await toggle.isChecked()) === original) return;
    await toggle.click();
    await expectResponseTo(page, BRANDING_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });
  };
}

/** Restores the tenant primary colour if the test left it changed. */
export function restorePrimaryColor(original: string): Cleanup {
  return async (page: Page): Promise<void> => {
    await page.goto('/settings/branding');
    const hexInput = page.getByRole('textbox', { name: /primary color hex value/i });
    await expect(hexInput).toBeVisible({ timeout: 15_000 });
    if ((await hexInput.inputValue()).toLowerCase() === original.toLowerCase()) return;
    await hexInput.fill(original);
    await expectResponseTo(page, BRANDING_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });
  };
}

/**
 * Restores the realm brute-force protection switch.
 * This one mutates Keycloak realm state, not just a tenant row, so leaving it
 * flipped changes the login behaviour of every later test AND of the next run.
 */
export function restoreBruteForce(original: boolean): Cleanup {
  return async (page: Page): Promise<void> => {
    await page.goto('/settings/auth');
    const toggle = page.getByRole('switch', { name: /brute force protection/i });
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    if ((await toggle.isChecked()) === original) return;
    await toggle.click();
    await expectResponseTo(page, AUTH_CONFIG_PATH, 'PATCH', async () => {
      await page.getByRole('button', { name: /save/i }).click();
    });
  };
}
