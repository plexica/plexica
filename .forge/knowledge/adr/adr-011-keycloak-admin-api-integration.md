# ADR-011: Keycloak Admin API Integration for Tenant Auth Configuration

> Architectural Decision Record documenting how tenant admins configure
> authentication settings (MFA, IdPs, password policy, sessions) from the
> Plexica UI via the Keycloak Admin REST API.
> Created by the `forge-architect` agent via `/forge-adr`.

| Field    | Value                                                       |
| -------- | ----------------------------------------------------------- |
| Status   | Accepted                                                    |
| Author   | forge-architect                                             |
| Date     | 2026-04-03                                                  |
| Deciders | Platform team                                               |
| Spec     | 003 (Core Features), FR-022, DR-11                          |
| Related  | ADR-002 (Keycloak Multi-Realm), ADR-010 (Keycloakify Theme) |

---

## Context

Plexica uses Keycloak multi-realm authentication (ADR-002). Each tenant gets
a dedicated Keycloak realm provisioned at tenant creation time. The current
`keycloak-admin.ts` module handles realm creation, client setup, role creation,
and initial admin user provisioning — all one-time setup operations.

Spec 003 FR-022 requires that tenant admins can **configure their realm's
authentication settings post-creation** from the Plexica UI:

- **MFA policy**: toggle TOTP or WebAuthn for the realm
- **Identity providers**: add/remove SAML and OIDC IdPs
- **Password policy**: set minimum length, complexity, expiry
- **Session settings**: configure idle timeout and max session lifetime

Today, these changes require direct access to the Keycloak Admin Console or
manual API calls — neither of which is acceptable for tenant self-service.
The Keycloak Admin Console cannot enforce Plexica's ABAC authorization, does
not integrate with the tenant audit log, and exposes the full Keycloak UI
surface (hundreds of settings) rather than the curated subset relevant to
tenant admins.

This decision requires an ADR per Constitution Rule 5: it introduces a new
integration pattern with the Keycloak Admin REST API for runtime configuration
(not just provisioning), affects the authentication subsystem, and establishes
the security boundary for admin API access.

## Options Considered

### Option A: Direct Keycloak Admin Console Access

- **Description**: Give tenant admins a link to the Keycloak Admin Console
  for their realm. Provide documentation on which settings to change.
- **Pros**:
  - Zero development effort — Keycloak UI already exists
  - Full coverage of all Keycloak settings
