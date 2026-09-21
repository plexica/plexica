// sse-asserts.ts
// Shared SSE delivery assertions for the notification E2E specs (006-01).
// Split from the spec files to honor the 200-line gate (Rule 4).

import { expect } from '@playwright/test';

import { API_TIMEOUT_MS } from '../../../../e2e/playwright-base.js';

import { ADMIN_TENANT_SLUG, loginAsMember } from './admin-login.js';
import { applyPageFixes, isolatedTestIp } from './page-fixes.js';
import { freshBearer } from './session-token.js';
import { tenantApiUrl } from './tenant-hosts.js';

import type { Browser, Page, TestInfo } from '@playwright/test';

/** Opens a fresh member session in its own context (isolated rate-limit IP). */
export async function openMemberSession(
  browser: Browser,
  testInfo: TestInfo
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      'X-Forwarded-For': isolatedTestIp(`${testInfo.testId}:member`, testInfo.retry),
    },
  });
  try {
    const page = await context.newPage();
    await applyPageFixes(page);
    await loginAsMember(page);
    return { page, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * Invites an EXISTING tenant user (admin session) via the backend API and
 * returns the invite round-trip latency in ms. The invite is what enqueues the
 * `plexica.workspace.invite` outbox event that drives the notification consumer.
 */
export async function inviteExistingUser(
  adminPage: Page,
  workspaceId: string,
  email: string
): Promise<number> {
  const started = Date.now();
  const res = await adminPage.request.post(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/users/invite'),
    {
      headers: {
        ...(await freshBearer(adminPage)),
        'X-Tenant-Slug': ADMIN_TENANT_SLUG,
      },
      data: { email, workspaceId, role: 'member' },
      timeout: API_TIMEOUT_MS,
    }
  );
  expect(res.status()).toBe(201);
  return Date.now() - started;
}

/**
 * Waits for the header notification badge (unread count > 0) to become visible
 * and returns the latency in ms. The SSE push invalidates the unread-count
 * query, so a badge within the NFR window proves real-time delivery.
 */
export async function waitForUnreadBadge(
  page: Page,
  opts: { timeoutMs?: number } = {}
): Promise<number> {
  const { timeoutMs = 2_000 } = opts;
  const started = Date.now();
  await expect(page.getByTestId('notification-badge')).toBeVisible({ timeout: timeoutMs });
  return Date.now() - started;
}

/**
 * Emits a plugin notification through the JWT path of POST
 * /api/v1/notifications/emit (006-05). Returns the acknowledged notificationId.
 */
export async function emitPluginNotification(
  page: Page,
  opts: {
    userId: string;
    type: string;
    titleKey: string;
    titleParams?: Record<string, string>;
    metadata?: Record<string, unknown>;
  }
): Promise<{ notificationId: string; latencyMs: number }> {
  const started = Date.now();
  const res = await page.request.post(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/notifications/emit'),
    {
      headers: { ...(await freshBearer(page)), 'X-Tenant-Slug': ADMIN_TENANT_SLUG },
      data: {
        userId: opts.userId,
        type: opts.type,
        titleKey: opts.titleKey,
        ...(opts.titleParams !== undefined ? { titleParams: opts.titleParams } : {}),
        metadata: opts.metadata ?? {},
        timestamp: new Date().toISOString(),
        correlationId: crypto.randomUUID(),
      },
      timeout: API_TIMEOUT_MS,
    }
  );
  expect(res.status()).toBe(202);
  const body = (await res.json()) as { status: string; notificationId: string };
  expect(body.status).toBe('accepted');
  expect(body.notificationId).toBeTruthy();
  return { notificationId: body.notificationId, latencyMs: Date.now() - started };
}

/**
 * Clears the caller's own unread notifications via POST /notifications/read-all
 * (review M5 — member@e2e.local accumulates unread rows across specs and CI
 * runs, so exact badge counts would flake). Marks everything read so the next
 * invite starts from a deterministic unread state. Call BEFORE the invite flow,
 * then reload the page so the unread-count query refetches.
 */
export async function clearNotifications(page: Page): Promise<void> {
  const res = await page.request.post(
    tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/notifications/read-all'),
    {
      headers: { ...(await freshBearer(page)), 'X-Tenant-Slug': ADMIN_TENANT_SLUG },
    }
  );
  expect(res.status()).toBe(200);
}

/** Resolves the acting user's internal user_profile.user_id via the profile API. */
export async function currentUserId(page: Page): Promise<string> {
  const res = await page.request.get(tenantApiUrl(ADMIN_TENANT_SLUG, '/api/v1/profile'), {
    headers: { ...(await freshBearer(page)), 'X-Tenant-Slug': ADMIN_TENANT_SLUG },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { userId: string };
  return body.userId;
}
