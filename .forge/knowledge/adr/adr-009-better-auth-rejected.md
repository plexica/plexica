# ADR-009: Better Auth Evaluated and Rejected

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Better Auth is a modern, lightweight JavaScript authentication library. It was evaluated as a potential replacement for Keycloak to reduce infrastructure complexity — no separate auth server, no JVM process, pure TypeScript. A thorough evaluation was conducted across 3 scenarios and 12 dimensions (documented in `docs/05-VALUTAZIONE-BETTER-AUTH.md`).

## Decision

Reject Better Auth. Continue with Keycloak (ADR-002).

### Key Rejection Reason — Circular Dependency with Schema-Per-Tenant

Better Auth stores user data in the application database. In Plexica's schema-per-tenant architecture (ADR-001), this creates an unsolvable circular dependency:

1. User sends login request.
2. System needs to authenticate user — needs to query the user table.
3. User table is in a tenant schema — needs to know which tenant.
4. Tenant is determined from the authenticated user's token.

Workarounds (shared auth schema, tenant-from-subdomain) all compromise the clean schema-per-tenant isolation that is a core architectural principle.

With Keycloak: user authenticates against a Keycloak realm (external to the application database) and receives a JWT containing realm/tenant information. The core routes to the correct tenant schema using the token claims. No circular dependency.

### Other Rejection Reasons

- **No enterprise SAML support**: Critical for B2B SaaS customers with corporate identity providers.
- **No built-in MFA management UI**: Keycloak provides full self-service MFA enrollment and recovery.
- **No battle-tested enterprise track record**: Keycloak is Red Hat-backed and a CNCF project. Better Auth is community-driven with a shorter production history.
- **Missing admin tooling**: User management, session management, password policies, and brute-force protection would all require custom implementation.

### What Better Auth Does Well (Acknowledged)

- Simpler setup for single-tenant applications.
- Lower infrastructure footprint (no JVM, no separate server).
- TypeScript-native with good developer experience.
- Growing ecosystem of auth adapters.

These advantages do not outweigh the fundamental architectural incompatibility with schema-per-tenant multi-tenancy.

## Consequences

### Positive

- Keycloak provides a proven, enterprise-grade auth solution out of the box.
- No circular dependency — clean separation between identity and tenant data.
- SAML, OIDC, MFA, user federation, and admin UI available immediately.

### Negative

- Must operate Keycloak infrastructure (~512MB RAM baseline, JVM tuning required).
- Realm provisioning adds complexity to tenant onboarding.
- Keycloak version upgrades require testing against the admin SDK.

### Risks

- **Keycloak operational overhead**: Mitigate with containerized deployment, health checks, and automated realm provisioning scripts.
- **Keycloak API breaking changes on major upgrades**: Mitigate by pinning the Keycloak Admin SDK version and testing upgrades in staging before production rollout.

## Alternatives Considered

### Better Auth (with Shared Auth Schema)

- Store all user credentials in a shared `auth` schema outside tenant schemas, bypassing the circular dependency.
- Rejected: violates schema-per-tenant isolation (ADR-001). Introduces a shared schema that must be carefully secured and creates an exception to the core data architecture.

### Better Auth (with Subdomain-Based Tenant Resolution)

- Determine tenant from the request subdomain before authentication, then query the correct tenant schema.
- Rejected: couples authentication to URL structure, breaks for API clients without subdomain context, and still requires custom SAML/MFA implementation.

### Auth0 / Clerk (Managed Auth SaaS)

- Offload authentication entirely to a managed service.
- Rejected: vendor lock-in for a critical security component, per-MAU pricing scales poorly for multi-tenant platforms, limited customization of login flows and tenant realm mapping.
