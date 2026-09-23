// helpers/translation-overrides.ts
// Shared fixtures for the tenant translation overrides E2E spec (006-10).
// Direct API access matches the existing fixtures pattern; every helper is
// idempotent so a redriven test always starts from a clean state.

import { ADMIN_TENANT_SLUG } from './admin-login.js';
import { expectApiStatus } from './api-response.js';
import { freshBearer } from './session-token.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { Page } from '@playwright/test';

export const TRANSLATIONS_PATH = '/api/v1/tenant/translations';

export interface OverrideRow {
  key: string;
  locale: string;
  value: string;
  updatedAt: string;
}

/** All overrides for the tenant (raw grouped shape). */
export async function listOverrides(page: Page): Promise<Record<string, Record<string, string>>> {
  const res = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, TRANSLATIONS_PATH), {
    headers: await freshBearer(page),
  });
  await expectApiStatus(res, 200);
  const body = (await res.json()) as { overrides: Record<string, Record<string, string>> };
  return body.overrides;
}

/**
 * Upserts (or reverts, when `value === ''`) one override via API.
 * Returns the server DTO.
 */
export async function upsertOverride(
  page: Page,
  key: string,
  locale: 'en' | 'it',
  value: string
): Promise<OverrideRow> {
  const res = await page.request.put(
    tenantApiUrl(ADMIN_TENANT_SLUG, `${TRANSLATIONS_PATH}/${encodeURIComponent(key)}`),
    { headers: await freshBearer(page), data: { locale, value } }
  );
  await expectApiStatus(res, 200);
  return (await res.json()) as OverrideRow;
}

/** Ensures `key` has no override for any locale (baseline for the spec). */
export async function ensureNoOverride(page: Page, key: string): Promise<void> {
  const overrides = await listOverrides(page);
  for (const locale of Object.keys(overrides[key] ?? {})) {
    await upsertOverride(page, key, locale as 'en' | 'it', '');
  }
}