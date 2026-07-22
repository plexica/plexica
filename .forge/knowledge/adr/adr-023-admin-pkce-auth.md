# ADR-023: Admin App Authentication — Migrate from Password Grant to PKCE Authorization Code Flow

**Status**: Accepted
**Date**: 2026-07-22
**Driver**: Admin app authentication security hardening (Constitution Art. 5 — auth change)
**Amends**: Spec 005 Plan decision D-3 ("admin auth uses password grant, not PKCE")
**Extends**: ADR-002 (Keycloak multi-realm), ADR-010 (Keycloakify), ADR-011 (Keycloak Admin API Integration)
**Deciders**: Project lead (via Forge orchestration)

## Context

The Plexica admin app (`apps/admin`) authenticates super-admins against the
Keycloak master realm using **OAuth 2.0 Resource Owner Password Credentials
Grant** (password grant). This was chosen during Spec 005 (Super Admin Panel)
with the explicit justification: *"The admin app uses password grant (not PKCE
browser flow) because it's an internal tool, not a public-facing tenant app"
* (Spec 005 Plan §5.5, D-3).

Since that decision was made, three factors motivate revisiting it:

1. **OAuth 2.1 deprecation**: The password grant is removed entirely from
   OAuth 2.1 (RFC 6749bis). Several major identity providers (Auth0, Okta)
   have already disabled it for new tenants. While Keycloak continues to
   support it, this is a declining standard that creates migration risk.

2. **MFA and SSO incompatibility**: The password grant cannot participate in
   challenge-based authentication flows. If the master realm is configured
   with MFA (TOTP, WebAuthn), SAML federation, or social identity providers,
   the password grant simply bypasses them — the token is issued against the
   password alone, not the full authentication policy. This creates a weaker
   security posture for the most privileged accounts in the system.

