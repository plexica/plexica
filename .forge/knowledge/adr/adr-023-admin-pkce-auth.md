# ADR-023: Admin Browser Authentication with PKCE

**Status**: Accepted
**Date**: 2026-07-22
**Amends**: Spec 005 Plan D-3
**Extends**: ADR-002, ADR-010, ADR-011

## Context

Spec 005 originally selected Resource Owner Password Credentials (password
grant) for the browser-based admin app. That exposes credentials to SPA code,
cannot participate correctly in MFA or federated SSO, and diverges from the
tenant web app. OAuth 2.1 removes this grant.

E2E suites also need real, role-bearing tokens for API setup and assertions.
Keycloak's system administration client is not an application-auth client and
must not be reused for Plexica API tokens. Test automation must not weaken the
public clients or introduce a known secret in source control.

## Decision

### 1. Browser flow

Both `apps/admin` and `apps/web` use OIDC Authorization Code Flow with PKCE.
The admin app uses the public `plexica-admin` client in the master realm.

1. `/login` starts a single-flight redirect to Keycloak; Plexica renders no
   username or password fields.
2. Generate a high-entropy verifier, compute
   `BASE64URL(SHA-256(ASCII(verifier)))`, and send
   `code_challenge_method=S256`, `scope=openid profile email`, and a random
   anti-CSRF `state`.
3. Store one-time verifier data in `sessionStorage`, keyed by `state`, and
   never in `localStorage`. Reject unknown/replayed state at `/callback`.
4. Exchange the code using the same exact `redirect_uri` and the matching
   `code_verifier`; remove one-time PKCE data after success or terminal error.
5. Keycloak must enforce S256 with client attribute
   `pkce.code.challenge.method: "S256"`; client-side S256 generation alone is
   insufficient.

The callback validates `code`, `state`, and OAuth error parameters before
exchange. It shows localized loading/error recovery and redirects a successful
login to `/dashboard`.

### 2. Exact client settings and URIs

`plexica-admin` has these explicit settings:

```json
{
  "publicClient": true,
  "standardFlowEnabled": true,
  "implicitFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "authorizationServicesEnabled": false,
  "fullScopeAllowed": false,
  "redirectUris": ["http://localhost:3002/callback"],
  "webOrigins": ["http://localhost:3002"],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://localhost:3002/login"
  }
}
```

Attach only standard OIDC scopes and the explicit `super_admin` realm-role
mapping. Do not restore broad full-scope access.

| Environment | Callback URI                         | Post-logout URI                   |
| ----------- | ------------------------------------ | --------------------------------- |
| Local/CI    | `http://localhost:3002/callback`     | `http://localhost:3002/login`     |
| Production  | `https://admin.plexica.app/callback` | `https://admin.plexica.app/login` |

Staging/review deployments derive both values from that environment's exact
HTTPS admin origin. Wildcards such as `/*` are forbidden. Production accepts
only production values, never localhost or review-app values.

### 3. Session, expiry, and logout

The single Zustand auth store persists the access token, refresh token, ID
token, profile, and expiry status in `sessionStorage` only. The ID token is
required across reloads for OIDC RP-Initiated Logout. Tokens, credentials, and
PKCE material are never logged.

When refresh fails, clear all tokens, preserve `expired` long enough to announce
a localized session-expired notice, then redirect to `/login` for fresh PKCE.
Do not render protected content or an application password form.

User-initiated logout clears local auth state and query caches, then redirects
the browser to the master-realm OIDC logout endpoint with `client_id`,
`id_token_hint`, and the exact registered `post_logout_redirect_uri`. Keycloak
terminates the current SSO session and returns to `/login`. Best-effort XHR
refresh-token revocation is not the primary logout path.

### 4. E2E-only API token helper

Browser login tests always exercise real PKCE. API setup/assertion code may use
a dedicated ephemeral confidential helper client:

- create a unique client per run; enable direct grants only there, never on
  `plexica-admin` or `plexica-web`;
- set `fullScopeAllowed: false` and attach only required scopes/role mappings;
- generate a random secret at runtime with no committed/default fallback and
  never log it;
- refuse setup without an explicit E2E flag and a local/CI test target; refuse
  known production realms/origins;
- delete the helper in global teardown/finally, including failed runs.

The helper obtains real RS256 user tokens. It is not `admin-cli`, and its tokens
are not used for browser login. Bootstrap credentials may call the Keycloak
Admin REST API only to create/delete the helper; that control-plane token is
never sent to Plexica APIs.

## Implementation and Validation Status

The decision is accepted. PR #77 remediation is still in progress; this ADR
does not assert that every code/config item is implemented. Before merge,
validate:

- Keycloak rejects authorization without PKCE and rejects `plain`;
- each environment export has only its exact callback/logout URIs and public
  clients keep direct grants explicitly disabled;
- callback state is single-use and safe under repeated/concurrent login starts;
- reload preserves the ID token and session-expired UX;
- logout ends the current Keycloak SSO session and returns to the registered URI;
- the E2E helper is guarded, scoped, secret-randomized, and removed after runs;
- PKCE login, callback failure, expiry, and logout pass real-stack E2E.

## Consequences

### Positive

- Super-admin login supports MFA, WebAuthn, federation, and SSO.
- Browser code never receives the user's password.
- Both SPAs use one browser-auth pattern; public clients cannot use ROPC.
- E2E API tokens remain real without a permanent test backdoor.

### Negative

- Login changes visual context to Keycloak; ADR-010 branding mitigates this.
- Exact URI registration adds deployment work per environment.
- E2E setup must provision and reliably tear down an ephemeral client.

### Neutral

- The admin app adds public `/callback` and persists an ID token in tab-scoped
  storage for logout.

## Alternatives Considered

| Alternative                    | Decision                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| Keep password grant            | Rejected: no MFA/SSO, credentials in SPA, obsolete flow.   |
| BFF with HttpOnly session      | Deferred: stronger isolation but new session architecture. |
| Client credentials for browser | Rejected: unsafe secret and no user audit context.         |
| Permanent broad E2E client     | Rejected: durable credential and excess privilege.         |

## Rollback

Restore the last known-good PKCE-capable admin release with matching exact URI
configuration. Do not re-enable password grant on public clients. Delete
orphaned E2E helpers, clear browser session storage, and verify RP logout before
reopening access.

## Constitution Alignment

| Article                  | Status    | Rationale                                         |
| ------------------------ | --------- | ------------------------------------------------- |
| Rule 1 / Testing         | Compliant | Requires real-stack PKCE, expiry, and logout E2E. |
| Rule 3 / One pattern     | Compliant | Both browser SPAs use PKCE S256.                  |
| Rule 5 / ADR             | Compliant | Records a significant authentication change.      |
| Security: authentication | Improved  | MFA, state, and PKCE protect privileged login.    |
| Security: secrets        | Compliant | No public or known E2E secret is committed.       |

## Related Decisions

- ADR-002: master realm and `plexica-admin` client.
- ADR-010: branded Keycloak-hosted login.
- ADR-011: Keycloak Admin REST API is control-plane only.
- Spec 005 Plan D-3: superseded by this ADR.
