// disposable-user.ts
// Provisioning, login and teardown of a throwaway tenant user.
//
// WHY: removing a user is irreversible (memberships deleted, profile
// soft-deleted, Keycloak account disabled and its sessions terminated). A test
// that really completes the removal therefore must NOT reuse member@e2e.local
// or any other account shared with the rest of the suite — it would leave every
// later test without a member. Each run creates its own user, with a unique tag
// embedded in the display name so it can be found through the /users search.
//
// The user is created through the Keycloak Admin REST API (the same path
// global-setup.ts uses); the tenant-schema `user_profile` row is created by the
// core-api JIT provisioning (middleware/user-profile-resolver.ts) on the user's
// first authenticated tenant request.

import { randomUUID } from 'node:crypto';

import { adminFetch, getAdminToken } from '../../../../e2e/keycloak/admin-api.js';
import { upsertUser } from '../keycloak-admin-client.js';

import { loginViaKeycloak } from './keycloak-login.js';
import { applyPageFixes, isolatedTestIp } from './page-fixes.js';
import { readAccessToken, readRefreshToken } from './session-token.js';

import type { Browser, Page, TestInfo } from '@playwright/test';

const DISPOSABLE_PASSWORD = 'PlexicaE2e!1';

export interface DisposableUser {
  username: string;
  email: string;
  /** Unique fragment of the display name — usable as a /users search term. */
  tag: string;
  realm: string;
}

export interface DisposableSession {
  page: Page;
  close: () => Promise<void>;
}

/** Tenant slug → Keycloak realm (lib/tenant-schema-helpers.ts toRealmName). */
export function realmForSlug(slug: string): string {
  return `plexica-${slug}`;
}

/**
 * Creates a Keycloak user in the tenant realm with NO realm role: `tenant_admin`
 * would bypass ABAC entirely (engine.ts tenantAdminBypassDecision) and make any
 * authorization assertion meaningless.
 */
export async function createDisposableUser(
  tenantSlug: string,
  prefix: string
): Promise<DisposableUser> {
  // A UUID fragment (not Date.now()) avoids a millisecond collision between two
  // workers once the suite runs in parallel — a collision here would make the
  // /users search below match more than one user and fail opaquely.
  const tag = `${prefix}-${randomUUID().slice(0, 8)}`;
  const email = `${tag}@e2e-test.local`;
  const realm = realmForSlug(tenantSlug);

  const token = await getAdminToken();
  await upsertUser(token, realm, {
    username: email,
    email,
    firstName: 'Disposable',
    // user-profile-resolver builds display_name as "firstName lastName", so the
    // tag ends up in the tenant DB and the /users search (which filters on
    // display_name) can find exactly this user.
    lastName: tag,
    password: DISPOSABLE_PASSWORD,
  });

  return { username: email, email, tag, realm };
}

/** Best-effort teardown — never throws, so it is safe in a `finally` block. */
export async function deleteDisposableUser(user: DisposableUser): Promise<void> {
  const token = await getAdminToken();
  const query = `username=${encodeURIComponent(user.username)}&exact=true`;
  const lookup = await adminFetch(token, `/admin/realms/${user.realm}/users?${query}`, 'GET');
  if (!lookup.ok) return;
  const users = (await lookup.json()) as Array<{ id?: string }>;
  const id = users[0]?.id;
  if (id === undefined) return;
  await adminFetch(token, `/admin/realms/${user.realm}/users/${id}`, 'DELETE');
}

/**
 * Logs the disposable user in inside its OWN browser context, so the test's main
 * page stays authenticated as the tenant admin (a second login on the same
 * context would be swallowed by the Keycloak SSO cookie).
 *
 * Tokens are NOT returned: callers mint a fresh one with
 * `freshAccessToken(session.page)` at the exact moment they need it, because a
 * captured token is dead 60 s later (see session-token.ts).
 */
export async function openDisposableSession(
  browser: Browser,
  testInfo: TestInfo,
  tenantSlug: string,
  user: DisposableUser
): Promise<DisposableSession> {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      'X-Forwarded-For': isolatedTestIp(`${testInfo.testId}:disposable`, testInfo.retry),
    },
  });
  try {
    const page = await context.newPage();
    await applyPageFixes(page);
    await loginViaKeycloak(page, {
      tenantSlug,
      username: user.username,
      password: DISPOSABLE_PASSWORD,
    });
    const [accessToken, refreshToken] = await Promise.all([
      readAccessToken(page),
      readRefreshToken(page),
    ]);
    if (accessToken === '' || refreshToken === '') {
      throw new Error(`Disposable user ${user.username} logged in without persisted tokens`);
    }
    return { page, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}
