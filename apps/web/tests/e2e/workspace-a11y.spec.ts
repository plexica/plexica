/**
 * File: apps/web/tests/e2e/workspace-a11y.spec.ts
 *
 * T9.4 — Playwright Accessibility Tests for Workspace Management pages.
 * Validates WCAG 2.1 AA compliance for workspace-settings, workspace-members,
 * and workspace-sharing screens using @axe-core/playwright (ADR-022 Accepted).
 *
 * Constitution Art. 1.3: WCAG 2.1 AA compliance required.
 * Spec 009 Workspace Management — Phase 9, Task T9.4.
 *
 * ## axe-core Tag Convention (ADR-022)
 *
 * All scans use `.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])`.
 * The three-tag convention is consistent with admin-a11y.spec.ts and
 * ensures WCAG 2.1-specific rules (e.g. 1.4.10 Reflow, 1.3.4 Orientation)
 * are included. ADR-022 has been updated to document this convention.
 *
 * ## WorkspaceSwitcher ARIA Pattern (T9.1 note)
 *
 * WorkspaceSwitcher uses Radix DropdownMenu which renders `role="menu"` /
 * `aria-current` rather than `role="listbox"` / `aria-selected`. This is the
 * correct semantic choice for a navigation-style switcher (not a form select).
 * tasks.md T9.1 acceptance criteria have been updated to reflect this.
 * The axe scan is scoped to the whole switcher container (`[data-workspace-switcher]`)
 * so the trigger button and search input are included in the scan.
 *
 * ## Auth Seeding Strategy
 *
 * WorkspaceContext only fetches workspaces when `isAuthenticated && tenant` are
 * set in useAuthStore. MockAuthProvider (active when VITE_E2E_TEST_MODE=true)
 * sets these values asynchronously inside a useEffect, which creates a race:
 * the store may still be unauthenticated on the first render, causing
 * WorkspaceContext to bail out and set currentWorkspace=null.
 *
 * Fix: use page.addInitScript() to pre-seed the Zustand `plexica-auth`
 * localStorage key BEFORE the page loads. On rehydration, the store sees
 * isAuthenticated=true and tenant already populated, so WorkspaceContext
 * triggers refreshWorkspaces() immediately on mount — no race.
 *
 * The MockAuthProvider still runs its useEffect (no-op because isAuthenticated
 * is already true), so both code paths are satisfied.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAllApis } from './helpers/api-mocks';
import { mockTenant, mockUser, mockWorkspaces } from './fixtures/test-data';

// ---------------------------------------------------------------------------
// Auth pre-seeding
// ---------------------------------------------------------------------------

/**
 * Seed the Zustand `plexica-auth` store into localStorage BEFORE the page
 * loads. This ensures WorkspaceContext sees isAuthenticated=true on its very
 * first render and triggers refreshWorkspaces() immediately.
 *
 * Must be called before page.goto() — addInitScript injects code that runs
 * before any page scripts.
 */
async function seedAuthState(page: Page) {
  const authState = {
    state: {
      user: mockUser,
      tenant: mockTenant,
      isAuthenticated: true,
    },
    version: 0,
  };

  // Derive workspace key from test-data so this doesn't silently break
  // if test-data.ts is ever refactored (L-2 fix: no hardcoded IDs).
  const tenantSlug = mockTenant.slug;
  const defaultWorkspaceId = mockWorkspaces[0].id;

  await page.addInitScript(
    (args: { serialized: string; tenantSlug: string; defaultWorkspaceId: string }) => {
      // Seed the Zustand persist key synchronously so that the store rehydrates
      // into an authenticated state before any React component renders.
      localStorage.setItem('plexica-auth', args.serialized);

      // Also seed the workspace selection so WorkspaceContext auto-selects
      // the first workspace without needing to wait for the API response.
      localStorage.setItem(`plexica-workspace-${args.tenantSlug}`, args.defaultWorkspaceId);
    },
    { serialized: JSON.stringify(authState), tenantSlug, defaultWorkspaceId }
  );
}

// ---------------------------------------------------------------------------
// Navigation helper
// ---------------------------------------------------------------------------

/**
 * Navigate to a workspace page and wait for the expected h2 heading AND page
 * content to be fully rendered before proceeding.
 *
 * Workspace pages use h2 (not h1) — they live inside a layout shell that
 * already has an h1. Specifying `level: 2` avoids strict-mode violations when
 * there is also an h3 with the same text (e.g. WorkspaceSettingsForm renders
 * <h3>Workspace Settings</h3> inside the card, while the page renders
 * <h2>Workspace Settings</h2> in the header).
 *
 * The 15 000 ms timeout accounts for route-level lazy loading AND the async
 * WorkspaceContext fetch cycle.
 *
 * waitForLoadState('networkidle') is called AFTER the heading is visible to
 * ensure async-rendered list content (member rows, resource rows, etc.) is
 * fully loaded before axe-core scans the page — preventing false negatives
 * for violations in dynamically-rendered content (M-2 fix).
 */
