# ADR-002: Keycloak Multi-Realm Authentication

**Date**: March 2026
**Status**: Accepted
**Deciders**: Plexica Team

## Context

Plexica v2 needs authentication and identity management for a multi-tenant platform. Each tenant may require different authentication mechanisms — enterprise tenants need SAML and OIDC federation, others need social login or MFA. The auth system must work cleanly with schema-per-tenant (ADR-001), where the tenant must be identified *before* any database routing occurs.

## Decision

Use **Keycloak with realm-per-tenant**. Each tenant gets its own Keycloak realm (e.g., `plexica-acme`, `plexica-globex`). A master realm handles super-admin access to the platform.

Key implementation details:

- Tenant context is extracted from the JWT token's realm — this happens before any database call, solving the auth-before-routing problem
- The core backend validates tokens against the appropriate realm using Keycloak's OIDC discovery endpoints
- Realm provisioning is part of the tenant onboarding workflow, creating default roles (`admin`, `member`) and client configurations
- Each realm can independently configure identity providers, MFA policies, and password rules
- Super-admin operations use the master realm with a dedicated `plexica-admin` client

## Consequences

### Positive

- Enterprise-grade SSO out of the box — SAML 2.0, OIDC, social login, MFA all supported per-realm
- Per-tenant auth configuration without any custom code
- Clean separation from the data layer — no circular dependency between auth and database routing
- Battle-tested at scale — Keycloak is used in production by organizations with thousands of realms
- Proven in v1 — the team has operational experience with Keycloak

### Negative

- Heavy infrastructure dependency — Keycloak requires ~512MB RAM minimum and a dedicated PostgreSQL database
- Realm provisioning adds 3-8 seconds to tenant onboarding
- Keycloak Admin API is verbose and requires careful error handling
- Adds operational burden: Keycloak itself must be monitored, backed up, and upgraded

### Risks

- **Version upgrades**: Keycloak major version upgrades can introduce breaking changes to realm export formats and API contracts. Mitigated by pinning to a specific major version and testing upgrades in a staging environment before rollout.
- **Realm count scaling**: Hundreds of realms increase Keycloak memory usage and startup time. Mitigated by Keycloak clustering (Infinispan) and lazy realm loading.
- **Single point of failure**: If Keycloak is down, no user can authenticate. Mitigated by running Keycloak in HA mode with at least two replicas behind a load balancer.

## Alternatives Considered

### Better Auth (Lightweight JS Auth Library)

- A JavaScript-native auth library that stores users in the application database.
- Evaluated in depth (see ADR-009 for full analysis). Rejected because: it stores user credentials in the app database, creating a circular dependency with schema-per-tenant — the system needs to know the tenant to route to the correct schema, but needs the schema to look up the user. Also lacks enterprise SAML support, mature MFA, and per-tenant identity provider configuration.

### Auth0 / Clerk (SaaS Auth Providers)

- Managed authentication services with tenant isolation via organizations.
- Rejected because: vendor lock-in on a critical path, per-MAU pricing doesn't scale predictably, limited control over tenant isolation boundaries, and data residency constraints for GDPR compliance.

### Custom Authentication System

- Build auth from scratch using JWT, bcrypt, and custom SAML/OIDC integrations.
- Rejected because: building enterprise-grade auth (SAML, OIDC, MFA, account linking, brute-force protection, password policies) would take months and introduce security risk. Keycloak already provides all of this.
