// profile-sessions.ts
// API helpers for the profile sessions E2E specs (006-13/006-14).
// Split from the spec to honor the 200-line gate (Rule 4).

import { expect } from '@playwright/test';

import { API_TIMEOUT_MS } from '../../../../e2e/playwright-base.js';

import { ADMIN_TENANT_SLUG } from './admin-login.js';
import { freshBearer } from './session-token.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { Page } from '@playwright/test';

export interface ApiSession {
  id: string;
  clientId: string;
  ipAddress: string | null;
  startedAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface ApiProfile {
  userId: string;
  email: string;
  keycloakAccountUrl: string;
  avatarSource: string;
}

function apiHeaders(bearer: Record<string, string>): Record<string, string> {
  return { ...bearer, 'X-Tenant-Slug': ADMIN_TENANT_SLUG };
}

/** Lists the caller's sessions via GET /api/v1/profile/sessions (expects 200). */
export async function listSessions(page: Page): Promise<ApiSession[]> {
  const res = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/profile/sessions'), {
    headers: apiHeaders(await freshBearer(page)),
    timeout: API_TIMEOUT_MS,
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { sessions: ApiSession[] };
  expect(Array.isArray(body.sessions)).toBe(true);
  return body.sessions;
}

/** Revokes one session via DELETE (expects 200 { revoked: true }). */
export async function revokeSession(page: Page, sessionId: string): Promise<void> {
  const res = await page.request.delete(
    tenantApiUrl(ADMIN_TENANT_SLUG, `/api/v1/profile/sessions/${sessionId}`),
    { headers: apiHeaders(await freshBearer(page)), timeout: API_TIMEOUT_MS }
  );
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ revoked: true });
}

/** Reads the caller's profile (expects 200). */
export async function readProfile(page: Page): Promise<ApiProfile> {
  const res = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/profile'), {
    headers: apiHeaders(await freshBearer(page)),
    timeout: API_TIMEOUT_MS,
  });
  expect(res.status()).toBe(200);
  return (await res.json()) as ApiProfile;
}
