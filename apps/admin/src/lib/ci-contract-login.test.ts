// Unit guard for the admin CI contract login plumbing: credential fail-fast
// and admin session-token extraction must hold before any browser is launched
// so contract runs fail with an actionable message, not a silent empty token.

import { afterEach, describe, expect, it } from 'vitest';

import {
  parseAdminSessionToken,
  requireSuperAdminCredentials,
} from '../../e2e/helpers/ci-contract-login.js';

afterEach(() => {
  delete process.env['PLAYWRIGHT_SUPER_ADMIN_USER'];
  delete process.env['PLAYWRIGHT_SUPER_ADMIN_PASS'];
});

describe('requireSuperAdminCredentials', () => {
  it('returns the run-scoped master identity when both env vars are set', () => {
    process.env['PLAYWRIGHT_SUPER_ADMIN_USER'] = 'plexica-playwright-admin-user-u';
    process.env['PLAYWRIGHT_SUPER_ADMIN_PASS'] = 'secret-pass!1Aa';
    expect(requireSuperAdminCredentials()).toEqual({
      username: 'plexica-playwright-admin-user-u',
      password: 'secret-pass!1Aa',
    });
  });

  it('fails fast when global setup did not publish the identity', () => {
    expect(() => requireSuperAdminCredentials()).toThrow(/PLAYWRIGHT_SUPER_ADMIN_USER/);
  });

  it('fails fast on a password-less identity', () => {
    process.env['PLAYWRIGHT_SUPER_ADMIN_USER'] = 'plexica-playwright-admin-user-u';
    expect(() => requireSuperAdminCredentials()).toThrow(/PLAYWRIGHT_SUPER_ADMIN_PASS/);
  });
});

describe('parseAdminSessionToken', () => {
  it('extracts the access token from the plexica-admin-auth state', () => {
    const stored = JSON.stringify({ state: { accessToken: 'jwt-value' } });
    expect(parseAdminSessionToken(stored)).toBe('jwt-value');
  });

  it('returns empty for absent or malformed session state', () => {
    expect(parseAdminSessionToken(null)).toBe('');
    expect(parseAdminSessionToken('{}')).toBe('');
  });
});