async function gotoWorkspacePage(page: Page, url: string, heading: string) {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: heading, level: 2 })).toBeVisible({
    timeout: 15_000,
  });
  // Wait for all async data fetches to complete so axe scans the fully-rendered DOM.
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe('Workspace Management — Accessibility (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    // 1. Seed auth BEFORE the page loads (addInitScript must precede goto)
    await seedAuthState(page);
    // 2. Register all API mocks (also before goto, so routes are ready on load)
    await mockAllApis(page);
  });

  // ---------------------------------------------------------------------------
  // WorkspaceSwitcher — in the layout shell, visible on every workspace page
  //
  // Note on ARIA pattern (H-1 / T9.1):
  // WorkspaceSwitcher uses Radix DropdownMenu which renders `role="menu"` and
  // `aria-current` on items — NOT `role="listbox"` / `aria-selected`. This is
  // the correct semantic choice for a navigation-style switcher (not a form
  // select). tasks.md T9.1 has been updated to reflect this implementation.
  //
  // Note on scan scope (H-2):
  // The axe scan is scoped to `[data-workspace-switcher]` (the switcher's root
  // container) rather than just `[role="menu"]`. This ensures the trigger button
  // (aria-label="Switch workspace") and search input are included in the scan —
  // both are required by T9.1 and T9.2 but were outside the `[role="menu"]` scope.
  // ---------------------------------------------------------------------------

  test('WorkspaceSwitcher dropdown has no WCAG 2.1 AA violations', async ({ page }) => {
    // Navigate to the Dashboard (index route) — it wraps content in AppLayout
    // which renders the Header containing the WorkspaceSwitcher.
    // The workspace-settings/members/sharing routes are standalone flat routes
    // that do NOT use AppLayout, so the switcher is absent on those pages.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForLoadState('networkidle');

    // Wait for the WorkspaceSwitcher button to be visible — it renders async
    // (loading spinner shown until WorkspaceContext.refreshWorkspaces() completes).
    const switcherButton = page.getByRole('button', { name: /switch workspace/i }).first();
    await expect(switcherButton).toBeVisible({ timeout: 10_000 });

    // Open the dropdown
    await switcherButton.click();

    // Wait for the dropdown menu to appear
    await expect(page.getByRole('menu').first()).toBeVisible({ timeout: 5_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      // Scope scan to the switcher container — this includes both the trigger
      // button and the open dropdown menu, ensuring the full interactive surface
      // is scanned (H-2 fix). Radix sets aria-hidden="true" on background content
      // when the dropdown is open; scanning the full page would produce
      // aria-hidden-focus false positives on the background.
      .include('[data-workspace-switcher]')
      // Exclude Radix UI focus guards — transparent overlays trigger colour-contrast
      // false positives.
      .exclude('[data-radix-focus-guard]')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Workspace Settings page
  // ---------------------------------------------------------------------------

  test('Workspace Settings page has no WCAG 2.1 AA violations', async ({ page }) => {
    await gotoWorkspacePage(page, '/workspace-settings', 'Workspace Settings');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Workspace Members page
  // ---------------------------------------------------------------------------

  test('Workspace Members page has no WCAG 2.1 AA violations', async ({ page }) => {
    await gotoWorkspacePage(page, '/workspace-members', 'Members');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Remove Member dialog has no WCAG 2.1 AA violations', async ({ page }) => {
    await gotoWorkspacePage(page, '/workspace-members', 'Members');

    // Open the remove-member dialog for the first non-owner member.
    // Buttons are labelled "Remove {displayName}" (aria-label on the icon button).
    await page
      .getByRole('button', { name: /remove/i })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      // Scope scan to the dialog only (M-1 fix):
      // Radix sets aria-hidden="true" on background content when a dialog is open.
      // Scanning the full page would produce false negatives for background violations
      // (silently skipped by axe-core) and is inconsistent with scoping best practice.
      .include('[role="dialog"]')
      .exclude('[data-radix-focus-guard]')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Workspace Sharing page
  // ---------------------------------------------------------------------------

  test('Workspace Sharing page (sharing enabled) has no WCAG 2.1 AA violations', async ({
    page,
  }) => {
    // ws-1 has settings.allowCrossWorkspaceSharing: true (test-data.ts),
    // so SharedResourcesList renders instead of SharingDisabledEmptyState.
    await gotoWorkspacePage(page, '/workspace-sharing', 'Shared Resources');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Workspace Sharing page (sharing disabled) has no WCAG 2.1 AA violations', async ({
    page,
  }) => {
    // Override the workspace API to return a workspace with sharing disabled,
    // so SharingDisabledEmptyState renders instead of SharedResourcesList (M-4 fix).
    // This component path was previously unscanned.
    await page.route('**/api/workspaces/ws-*', async (route) => {
      const url = route.request().url();
      if (url.includes('/members') || url.includes('/teams')) {
        await route.continue();
        return;
      }
      if (route.request().method() === 'GET') {
        const disabledSharingWorkspace = {
          ...mockWorkspaces[0],
          settings: {
            ...mockWorkspaces[0].settings,
            allowCrossWorkspaceSharing: false,
          },
        };
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(disabledSharingWorkspace),
        });
      } else {
        await route.continue();
      }
    });

    await gotoWorkspacePage(page, '/workspace-sharing', 'Shared Resources');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Share Plugin dialog has no WCAG 2.1 AA violations', async ({ page }) => {
    await gotoWorkspacePage(page, '/workspace-sharing', 'Shared Resources');

    // Open the Share Plugin dialog (admin-only button in the header actions area)
    await page
      .getByRole('button', { name: /share plugin/i })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      // Scope scan to the dialog only (M-1 fix) — same rationale as Remove Member
      // dialog above. Radix sets aria-hidden="true" on background content; scanning
      // only the dialog avoids false negatives and is consistent across all dialog tests.
      .include('[role="dialog"]')
      .exclude('[data-radix-focus-guard]')
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
