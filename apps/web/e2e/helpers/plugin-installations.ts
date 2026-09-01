// plugin-installations.ts
// Shared API helpers for reading plugin installations in E2E fixtures.
// Split out of crm-plugin-fixture.ts to keep both files under the 200-line
// constitution gate (Rule 4).

import { API_TIMEOUT_MS } from '../../../../e2e/playwright-base.js';

import { ADMIN_TENANT_SLUG } from './admin-login.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { EndpointKey } from './tenant-hosts.js';
import type { Page } from '@playwright/test';

export interface Installation {
  id: string;
  pluginSlug?: string;
  status: string;
}

export function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function listInstallations(
  page: Page,
  token: string,
  apiKey?: EndpointKey | undefined
): Promise<Installation[]> {
  const response = await page.request.get(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/plugins/installed', { apiKey }),
    { headers: apiHeaders(token), timeout: API_TIMEOUT_MS }
  );
  if (response.status() !== 200) {
    throw new Error(`Installed plugin fixture lookup failed: ${response.status()}`);
  }
  return (await response.json()) as Installation[];
}