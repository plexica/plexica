// helpers/i18n-locale.ts
// Shared helpers for the i18n E2E specs (006-07/08/10): language switching,
// profile-language source of truth, and no-reload verification.

import { expect } from '@playwright/test';

import { ADMIN_TENANT_SLUG } from './admin-login.js';
import { expectApiStatus } from './api-response.js';
import { freshBearer } from './session-token.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { Page } from '@playwright/test';

export const LANGUAGE_SWITCHER_TEST_ID = 'language-switcher-trigger';
const PROFILE_PATH = '/api/v1/profile';
const AUTH_KEY = 'plexica-auth';

export type UiLocale = 'en' | 'it';

const LOCALE_LABEL: Record<UiLocale, string> = { en: 'English', it: 'Italiano' };

/** Reads the persisted UI locale from the auth-store sessionStorage key. */
export function readStoreLocale(page: Page): Promise<string> {
  return page.evaluate((key: string) => {
    const stored = sessionStorage.getItem(key);
    if (stored === null) return '';
    const parsed = JSON.parse(stored) as { state?: { locale?: string } };
    return parsed.state?.locale ?? '';
  }, AUTH_KEY);
}

/** Pins the session's profile `language` (the server-side source of truth). */
export async function setProfileLanguage(page: Page, language: UiLocale): Promise<void> {
  const res = await page.request.patch(tenantApiUrl(ADMIN_TENANT_SLUG, PROFILE_PATH), {
    headers: await freshBearer(page),
    data: { language },
  });
  await expectApiStatus(res, 200);
}

/** Reads the profile `language` currently stored on the server for this session. */
export async function readProfileLanguage(page: Page): Promise<string> {
  const res = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, PROFILE_PATH), {
    headers: await freshBearer(page),
  });
  await expectApiStatus(res, 200);
  const body = (await res.json()) as { language?: string };
  return body.language ?? '';
}

/**
 * Opens the header language switcher and switches to `locale`.
 *
 * Asserts the NFR-006-3 properties:
 *  - full UI updates in place (locale-distinct sidebar strings flip)
 *  - measured DOM-update latency < 500 ms (return value)
 *  - NO page reload (module-level marker survives, URL unchanged)
 */
export async function switchLocaleViaUi(page: Page, locale: UiLocale): Promise<number> {
  const urlBefore = page.url();
  await page.evaluate(() => {
    (window as unknown as { __noPlexicaReload?: string }).__noPlexicaReload = 'switched';
  });

  const trigger = page.getByTestId(LANGUAGE_SWITCHER_TEST_ID);
  await expect(trigger).toBeVisible();
  await trigger.click();

  const menuItem = page.getByRole('menuitem', { name: LOCALE_LABEL[locale], exact: true });
  const flippedNav = page.getByText(
    locale === 'it' ? 'Registro di controllo' : 'Audit Log',
    { exact: true }
  );

  const started = Date.now();
  await menuItem.click();
  await expect(flippedNav).toBeVisible({ timeout: 5_000 });
  const elapsed = Date.now() - started;

  expect(page.url(), 'language switch must not navigate').toBe(urlBefore);
  const marker = await page.evaluate(
    () => (window as unknown as { __noPlexicaReload?: string }).__noPlexicaReload ?? null
  );
  expect(marker, 'page reloaded during the language switch').toBe('switched');

  return elapsed;
}

/**
 * Creates a deterministic audit-log row (for the locale-aware date assertion)
 * by PATCHing the tenant display name with its current value.
 */
export async function createAuditRow(page: Page): Promise<void> {
  const get = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/tenant/settings'), {
    headers: await freshBearer(page),
  });
  await expectApiStatus(get, 200);
  const body = (await get.json()) as { displayName?: string };
  const patch = await page.request.patch(tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/tenant/settings'), {
    headers: await freshBearer(page),
    data: { displayName: body.displayName ?? 'E2E Tenant' },
  });
  await expectApiStatus(patch, 200);
}