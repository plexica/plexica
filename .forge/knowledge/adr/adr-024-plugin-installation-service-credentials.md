# ADR-024: Plugin Installation Service Credentials

> Architectural Decision Record for PR #77 security remediation.

| Field | Value |
| --- | --- |
| Status | Accepted |
| Author | forge-architect |
| Date | 2026-07-23 |
| Deciders | Plexica Team |

**Driver**: Spec 004 004-16, 004-21, DR-13, DR-20; PR #77 security review
**Related**: ADR-013, ADR-017, ADR-019, ADR-023

## Context

Plugin backends need a non-user identity to call narrowly scoped core endpoints,
starting with custom event emission. A deterministic platform-wide HMAC token
has no per-install random secret, expiry, durable revocation, rotation state, or
database ownership. Compromise of the signing secret compromises every
installation, and deleting or suspending one tenant cannot revoke only that
installation.

The credential must be installation-scoped, bind the tenant and plugin event
namespace, survive horizontal core replicas, be deliverable to sidecar/Kubernetes
runtimes, and never require plaintext persistence.

## Options Considered

### Option A: Deterministic platform HMAC token

- **Pros**: Stateless; no database lookup.
- **Cons**: Global blast radius; no targeted expiry/revocation/rotation; no
  random installation secret.
- **Effort**: Low.

### Option B: Keycloak confidential client per installation

- **Pros**: Standard client-credentials JWT and Keycloak lifecycle controls.
- **Cons**: Client proliferation in every tenant realm; installation depends on
  Keycloak control-plane availability; namespace/install status still requires
  a platform lookup; Keycloak secret retrieval complicates hash-only handling.
- **Effort**: High.

### Option C: Opaque random installation credential with hash-only persistence

- **Pros**: Small blast radius; immediate targeted revocation; no recoverable
  API secret in PostgreSQL; no new identity infrastructure.
- **Cons**: One indexed database verification per service request; runtime
  recreation requires rotation because plaintext cannot be recovered.
- **Effort**: Medium.

## Decision

**Chosen option**: Option C.

1. Create one or more versioned credentials per plugin installation in
   `core.plugin_service_credentials`. A presented token is
   `plxsvc_<credentialId>.<secret>`, where `secret` is 32 random bytes encoded
   base64url and shown/injected once.
2. Persist only an HMAC-SHA-256 digest of `credentialId || secret`, keyed by a
   production-required `PLUGIN_CREDENTIAL_PEPPER`. Persist tenant ID, install
   ID, plugin ID/slug, fixed scope, status, version, expiry, and lifecycle
   timestamps. Never persist plaintext in `envOverrides`, logs, API responses,
   audit metadata, or container state records.
3. Initial scope is exactly `events:emit`. Authentication resolves the
   credential in `core`, constant-time verifies the digest, requires `active`
   and unexpired state, requires the tenant to be active, and confirms the
   tenant-schema installation is active/degraded and matches `installId`,
   `pluginId`, and tenant ID.
4. For `events:emit`, the event namespace must equal the stored plugin slug
   (`plugin.{pluginSlug}.*`). Caller-provided tenant/install/slug values never
   override the credential binding.
5. Credentials expire after 90 days and rotate no later than day 75. Rotation
   creates a new random credential, injects it into a replacement runtime,
   health-checks the replacement, then revokes the old credential. Overlap is
   bounded to five minutes. Failed rotation revokes the new credential and
   leaves the old one only if it is still valid.
6. Manual revoke is immediate. Suspension denies the credential through the
   tenant-status gate even if its row remains active. Uninstall and
   `event_data_purge` revoke/delete all installation or tenant credentials.
7. Runtime restart cannot decrypt an old secret; it rotates and injects a new
   credential. Sidecar uses process environment at launch; Kubernetes uses a
   generated, installation-specific Secret mounted only into that pod.

## Consequences

### Positive

- Compromise is limited to one installation and one scope.
- Expiry, revocation, rotation, namespace binding, and tenant purge are durable
  and auditable without retaining a readable secret.
- No new external service or package is introduced.

### Negative

- Service authentication performs core and tenant state lookups and fails
  closed when PostgreSQL is unavailable.
- Runtime recreation always requires credential rotation.
- A short controlled overlap exists during successful rotation.

### Neutral

- User-facing plugin proxy calls continue to use user JWT + ABAC.
- Restricted PostgreSQL credentials remain governed separately by ADR-017.

## Migration and Rollout

Add the credential table and pepper configuration first. For every active or
degraded installation, create and inject a new credential and restart/roll the
runtime. Verify event emission, then remove deterministic HMAC acceptance and
its global secret. Installations that cannot rotate become `degraded`; no legacy
fallback remains. Rollback must revoke newly issued credentials only after the
plugin runtime is stopped and must not re-enable deterministic global tokens.

## Security and GDPR

- Secret generation uses `node:crypto.randomBytes(32)`; comparison is
  constant-time. Generic 401/403 responses reveal neither credential existence
  nor tenant state.
- Rate limiting applies per credential ID and endpoint. Logs include install ID
  and reason code only, never token, digest, tenant slug, or payload.
- Tenant deletion revokes credentials before schema/key deletion and removes
  credential rows by `tenant_id`; no service secret remains in retained records.

## Constitution Alignment

| Article | Alignment | Notes |
| --- | --- | --- |
| Rule 1 / Testing | Compliant | Requires real-stack install, rotate, revoke, expiry, namespace, and deletion tests. |
| Rule 5 / ADR | Compliant | New auth mechanism and core table are documented before build. |
| Architecture: plugins | Compliant | Preserves HTTP plugin backends and installation isolation. |
| Security: authentication | Improved | Replaces a global deterministic token with scoped credentials. |
| Security: secrets | Compliant | Random secret is one-time and hash-only at rest. |

## Follow-Up Actions

- [x] Accept this ADR before implementation begins (accepted 2026-07-23).
- [ ] Implement the migration and rotation/revocation E2E gates in the PR #77 remediation plan.

## Lifecycle

```text
Proposed --> Accepted --> [Deprecated | Superseded by ADR-NNN]
```