3. **Pattern inconsistency**: The tenant web app (`apps/web`) uses the
   **PKCE authorization code flow** (ADR-010), the OAuth 2.1 best practice
   for browser-based public clients. The admin app uses a different, weaker
   flow for the same browser-based client type. Constitution Rule 3 ("one
   pattern per operation type") applies to frontend patterns; while the admin
   is a different *context*, using two different OAuth flows for the same
   client type (browser SPA) introduces unnecessary divergence.

Additionally, the password grant has operational limitations documented
during the Spec 005 implementation:

- No periodic token refresh timer — sessions can expire mid-use
- Credentials are visible to client-side JavaScript
- No "remember me" across browser sessions (sessionStorage, lost on tab close)
- Client-side JWT decoding for user profile (no dedicated `/me` endpoint)

## Decision

Migrate the admin app from the **OAuth 2.0 Resource Owner Password Credentials
Grant** to the **Authorization Code Flow with PKCE (S256)**, using the same
pattern already proven in `apps/web`.

### Flow

```
Admin App (browser)                  Keycloak Master Realm
       │                                      │
       │  (1) GET /auth?                     │
       │      response_type=code              │
       │      code_challenge_method=S256      │
       │      code_challenge=<SHA-256 hash>   │
       │      state=<anti-CSRF UUID>          │
       │─────────────────────────────────────>│
       │                                      │
       │  (2) User authenticates              │
       │     (password, MFA, SAML,            │
       │      WebAuthn, social login…)        │
       │<─────────────────────────────────────│
       │      Redirect to /callback           │
       │      ?code=<authz_code>              │
       │      &state=<original UUID>          │
       │                                      │
       │  (3) POST /token                    │
       │      grant_type=authorization_code   │
       │      code=<authz_code>               │
       │      code_verifier=<original secret> │
       │─────────────────────────────────────>│
       │<─────────────────────────────────────│
       │      access_token + refresh_token    │
       │      + id_token                      │
```

### Keycloak Client Configuration

The existing `plexica-admin` client in the Keycloak master realm gains:

```typescript
{
  publicClient: true,
  fullScopeAllowed: true,
  standardFlowEnabled: true,
  directAccessGrantsEnabled: false,
  attributes: { 'access.token.lifespan': '86400' },
  redirectUris: [
    'http://localhost:3002/*',     // dev
    'https://admin.plexica.app/*', // prod
  ],
  webOrigins: [
    'http://localhost:3002',       // dev
    'https://admin.plexica.app',   // prod
  ],
}
```

**Migration completed**: `directAccessGrantsEnabled` was kept `true` during the
transition so that existing E2E tests and scripts using direct password grant
could continue to work. Once all E2E tests were migrated to the PKCE browser
redirect flow, `directAccessGrantsEnabled` was set to `false` and removed from
the client configuration. E2E tests now use browser redirect for authentication
and `admin-cli` for API token acquisition in global setup.

### Frontend Changes

| File | Change |
|---|---|
| `apps/admin/src/services/keycloak-auth.ts` | Add `getLoginUrl()`, `exchangeCode()`, PKCE verifier/challenge generators. Keep `refreshTokens()`, `revokeSession()` (now with realm param). |
| `apps/admin/src/stores/auth-store.ts` | Add `handleCallback(code, state)` action. Change `login()` to redirect to Keycloak (not POST to `/token`). Add `id_token` to persisted state. |
| `apps/admin/src/components/auth/auth-guard.tsx` | Call `store.login()` instead of `navigate({ to: '/login' })` when unauthenticated and no refresh token. |
| `apps/admin/src/pages/login-page.tsx` | Convert from username/password form to redirect page. Options: (a) automatic redirect with spinner, (b) "Sign in with Keycloak" button. |
| `apps/admin/src/pages/auth-callback-page.tsx` | **New** — handle Keycloak redirect at `/callback`, exchange code for tokens, navigate to `/dashboard`. |
| `apps/admin/src/router-shell.tsx` | Add `/callback` route (public, unguarded). |
| `apps/admin/src/types/auth.ts` | Add `id_token: string` to `TokenResponse` and `AuthState`. |
| `apps/admin/e2e/global-setup.ts` | Update `plexica-admin` client: `standardFlowEnabled: true`, add `redirectUris`, `webOrigins`. |
| `apps/admin/e2e/helpers/admin-login.ts` | Handle Keycloak redirect flow instead of login-form fill. |

### What Does NOT Change

| Component | Reason |
|---|---|
| **Backend** (`auth-middleware.ts`, `require-super-admin.ts`) | Already validates RS256 tokens via JWKS; already skips audience check for master realm tokens. No backend changes needed. |
| **`api-client.ts`** | Auto-refresh on 401 pattern remains identical. Already uses lazy `getAuthStore()` to break circular dependency. |
| **`session-expired-handler.tsx`** | Session expiry logic is unchanged. |
| **`AuthState` type** | Compatible — only adds `id_token` field. |
| **Env variables** | Reuses existing `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_ADMIN_CLIENT_ID`, `VITE_KEYCLOAK_MASTER_REALM`. |

## Consequences

### Positive

- **MFA and SSO compatible**: Super-admin accounts can now use TOTP, WebAuthn,
  SAML federation, or social login configured on the master realm — the PKCE
  flow participates in whatever authentication policy Keycloak enforces,
  instead of bypassing it with a password-only grant.
- **OAuth 2.1 compliant**: Aligns with the current security standard. No
  migration risk if Keycloak deprecates the password grant in a future version.
- **Credential isolation**: The admin's password is never seen by the admin
  app JavaScript — it is entered directly into Keycloak's own login page.
  This eliminates an entire class of XSS-based credential theft.
- **Pattern consistency with tenant app**: Both `apps/web` and `apps/admin`
  now use the same PKCE authorization code flow, reducing architectural
  divergence (Constitution Rule 3).
- **Automatic `id_token`**: The PKCE flow returns an `id_token` (OIDC),
  enabling proper logout with `id_token_hint` and post-logout redirect URI
  (currently the admin app only does best-effort backchannel logout).

### Negative

- **UX regression**: Super-admins are redirected to the Keycloak login page
  instead of logging in via an inline form in the Plexica admin UI. This is a
  visual context switch and may be perceived as less polished. Mitigated by a
  branded Keycloak login theme (ADR-010 Keycloakify).
- **E2E test complexity**: The login helper must now handle the Keycloak
  redirect flow (navigate → wait for Keycloak → fill Keycloak form → wait for
  callback → wait for dashboard) instead of a simple form fill. Mitigated by
  reusing the pattern already established in `apps/web` E2E tests. During a
  transition period, `directAccessGrantsEnabled: true` was kept so E2E tests
  could gradually migrate — it has since been removed.
- **Redirect URI management**: Keycloak validates the `redirect_uri` parameter
  against the configured whitelist. Adding new environments (staging, review
  apps) requires updating the client config. This is already a known pattern
  from the tenant web app.

### Neutral

- **`id_token` added to state**: The auth store now persists an additional
  JWT. This is ~1KB additional data in sessionStorage — negligible impact.
- **Callback page**: A new page at `/callback` that is publicly accessible.
  It must be excluded from the `AuthGuard` (already the pattern in `apps/web`).
- **PKCE session storage**: Two additional items (`pkce_code_verifier`,
  `auth_state`) are stored in sessionStorage during the login flow and removed
  after callback. Same pattern as `apps/web`.

## Alternatives Considered

| Alternative | Description | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Keep password grant, improve it** | Add periodic refresh timer, localStorage opt-in, `/api/v1/admin/me` endpoint | Minimum effort; no UX change; no E2E rewrite | Still OAuth 2.1 non-compliant; no MFA; credentials still in JS; deprecated standard | Rejected — kicks the can down the road |
| **BFF (Backend-for-Frontend) pattern** | Login goes to core API, which exchanges credentials server-side. Session managed via HttpOnly cookie. | Credentials never reach browser; full session control; no OAuth flow in frontend | New auth module in core API; stateful sessions (Redis); larger blast radius; over-engineered for an internal tool | Rejected — YAGNI per lessons-learned §Architecture (v1 over-engineering) |
| **Client Credentials Grant (machine-to-machine)** | Admin app gets a client secret, uses `grant_type=client_credentials` | No user credentials; simple flow | No user context — cannot audit *which* super admin performed an action | Rejected — auditability is a requirement (ADR-022 Decision 2) |
| **Keep password grant + add API key bypass for E2E** | Fix the operational issues but keep password grant for UI | Solves E2E pain; minimal change | Still misses MFA, OAuth 2.1, credential isolation | Rejected — partial fix that doesn't address security concerns |
| **Device Authorization Grant (device flow)** | User authenticates on another device by entering a code | Good for CLI/automation | Wrong paradigm for a browser SPA; adds UX friction | Rejected — wrong flow type |

## Constitution Compliance

| Article | Status | Notes |
|---|---|---|
| Rule 3: One pattern per operation type | **COMPLIANT** | Both `apps/web` and `apps/admin` now use PKCE authorization code flow for browser-based authentication. |
| Rule 5: ADR for significant decisions | **COMPLIANT** | This ADR documents an authentication flow change (Constitution Art. 5 "auth changes") and amends the Spec 005 Plan decision D-3. |
| Security §1: Tenant isolation | **COMPLIANT** | No change to tenant isolation. Admin still authenticates against the master realm. The PKCE flow has no impact on schema-per-tenant. |
| Security §2: Authentication | **IMPROVED** | All admin endpoints continue to require `requireSuperAdmin` enforcement. The PKCE flow now supports MFA, SSO, and WebAuthn for super-admin accounts — a strict improvement over password-only auth. |
| Security §3: SQL injection | **COMPLIANT** | No SQL changes. All token validation remains in the backend via jose JWKS verification. |
| Security §5: Secrets | **COMPLIANT** | No new secrets. `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_ADMIN_CLIENT_ID`, `VITE_KEYCLOAK_MASTER_REALM` are already env vars. |
| Architecture: Auth | **COMPLIANT** | ADR-002 (Keycloak multi-realm) is unchanged — admin still authenticates against the master realm. ADR-010 (Keycloakify) login theme applies to the new redirect flow. |

## Related Decisions

- **ADR-002: Keycloak Multi-Realm** — Establishes the master realm for super-admin
  authentication. Amended by this ADR: the admin app now uses PKCE instead of
  password grant for the master realm authentication flow.
- **ADR-010: Keycloakify for Keycloak Custom Theme** — Provides the branded
  Keycloak login theme that super-admins will see after the PKCE redirect.
  Without a themed login page, the redirect would show default Keycloak
  branding, creating a disjointed UX.
- **ADR-011: Keycloak Admin API Integration** — Used by `global-setup.ts` to
  configure the `plexica-admin` client. The `standardFlowEnabled`,
  `redirectUris`, and `webOrigins` fields are added to the existing client
  configuration.
- **Spec 005 Plan decision D-3** — Explicitly chose password grant over PKCE.
  This ADR formally amends that decision.
- **ADR-001: Schema-per-Tenant** — Unchanged. Admin auth is realm-scoped, not
  schema-scoped.