- **Cons**:
  - Poor UX — the Keycloak Admin Console is complex and unfamiliar to
    non-technical tenant admins
  - No ABAC integration — Keycloak has its own authorization model that
    does not respect Plexica's tenant role hierarchy
  - No audit trail in Plexica's audit log (DR-08)
  - Exposes hundreds of settings that could break the realm if
    misconfigured (e.g., changing the client ID, disabling the OIDC flow)
  - Cannot implement lockout prevention (edge case #7 in Spec 003)
  - Requires granting realm-admin access in Keycloak to tenant admins,
    which is a privilege escalation risk
- **Effort**: Low

### Option B: Keycloak Admin REST API via Plexica Backend (Chosen)

- **Description**: Plexica exposes a curated set of API endpoints that
  translate tenant admin requests into Keycloak Admin REST API calls. The
  backend acts as a controlled proxy, validating and constraining the
  operations to safe configurations.
- **Pros**:
  - Curated UX — only expose the settings that are safe and relevant
  - Full ABAC integration — only tenant admins can access these endpoints
  - Full audit logging — every change is recorded in the tenant audit log
  - Lockout prevention — the backend validates changes before applying
    (e.g., rejects disabling all login methods)
  - Uses the existing `keycloak-admin.ts` module pattern (raw `fetch` with
    cached admin token)
  - No new npm dependency required — extends the existing HTTP client
- **Cons**:
  - Development effort for the proxy layer (4 setting categories)
  - Must track Keycloak Admin API contract across Keycloak version upgrades
  - Must handle Keycloak Admin API error responses and translate them to
    user-friendly error messages
- **Effort**: Medium

### Option C: Keycloak Operator / Helm Config-as-Code

- **Description**: Manage realm configuration declaratively via Keycloak
  Operator CRDs (Kubernetes) or Helm values that are applied on
  deployment.
- **Pros**:
  - Infrastructure-as-code approach — version-controlled, reproducible
  - GitOps compatible
- **Cons**:
  - Not self-service — requires infrastructure access or a deployment
    pipeline to change auth settings
  - Minutes-to-hours latency for changes (deploy cycle)
  - Requires Kubernetes — not compatible with Docker Compose dev
    environment
  - Cannot implement per-tenant runtime configuration without generating
    per-tenant CRD manifests
  - Completely inappropriate for a SaaS product where tenant admins
    expect real-time configuration
- **Effort**: High (infrastructure + operator setup)

## Decision

**Chosen option**: Option B — Keycloak Admin REST API via Plexica Backend

**Rationale**: This is the only option that satisfies all requirements:
self-service configuration from the Plexica UI, ABAC-enforced access control,
audit logging, and lockout prevention. It extends the existing `keycloak-admin.ts`
pattern without introducing new dependencies.

### Implementation Approach

**1. Extend `keycloak-admin.ts` (existing module)**

The existing module already has `getAdminToken()` and `adminRequest()` functions
that handle Keycloak Admin REST API authentication. The new realm configuration
functions will use these same primitives:

```
// New exports from keycloak-admin.ts or a new keycloak-realm-config.ts
getRealmMfaConfig(realmName)        → GET  /admin/realms/{realm}/authentication/required-actions
updateRealmMfaConfig(realmName, …)  → PUT  /admin/realms/{realm} (requiredActions field)
getRealmIdps(realmName)             → GET  /admin/realms/{realm}/identity-provider/instances
addRealmIdp(realmName, idpConfig)   → POST /admin/realms/{realm}/identity-provider/instances
removeRealmIdp(realmName, alias)    → DELETE /admin/realms/{realm}/identity-provider/instances/{alias}
getRealmPasswordPolicy(realmName)   → GET  /admin/realms/{realm} (passwordPolicy field)
updateRealmPasswordPolicy(…)        → PUT  /admin/realms/{realm} (passwordPolicy field)
getRealmSessionConfig(realmName)    → GET  /admin/realms/{realm} (ssoSessionIdleTimeout, etc.)
updateRealmSessionConfig(…)         → PUT  /admin/realms/{realm} (session timeout fields)
```

**2. No `@keycloak/keycloak-admin-client` dependency**

The existing codebase uses raw `fetch` with the Keycloak Admin REST API
(see `keycloak-admin.ts` lines 57–67). This avoids a ~2MB dependency that
wraps the same HTTP calls. The raw approach gives full control over error
handling, keeps the dependency footprint minimal, and aligns with the
existing code pattern. Per Constitution Rule 5 and AGENTS.md, adding
`@keycloak/keycloak-admin-client` would itself require an ADR — and the
benefit does not justify the cost when the raw API client already exists.

**3. Credential scoping**

The existing `KEYCLOAK_ADMIN_USER` / `KEYCLOAK_ADMIN_PASSWORD` credentials
authenticate against the master realm's `admin-cli` client. These credentials
have global admin access by default. For FR-022 operations, the backend must:

- Validate that the calling user is a `tenant_admin` for the target tenant
  (ABAC enforcement)
- Only call Keycloak Admin API endpoints scoped to the tenant's realm
  (`/admin/realms/{tenant-realm}/...`)
- Never expose the admin credentials to the frontend

The current global admin credentials are acceptable for the initial
implementation because Keycloak's Admin REST API is only accessible from the
backend (not exposed to the network). For production hardening, a dedicated
service account with per-realm admin privileges (not global admin) should be
created — tracked as a follow-up action.

**4. Lockout prevention**

Before applying MFA or IdP changes, the backend validates:

- At least one login method remains enabled
- If MFA is being enabled, at least one MFA method is configured
- If all IdPs are being removed, password-based login is still available

Changes that would lock out all users are rejected with a descriptive error
before any Keycloak API call is made.

**5. Audit logging**

Every realm configuration change is written to the tenant's `audit_log`
table (per DR-08) with:

- `action_type`: `auth_config_changed`
- `target_type`: `realm_config`
- `before_value`: previous setting (JSONB)
- `after_value`: new setting (JSONB)
- Actor, timestamp, IP address

## Consequences

### Positive

- Tenant admins can configure auth settings without leaving the Plexica UI
- All changes are ABAC-protected and audit-logged
- Lockout prevention protects against admin misconfiguration
- No new npm dependencies — extends existing code patterns
- Curated settings prevent accidental realm breakage (only safe settings
  exposed)

### Negative

- Must maintain a mapping between Plexica's simplified auth settings model
  and the Keycloak Admin REST API contract — this is a coupling surface
  that must be tested against Keycloak version upgrades
- IdP configuration (SAML/OIDC) is inherently complex — the UI must guide
  admins through certificate uploads, metadata URLs, claim mappings
- Keycloak Admin API has no built-in rate limiting — a compromised tenant
  admin token could flood the API. Mitigated by application-level rate
  limiting on the auth config endpoints (see follow-up TD-002 for
  `@fastify/rate-limit`)

### Neutral

- No new environment variables required — `KEYCLOAK_ADMIN_USER` and
  `KEYCLOAK_ADMIN_PASSWORD` are already used by the provisioning flow
- The existing `keycloak-admin.ts` module grows in scope — may need to
  be split into `keycloak-provisioning.ts` and `keycloak-realm-config.ts`
  to respect the 200-line limit (Constitution Rule 4)

## Constitution Alignment

| Article                    | Alignment | Notes                                                          |
| -------------------------- | --------- | -------------------------------------------------------------- |
| Rule 1 (E2E)               | Compliant | FR-022 has a defined E2E test (AC-12)                          |
| Rule 3 (One pattern)       | Compliant | Extends existing raw `fetch` pattern; no competing HTTP client |
| Rule 4 (200 LOC)           | Compliant | Module will be split if it exceeds 200 lines                   |
| Rule 5 (ADR for auth)      | Compliant | This ADR documents the decision before implementation          |
| §Security-2 (Auth)         | Compliant | ABAC enforces tenant_admin role before any config change       |
| §Security-4 (Input)        | Compliant | All configuration input validated via Zod schemas              |
| §Security-5 (Secrets)      | Compliant | Admin credentials in env vars only; never exposed to frontend  |
| §Security-6 (PII)          | Compliant | No PII in audit log entries; actor identified by user ID       |
| §Tech Stack (Keycloak 26+) | Compliant | Uses the standard Keycloak 26+ Admin REST API                  |

## Risks

| ID   | Risk                                           | Impact | Likelihood | Mitigation                                                             |
| ---- | ---------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------- |
| R-01 | Keycloak Admin API contract change on upgrade  | HIGH   | LOW        | Pin Keycloak major version; integration tests verify API contract      |
| R-02 | Admin credentials too broadly scoped           | MEDIUM | MEDIUM     | Follow-up: create per-realm service account for production             |
| R-03 | IdP misconfiguration breaks tenant login       | HIGH   | MEDIUM     | Validation preview before applying; test IdP connection before saving  |
| R-04 | Keycloak Admin API unavailability              | MEDIUM | LOW        | Circuit breaker pattern; graceful error on config page if unavailable  |
| R-05 | Concurrent config changes from multiple admins | LOW    | LOW        | Optimistic concurrency via realm representation `version` field (ETag) |

## Follow-Up Actions

- [ ] Implement `keycloak-realm-config.ts` module with MFA, IdP, password
      policy, and session config functions
- [ ] Create API endpoints in the `auth` module: `GET/PUT /api/tenants/:slug/auth-config`
- [ ] Add Zod schemas for all auth configuration input
- [ ] Add lockout prevention validation logic
- [ ] Write integration tests against real Keycloak
- [ ] Write E2E test for AC-12 (MFA toggle flow)
- [ ] Audit log integration for all config changes
- [ ] (Production hardening) Create per-realm service account to replace
      global admin credentials for realm config operations
- [ ] Split `keycloak-admin.ts` if combined module exceeds 200 lines

---

## Lifecycle

```
Proposed  -->  Accepted  -->  [Deprecated | Superseded by ADR-NNN]
```

This ADR was accepted on 2026-04-03. It extends ADR-002 (Keycloak Multi-Realm)
with post-provisioning realm configuration capabilities.
